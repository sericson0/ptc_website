#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { applyDraftToSite, discoverUnits, formatDuration, slugify, updateGeneratedYouTubeId } from "./lib/site-content.mjs";
import { createLessonDraft, transcribeChunk } from "./lib/openai-workflow.mjs";
import { createLessonDraftWithSubscription, subscriptionStatus, transcribeLocally } from "./lib/subscription-workflow.mjs";
import { addVideoToPlaylist, getYouTubeAccessToken, playlistIdFromUrl, uploadPrivateVideo } from "./lib/youtube.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORK_ROOT = path.join(ROOT, ".ptc-work");
const AUDIO_CHUNK_SECONDS = 15 * 60;

export function aiProvider() {
  const provider = String(process.env.PTC_AI_PROVIDER || "subscription").trim().toLowerCase();
  if (!["subscription", "api"].includes(provider)) {
    throw new Error("PTC_AI_PROVIDER must be either subscription or api.");
  }
  return provider;
}

function printHelp() {
  console.log(`PTC video-to-lesson workflow

Usage:
  node tools/video-pipeline.mjs "C:\\path\\to\\lesson.mp4"
  node tools/video-pipeline.mjs --resume .ptc-work/<job>/draft.json

The first command transcribes and prepares a local draft. Nothing is uploaded
or added to the website until you review that draft and explicitly approve it.`);
}

export async function loadDotEnv(filePath) {
  let source;
  try { source = await fs.readFile(filePath, "utf8"); } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

export function requireCommand(command) {
  const probe = spawnSync(command, ["-version"], { windowsHide: true, stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    throw new Error(`${command} is required but was not found on PATH.`);
  }
}

async function askNonEmpty(rl, question, defaultValue = "") {
  while (true) {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    if (answer) return answer;
    if (defaultValue) return defaultValue;
    console.log("Please enter a value.");
  }
}

async function yesNo(rl, question, defaultYes = false) {
  const hint = defaultYes ? "Y/n" : "y/N";
  while (true) {
    const answer = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    if (["y", "yes"].includes(answer)) return true;
    if (["n", "no"].includes(answer)) return false;
    console.log("Please answer y or n.");
  }
}

export async function videoDuration(videoPath) {
  const json = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "json", videoPath,
  ], { capture: true });
  const duration = Number(JSON.parse(json)?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("ffprobe could not determine the video duration.");
  return duration;
}

export async function extractAudio(videoPath, jobDir, onProgress = () => {}) {
  const audioDir = path.join(jobDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  const pattern = path.join(audioDir, "chunk-%03d.mp3");
  console.log("\nExtracting speech audio with ffmpeg...");
  onProgress({ phase: "audio", message: "Extracting speech audio…", percent: 8 });
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-stats", "-y",
    "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k",
    "-f", "segment", "-segment_time", String(AUDIO_CHUNK_SECONDS), "-reset_timestamps", "1",
    pattern,
  ]);
  const files = (await fs.readdir(audioDir))
    .filter((file) => /^chunk-\d+\.mp3$/.test(file))
    .sort()
    .map((file) => path.join(audioDir, file));
  if (!files.length) throw new Error("ffmpeg did not produce any audio chunks.");
  return files;
}

function clock(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

export async function transcribe(audioFiles, jobDir, onProgress = () => {}) {
  const provider = aiProvider();
  const model = provider === "subscription"
    ? process.env.PTC_LOCAL_WHISPER_MODEL || "small.en"
    : process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
  const timeline = [];
  const results = new Array(audioFiles.length);
  const missing = [];
  for (let index = 0; index < audioFiles.length; index += 1) {
    const cachePath = path.join(jobDir, `transcript-${String(index).padStart(3, "0")}.json`);
    try {
      results[index] = JSON.parse(await fs.readFile(cachePath, "utf8"));
      console.log(`Using cached transcription ${index + 1}/${audioFiles.length}...`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(index);
    }
  }

  if (missing.length && provider === "subscription") {
    console.log(`Transcribing ${missing.length} audio part(s) locally with Whisper ${model}...`);
    onProgress({ phase: "transcription", message: `Transcribing locally with Whisper ${model}…`, percent: 15 });
    const localResults = await transcribeLocally({
      audioFiles: missing.map((index) => audioFiles[index]),
      root: ROOT,
      model,
    });
    for (let resultIndex = 0; resultIndex < missing.length; resultIndex += 1) {
      results[missing[resultIndex]] = localResults[resultIndex];
    }
  } else if (missing.length) {
    for (const index of missing) {
      console.log(`Transcribing audio ${index + 1}/${audioFiles.length} with ${model}...`);
      results[index] = await transcribeChunk(audioFiles[index], process.env.OPENAI_API_KEY, model);
    }
  }

  for (let index = 0; index < audioFiles.length; index += 1) {
    const result = results[index];
    if (missing.includes(index)) {
      const cachePath = path.join(jobDir, `transcript-${String(index).padStart(3, "0")}.json`);
      await fs.writeFile(cachePath, JSON.stringify(result, null, 2) + "\n", "utf8");
    }
    onProgress({
      phase: "transcription",
      message: `Transcribed audio part ${index + 1} of ${audioFiles.length}`,
      percent: 15 + Math.round(((index + 1) / audioFiles.length) * 40),
    });
    const offset = index * AUDIO_CHUNK_SECONDS;
    if (Array.isArray(result.segments) && result.segments.length) {
      for (const segment of result.segments) {
        const start = offset + Number(segment.start || 0);
        const end = offset + Number(segment.end || segment.start || 0);
        timeline.push(`[${clock(start)}-${clock(end)}] ${String(segment.text || "").trim()}`);
      }
    } else {
      timeline.push(`[${clock(offset)}] ${String(result.text || "").trim()}`);
    }
  }
  const transcript = timeline.filter((line) => !line.endsWith("] ")).join("\n");
  await fs.writeFile(path.join(jobDir, "transcript.txt"), transcript + "\n", "utf8");
  return { transcript, model };
}

async function uniquePublishedImagePath(baseName) {
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const candidate = path.join(ROOT, "images", suffix === 1 ? `${baseName}.jpg` : `${baseName}-${suffix}.jpg`);
    try { await fs.access(candidate); } catch { return candidate; }
  }
  throw new Error(`Could not choose a unique image name for ${baseName}`);
}

export async function extractImages(videoPath, lesson, duration, jobDir, onProgress = () => {}) {
  const stillsDir = path.join(jobDir, "stills");
  await fs.mkdir(stillsDir, { recursive: true });
  let pointNumber = 0;
  for (const section of lesson.sections || []) {
    for (const point of section.points || []) {
      pointNumber += 1;
      const base = `${slugify(lesson.title)}-${String(pointNumber).padStart(2, "0")}`;
      const imagePath = path.join(stillsDir, `${base}.jpg`);
      const timestamp = Math.min(Math.max(Number(point.timeSeconds) + 0.35 || 0, 0), Math.max(duration - 0.1, 0));
      console.log(`Extracting image ${pointNumber} at ${clock(timestamp)}...`);
      const actualTimestamp = await extractStill(videoPath, timestamp, imagePath);
      point.timeSeconds = actualTimestamp;
      point.stagedImage = path.relative(ROOT, imagePath).replaceAll(path.sep, "/");
      onProgress({ phase: "images", message: `Extracted teaching still ${pointNumber}`, percent: Math.min(95, 78 + pointNumber * 2) });
    }
  }
}

export async function extractStill(videoPath, timestamp, imagePath) {
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  const requested = Math.max(0, Number(timestamp) || 0);
  const attempts = [...new Set([requested, requested - 1, requested - 3, requested - 5].map((value) => Math.max(0, value)))];
  let lastError;
  for (const attempt of attempts) {
    await fs.rm(imagePath, { force: true });
    try {
      await run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-ss", String(attempt), "-i", videoPath,
        "-frames:v", "1",
        "-vf", "scale=1280:-2:force_original_aspect_ratio=decrease:out_range=full,format=yuvj420p",
        "-threads", "1", "-q:v", "3", "-update", "1", imagePath,
      ], { capture: true });
      const stats = await fs.stat(imagePath);
      if (stats.size > 0) return attempt;
      lastError = new Error("FFmpeg reached the end of the video without finding a frame.");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not extract a still near ${clock(requested)}. ${lastError?.message || "No video frame was available."}`);
}

export async function publishImages(draft) {
  let pointNumber = 0;
  const workRoot = path.resolve(WORK_ROOT) + path.sep;
  for (const section of draft.lesson.sections || []) {
    for (const point of section.points || []) {
      pointNumber += 1;
      if (point.image || !point.stagedImage) continue;
      const source = path.resolve(ROOT, point.stagedImage);
      if (!source.startsWith(workRoot)) throw new Error(`Staged image is outside .ptc-work: ${point.stagedImage}`);
      const base = `${slugify(draft.lesson.title)}-${String(pointNumber).padStart(2, "0")}`;
      const destination = await uniquePublishedImagePath(base);
      await fs.copyFile(source, destination);
      point.image = path.relative(ROOT, destination).replaceAll(path.sep, "/");
    }
  }
}

async function choosePlacement(rl) {
  const units = await discoverUnits(ROOT);
  console.log("\nWhere should this video appear?");
  units.forEach((unit, index) => console.log(`  ${index + 1}. Topic in “${unit.title}” (${unit.lessonCount} lessons)`));
  console.log("  N. New unit / lesson group");
  while (true) {
    const answer = (await rl.question("Choice: ")).trim();
    if (/^n$/i.test(answer)) {
      const unitTitle = await askNonEmpty(rl, "New unit title");
      const unitSummary = await askNonEmpty(rl, "One-sentence unit summary");
      return { type: "new", unitTitle, unitSummary };
    }
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && units[index]) {
      return { type: "existing", relativeFile: units[index].relativeFile, unitTitle: units[index].title };
    }
    console.log("Choose one of the numbers above or N.");
  }
}

function reviewSummary(draft, draftPath) {
  console.log("\n================ REVIEW ================");
  console.log(`Draft file: ${path.relative(ROOT, draftPath)}`);
  console.log(`Website: ${draft.placement.type === "existing" ? `new topic in ${draft.placement.unitTitle}` : `new unit ${draft.placement.unitTitle}`}`);
  console.log(`Lesson: ${draft.lesson.title}`);
  console.log(`YouTube title: ${draft.youtube.title}`);
  console.log(`Playlist: ${draft.youtube.playlistUrl || "none"}`);
  console.log("\nNotes:");
  for (const note of draft.lesson.notes || []) console.log(`  - ${note}`);
  for (const section of draft.lesson.sections || []) {
    console.log(`\n${section.title}:`);
    for (const point of section.points || []) {
      const still = point.image || point.stagedImage;
      console.log(`  - [${clock(point.timeSeconds)}] ${point.text}${still ? ` (${still})` : ""}`);
    }
  }
  if (draft.lesson.practice?.length) {
    console.log("\nPractice:");
    for (const item of draft.lesson.practice) console.log(`  - ${item}`);
  }
  console.log("========================================\n");
}

function openDraftEditor(draftPath) {
  if (process.platform === "win32") {
    return spawnSync("notepad.exe", [draftPath], { stdio: "inherit", windowsHide: false }).status === 0;
  }
  const editor = process.env.EDITOR;
  if (!editor) return false;
  return spawnSync(editor, [draftPath], { stdio: "inherit" }).status === 0;
}

export async function saveDraft(draftPath, draft) {
  await fs.writeFile(draftPath, JSON.stringify(draft, null, 2) + "\n", "utf8");
}

export async function processVideo({
  videoPath,
  placement,
  workingTitle,
  extraContext = "",
  playlistUrl = "",
  madeForKids = false,
  jobDir,
  onProgress = () => {},
}) {
  const provider = aiProvider();
  if (provider === "api" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Copy .env.example to .env and add your key.");
  }
  if (provider === "subscription") {
    const status = subscriptionStatus(ROOT);
    if (!status.ready) throw new Error(status.problem);
  }
  requireCommand("ffmpeg");
  requireCommand("ffprobe");
  const absoluteVideo = path.resolve(videoPath);
  const stats = await fs.stat(absoluteVideo);
  if (!stats.isFile()) throw new Error(`Not a file: ${absoluteVideo}`);
  if (!placement?.type) throw new Error("Choose an existing unit or a new unit.");
  workingTitle ||= path.basename(absoluteVideo, path.extname(absoluteVideo));
  if (playlistUrl && !playlistIdFromUrl(playlistUrl)) throw new Error("That does not look like a YouTube playlist URL or playlist ID.");
  if (!jobDir) {
    const jobName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(workingTitle)}`;
    jobDir = path.join(WORK_ROOT, jobName);
  }
  await fs.mkdir(jobDir, { recursive: true });
  onProgress({ phase: "inspect", message: "Inspecting the video…", percent: 3 });
  const duration = await videoDuration(absoluteVideo);
  const audioFiles = await extractAudio(absoluteVideo, jobDir, onProgress);
  const { transcript, model: transcriptionModel } = await transcribe(audioFiles, jobDir, onProgress);
  console.log("Drafting lesson notes, key points, screenshots, and YouTube copy...");
  onProgress({ phase: "draft", message: "Writing lesson and YouTube copy…", percent: 62 });
  const contentModel = provider === "subscription" ? "Codex (ChatGPT plan)" : process.env.OPENAI_CONTENT_MODEL || "gpt-5-mini";
  const context = [
    `Working title: ${workingTitle}`,
    `Placement: ${placement.type === "existing" ? `a new lesson in the existing unit “${placement.unitTitle}”` : `the first lesson in a new unit “${placement.unitTitle}”`}`,
    extraContext ? `Instructor note: ${extraContext}` : "",
  ].filter(Boolean).join("\n");
  const generated = provider === "subscription"
    ? await createLessonDraftWithSubscription({ transcript, context, root: ROOT, jobDir })
    : await createLessonDraft({ transcript, context, apiKey: process.env.OPENAI_API_KEY, model: contentModel });
  const lesson = {
    title: generated.lessonTitle || workingTitle,
    date: new Date().toISOString().slice(0, 10),
    duration: formatDuration(duration),
    notes: generated.notes,
    sections: generated.sections,
    practice: generated.practice,
    materials: [],
  };
  onProgress({ phase: "images", message: "Selecting teaching stills…", percent: 78 });
  await extractImages(absoluteVideo, lesson, duration, jobDir, onProgress);

  const draft = {
    version: 1,
    createdAt: new Date().toISOString(),
    videoFile: absoluteVideo,
    placement,
    lesson,
    youtube: {
      title: generated.youtubeTitle,
      description: generated.youtubeDescription,
      tags: generated.youtubeTags,
      playlistUrl,
      madeForKids,
      privacyStatus: "private",
    },
    pipeline: { provider, transcriptionModel, contentModel },
  };
  const draftPath = path.join(jobDir, "draft.json");
  await saveDraft(draftPath, draft);
  onProgress({ phase: "review", message: "Draft ready for your review", percent: 100 });
  return { draft, draftPath };
}

async function makeDraft(videoPath, rl) {
  const absoluteVideo = path.resolve(videoPath);
  const placement = await choosePlacement(rl);
  const defaultWorkingTitle = path.basename(absoluteVideo, path.extname(absoluteVideo));
  const workingTitle = await askNonEmpty(rl, "Working lesson title", defaultWorkingTitle);
  const extraContext = (await rl.question("Anything the transcript may miss (names, terminology, audience)? [optional]: ")).trim();
  const defaultPlaylist = process.env.YOUTUBE_PLAYLIST_URL || "";
  const playlistUrl = (await rl.question(`YouTube playlist URL${defaultPlaylist ? ` [${defaultPlaylist}]` : " [optional]"}: `)).trim() || defaultPlaylist;
  const madeForKids = await yesNo(rl, "Is this video made specifically for children?", false);
  return processVideo({ videoPath: absoluteVideo, placement, workingTitle, extraContext, playlistUrl, madeForKids });
}

async function reviewAndApply(initialDraft, draftPath, rl) {
  let draft = initialDraft;
  reviewSummary(draft, draftPath);
  if (await yesNo(rl, "Open draft.json in an editor now?", true)) {
    if (!openDraftEditor(draftPath)) console.log(`Could not open an editor automatically. Edit ${draftPath} directly.`);
    draft = JSON.parse(await fs.readFile(draftPath, "utf8"));
    reviewSummary(draft, draftPath);
  }

  if (!(await yesNo(rl, "Approve this lesson text, YouTube copy, and selected images?", false))) {
    console.log(`Draft kept at ${path.relative(ROOT, draftPath)}. Edit it, then resume with:\nnode tools/video-pipeline.mjs --resume "${draftPath}"`);
    return;
  }

  let accessToken;
  const youtubeToken = async () => {
    const clientSetting = process.env.YOUTUBE_CLIENT_SECRET_FILE;
    if (!clientSetting) throw new Error("YOUTUBE_CLIENT_SECRET_FILE is missing. See tools/README.md for YouTube setup.");
    const clientFile = path.resolve(ROOT, clientSetting);
    const tokenFile = path.join(WORK_ROOT, "youtube-token.json");
    accessToken ||= await getYouTubeAccessToken(clientFile, tokenFile);
    return accessToken;
  };

  if (!draft.youtube.videoId && await yesNo(rl, "Upload the approved video to YouTube as PRIVATE now?", false)) {
    const video = await uploadPrivateVideo({
      videoPath: draft.videoFile,
      title: draft.youtube.title,
      description: draft.youtube.description,
      tags: draft.youtube.tags,
      madeForKids: draft.youtube.madeForKids,
      categoryId: process.env.YOUTUBE_CATEGORY_ID || "27",
      accessToken: await youtubeToken(),
    });
    draft.youtube.videoId = video.id;
    draft.youtube.url = `https://youtu.be/${video.id}`;
    await saveDraft(draftPath, draft);
    console.log(`Private YouTube upload created: ${draft.youtube.url}`);

  }

  const playlistId = playlistIdFromUrl(draft.youtube.playlistUrl);
  if (draft.youtube.videoId && playlistId && !draft.youtube.playlistAdded &&
      await yesNo(rl, "Add the private video to the selected playlist now?", true)) {
    await addVideoToPlaylist({ videoId: draft.youtube.videoId, playlistId, accessToken: await youtubeToken() });
    draft.youtube.playlistAdded = true;
    await saveDraft(draftPath, draft);
    console.log("Added the private video to the selected playlist.");
  }

  if (draft.siteApplied && draft.youtube.videoId && !draft.siteApplied.youtubeVideoId) {
    await updateGeneratedYouTubeId(ROOT, draft.siteApplied, draft.youtube.videoId);
    draft.siteApplied.youtubeVideoId = draft.youtube.videoId;
    await saveDraft(draftPath, draft);
    console.log(`Linked the existing website draft to YouTube video ${draft.youtube.videoId}.`);
  }

  if (!draft.siteApplied && await yesNo(rl, "Apply this approved draft to the website files now?", true)) {
    await publishImages(draft);
    await saveDraft(draftPath, draft);
    const result = await applyDraftToSite(ROOT, draft);
    draft.siteApplied = {
      ...result,
      appliedAt: new Date().toISOString(),
      ...(draft.youtube.videoId ? { youtubeVideoId: draft.youtube.videoId } : {}),
    };
    await saveDraft(draftPath, draft);
    console.log(`Updated ${result.relativeFile} with “${result.lessonTitle}”.`);
    if (!draft.youtube.videoId) console.log("The lesson uses PASTE_VIDEO_ID until you upload the video and replace it.");
  }

  console.log("\nWorkflow complete. Preview index.html, then commit and push when you are satisfied.");
  if (draft.youtube.videoId) console.log("The YouTube video is still private; publish or switch it to unlisted in YouTube Studio when ready.");
}

async function main() {
  await loadDotEnv(path.join(ROOT, ".env"));
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const rl = createInterface({ input, output });
  try {
    if (args[0] === "--resume") {
      if (!args[1]) throw new Error("--resume needs the path to draft.json");
      const draftPath = path.resolve(args[1]);
      const draft = JSON.parse(await fs.readFile(draftPath, "utf8"));
      await reviewAndApply(draft, draftPath, rl);
    } else {
      const { draft, draftPath } = await makeDraft(args[0], rl);
      await reviewAndApply(draft, draftPath, rl);
    }
  } finally {
    rl.close();
  }
}

const directRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) {
  main().catch((error) => {
    console.error(`\nError: ${error.message}`);
    process.exitCode = 1;
  });
}

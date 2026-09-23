#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyDraftToSite, discoverUnits, updateGeneratedYouTubeId } from "./lib/site-content.mjs";
import { publishDraftChanges } from "./lib/repository-publish.mjs";
import { subscriptionStatus } from "./lib/subscription-workflow.mjs";
import { addVideoToPlaylist, getYouTubeAccessToken, playlistIdFromUrl, uploadPrivateVideo, YOUTUBE_MANAGE_SCOPE, YOUTUBE_UPLOAD_SCOPE } from "./lib/youtube.mjs";
import { aiProvider, extractStill, loadDotEnv, processVideo, publishImages, ROOT, saveDraft, WORK_ROOT } from "./video-pipeline.mjs";

const GUI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "gui");
const PORT = Number(process.env.PTC_GUI_PORT || 4173);
const jobs = new Map();
const previewExtractions = new Map();
const repositoryPublishes = new Set();

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function safeJobId(value) {
  return /^[a-zA-Z0-9-]{8,80}$/.test(value || "") ? value : "";
}

function safeFilename(value) {
  const decoded = decodeURIComponent(value || "video.mp4");
  return path.basename(decoded).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-") || "video.mp4";
}

async function readJsonBody(request, limit = 5 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function persistJob(job) {
  const record = {
    id: job.id,
    status: job.status,
    phase: job.phase,
    message: job.message,
    percent: job.percent,
    videoPath: job.videoPath,
    filename: job.filename,
    draftPath: job.draftPath,
    error: job.error,
    updatedAt: new Date().toISOString(),
  };
  await fsp.mkdir(job.jobDir, { recursive: true });
  await fsp.writeFile(path.join(job.jobDir, "gui-state.json"), JSON.stringify(record, null, 2) + "\n", "utf8");
}

async function updateJob(job, changes) {
  Object.assign(job, changes);
  await persistJob(job);
}

async function findJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  const jobDir = path.join(WORK_ROOT, `gui-${id}`);
  try {
    const saved = JSON.parse(await fsp.readFile(path.join(jobDir, "gui-state.json"), "utf8"));
    const job = { ...saved, id, jobDir };
    if (["processing", "approving"].includes(job.status)) {
      job.status = job.draftPath ? "review" : "uploaded";
      job.phase = job.draftPath ? "review" : "upload";
      job.message = job.draftPath ? "Draft recovered after an interrupted operation" : "Video recovered after an interrupted operation";
      job.error = null;
      await persistJob(job);
    }
    jobs.set(id, job);
    return job;
  } catch {
    return null;
  }
}

async function publicJob(job) {
  let draft;
  if (job.draftPath) {
    try { draft = JSON.parse(await fsp.readFile(job.draftPath, "utf8")); } catch { /* still processing */ }
  }
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    message: job.message,
    percent: job.percent || 0,
    filename: job.filename,
    error: job.error,
    draft,
  };
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function serveFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
  try {
    const stats = await fsp.stat(filePath);
    response.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

async function servePreviewStill(response, job, timestamp) {
  if (!Number.isFinite(timestamp) || timestamp < 0) return json(response, 400, { error: "Choose a valid timestamp." });
  const rounded = Math.round(timestamp * 10) / 10;
  const key = `${job.id}:${rounded}`;
  const imagePath = path.join(job.jobDir, "preview-stills", `at-${String(Math.round(rounded * 10)).padStart(6, "0")}.jpg`);
  let extraction = previewExtractions.get(key);
  if (!extraction) {
    extraction = fsp.access(imagePath).catch(async () => {
      await extractStill(job.videoPath, rounded + 0.35, imagePath);
    }).finally(() => previewExtractions.delete(key));
    previewExtractions.set(key, extraction);
  }
  try {
    await extraction;
    return serveFile(response, imagePath);
  } catch (error) {
    return json(response, 500, { error: `Could not preview this frame. ${error.message}` });
  }
}

async function uploadVideo(request, response, id, url) {
  const jobDir = path.join(WORK_ROOT, `gui-${id}`);
  await fsp.mkdir(jobDir, { recursive: true });
  const filename = safeFilename(url.searchParams.get("filename"));
  const videoPath = path.join(jobDir, filename);
  const stream = fs.createWriteStream(videoPath, { flags: "wx" });
  let bytes = 0;
  request.on("data", (chunk) => { bytes += chunk.length; });
  try {
    await new Promise((resolve, reject) => {
      request.pipe(stream);
      request.once("aborted", () => reject(new Error("Upload was cancelled.")));
      request.once("error", reject);
      stream.once("error", reject);
      stream.once("finish", resolve);
    });
    const job = { id, jobDir, videoPath, filename, status: "uploaded", phase: "upload", message: "Video received", percent: 0 };
    jobs.set(id, job);
    await persistJob(job);
    json(response, 201, { id, filename, bytes });
  } catch (error) {
    await fsp.rm(videoPath, { force: true }).catch(() => {});
    json(response, 500, { error: error.message });
  }
}

async function startProcessing(response, job, body) {
  if (job.status === "processing" || job.status === "approving") return json(response, 409, { error: "This job is already running." });
  const units = await discoverUnits(ROOT);
  let placement;
  if (body.placementType === "existing") {
    const unit = units.find((candidate) => candidate.relativeFile === body.relativeFile);
    if (!unit) return json(response, 400, { error: "Choose an existing unit." });
    placement = { type: "existing", relativeFile: unit.relativeFile, unitTitle: unit.title };
  } else {
    if (!String(body.unitTitle || "").trim() || !String(body.unitSummary || "").trim()) {
      return json(response, 400, { error: "A new unit needs a title and summary." });
    }
    placement = { type: "new", unitTitle: String(body.unitTitle).trim(), unitSummary: String(body.unitSummary).trim() };
  }
  await updateJob(job, { status: "processing", phase: "starting", message: "Starting video workflow…", percent: 1, error: null });
  json(response, 202, { ok: true });

  processVideo({
    videoPath: job.videoPath,
    placement,
    workingTitle: String(body.workingTitle || "").trim() || path.basename(job.filename, path.extname(job.filename)),
    extraContext: String(body.extraContext || "").trim(),
    playlistUrl: String(body.playlistUrl || "").trim(),
    madeForKids: Boolean(body.madeForKids),
    jobDir: job.jobDir,
    onProgress(progress) {
      Object.assign(job, progress);
      persistJob(job).catch(() => {});
    },
  }).then(async ({ draftPath }) => {
    await updateJob(job, { draftPath, status: "review", phase: "review", message: "Draft ready for review", percent: 100 });
  }).catch(async (error) => {
    console.error(error);
    await updateJob(job, { status: "error", phase: "error", message: "Processing failed", error: error.message });
  });
}

async function youtubeToken(requiredScopes) {
  const clientSetting = process.env.YOUTUBE_CLIENT_SECRET_FILE;
  if (!clientSetting) throw new Error("YOUTUBE_CLIENT_SECRET_FILE is missing. Add it to .env before uploading to YouTube.");
  const clientFile = path.resolve(ROOT, clientSetting);
  try {
    await fsp.access(clientFile);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`YouTube OAuth setup is incomplete. Download a Desktop app OAuth JSON and save it as ${clientFile}`);
    }
    throw error;
  }
  return getYouTubeAccessToken(clientFile, path.join(WORK_ROOT, "youtube-token.json"), requiredScopes);
}

async function youtubeConfiguration() {
  const clientSetting = process.env.YOUTUBE_CLIENT_SECRET_FILE;
  if (!clientSetting) {
    return { ready: false, problem: "Set YOUTUBE_CLIENT_SECRET_FILE in .env to enable YouTube upload." };
  }
  const clientFile = path.resolve(ROOT, clientSetting);
  try {
    const document = JSON.parse(await fsp.readFile(clientFile, "utf8"));
    const credentials = document.installed || document.web;
    if (!credentials?.client_id || !credentials?.client_secret) {
      return { ready: false, problem: `The OAuth JSON at ${clientFile} is not a valid Google Desktop client file.` };
    }
    return { ready: true, problem: "" };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ready: false, problem: `Download a Google Desktop OAuth JSON and save it as ${clientFile}` };
    }
    if (error instanceof SyntaxError) {
      return { ready: false, problem: `The OAuth file at ${clientFile} is not valid JSON.` };
    }
    throw error;
  }
}

async function approveJob(response, job, body) {
  if (!job.draftPath) return json(response, 409, { error: "This job has no draft to approve." });
  if (job.status === "processing" || job.status === "approving") return json(response, 409, { error: "This job is already running." });
  if (body.uploadYouTube) {
    const youtube = await youtubeConfiguration();
    if (!youtube.ready) return json(response, 400, { error: youtube.problem });
  }
  await updateJob(job, { status: "approving", phase: "approval", message: "Applying approved actions…", percent: 5, error: null });
  json(response, 202, { ok: true });

  (async () => {
    const draft = JSON.parse(await fsp.readFile(job.draftPath, "utf8"));
    const playlistId = playlistIdFromUrl(draft.youtube.playlistUrl);
    const willUpload = body.uploadYouTube && !draft.youtube.videoId;
    const willAddPlaylist = body.addPlaylist && playlistId && !draft.youtube.playlistAdded && (draft.youtube.videoId || willUpload);
    const requiredScopes = [
      ...(willUpload ? [YOUTUBE_UPLOAD_SCOPE] : []),
      ...(willAddPlaylist ? [YOUTUBE_MANAGE_SCOPE] : []),
    ];
    let accessToken;
    if (requiredScopes.length) {
      await updateJob(job, { message: "Waiting for Google authorization…", percent: 15 });
      accessToken = await youtubeToken(requiredScopes);
    }
    if (willUpload) {
      await updateJob(job, { message: "Uploading private video to YouTube…", percent: 30 });
      const video = await uploadPrivateVideo({
        videoPath: draft.videoFile,
        title: draft.youtube.title,
        description: draft.youtube.description,
        tags: draft.youtube.tags,
        madeForKids: draft.youtube.madeForKids,
        categoryId: process.env.YOUTUBE_CATEGORY_ID || "27",
        accessToken,
      });
      draft.youtube.videoId = video.id;
      draft.youtube.url = `https://youtu.be/${video.id}`;
      await saveDraft(job.draftPath, draft);
    }

    if (willAddPlaylist && draft.youtube.videoId) {
      await updateJob(job, { message: "Adding video to playlist…", percent: 78 });
      await addVideoToPlaylist({ videoId: draft.youtube.videoId, playlistId, accessToken });
      draft.youtube.playlistAdded = true;
      await saveDraft(job.draftPath, draft);
    }

    if (body.applySite) {
      await updateJob(job, { message: "Updating website files…", percent: 88 });
      if (draft.siteApplied) {
        if (draft.youtube.videoId && !draft.siteApplied.youtubeVideoId) {
          await updateGeneratedYouTubeId(ROOT, draft.siteApplied, draft.youtube.videoId);
          draft.siteApplied.youtubeVideoId = draft.youtube.videoId;
        }
      } else {
        await publishImages(draft);
        const result = await applyDraftToSite(ROOT, draft);
        draft.siteApplied = {
          ...result,
          appliedAt: new Date().toISOString(),
          ...(draft.youtube.videoId ? { youtubeVideoId: draft.youtube.videoId } : {}),
        };
      }
      await saveDraft(job.draftPath, draft);
    }
    await updateJob(job, { status: "complete", phase: "complete", message: "Approved actions completed", percent: 100 });
  })().catch(async (error) => {
    console.error(error);
    await updateJob(job, { status: "error", phase: "error", message: "Approval action failed", error: error.message });
  });
}

async function publishRepositoryJob(response, job, body) {
  if (!job.draftPath) return json(response, 409, { error: "This job has no draft to publish." });
  if (repositoryPublishes.has(job.id)) return json(response, 409, { error: "A GitHub publish is already running for this lesson." });
  const draft = JSON.parse(await fsp.readFile(job.draftPath, "utf8"));
  if (!draft.siteApplied) return json(response, 409, { error: "Update the website before committing and pushing it." });
  repositoryPublishes.add(job.id);
  try {
    const result = await publishDraftChanges(ROOT, draft, body.commitMessage);
    draft.repository = {
      ...result,
      pushedAt: new Date().toISOString(),
    };
    await saveDraft(job.draftPath, draft);
    return json(response, 200, { ok: true, result, draft });
  } finally {
    repositoryPublishes.delete(job.id);
  }
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${PORT}`}`);
  const origin = request.headers.origin;
  if (origin && ![`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`].includes(origin)) {
    return json(response, 403, { error: "Cross-origin requests are not allowed." });
  }

  if (request.method === "GET" && url.pathname === "/api/config") {
    const units = await discoverUnits(ROOT);
    const youtube = await youtubeConfiguration();
    const provider = aiProvider();
    const ai = provider === "subscription"
      ? subscriptionStatus(ROOT)
      : {
          ready: Boolean(process.env.OPENAI_API_KEY),
          provider: "OpenAI API",
          problem: "Add OPENAI_API_KEY to .env, then restart Video Studio.",
        };
    return json(response, 200, {
      units: units.map((unit) => ({ title: unit.title, relativeFile: unit.relativeFile, lessonCount: unit.lessonCount, hidden: Boolean(unit.hidden) })),
      playlistUrl: process.env.YOUTUBE_PLAYLIST_URL || "",
      aiConfigured: ai.ready,
      aiProvider: ai.provider,
      aiProblem: ai.ready ? "" : ai.problem,
      youtubeConfigured: youtube.ready,
      youtubeProblem: youtube.problem,
    });
  }

  const uploadMatch = /^\/api\/uploads\/([^/]+)$/.exec(url.pathname);
  if (request.method === "PUT" && uploadMatch) {
    const id = safeJobId(uploadMatch[1]);
    if (!id) return json(response, 400, { error: "Invalid job ID." });
    return uploadVideo(request, response, id, url);
  }

  const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(process|draft|approve|image|preview|publish))?$/.exec(url.pathname);
  if (jobMatch) {
    const id = safeJobId(jobMatch[1]);
    const action = jobMatch[2] || "";
    const job = id && await findJob(id);
    if (!job) return json(response, 404, { error: "Job not found." });
    if (request.method === "GET" && !action) return json(response, 200, await publicJob(job));
    if (request.method === "POST" && action === "process") return startProcessing(response, job, await readJsonBody(request));
    if (request.method === "PUT" && action === "draft") {
      const body = await readJsonBody(request);
      if (!body.draft || typeof body.draft !== "object") return json(response, 400, { error: "Draft is required." });
      await saveDraft(job.draftPath, body.draft);
      await updateJob(job, { status: "review", message: "Draft changes saved" });
      return json(response, 200, { ok: true });
    }
    if (request.method === "POST" && action === "approve") return approveJob(response, job, await readJsonBody(request));
    if (request.method === "POST" && action === "publish") return publishRepositoryJob(response, job, await readJsonBody(request));
    if (request.method === "POST" && action === "image") {
      const body = await readJsonBody(request);
      const section = Number(body.section);
      const point = Number(body.point);
      const timestamp = Math.max(0, Number(body.timeSeconds) || 0);
      const draft = JSON.parse(await fsp.readFile(job.draftPath, "utf8"));
      const item = draft.lesson?.sections?.[section]?.points?.[point];
      if (!item) return json(response, 404, { error: "Teaching point not found." });
      const imagePath = path.join(job.jobDir, "stills", `manual-${section + 1}-${point + 1}.jpg`);
      const actualTimestamp = await extractStill(job.videoPath, timestamp + 0.35, imagePath);
      item.timeSeconds = Math.max(0, actualTimestamp - 0.35);
      item.stagedImage = path.relative(ROOT, imagePath).replaceAll(path.sep, "/");
      delete item.image;
      await saveDraft(job.draftPath, draft);
      return json(response, 200, { draft });
    }
    if (request.method === "GET" && action === "preview") {
      return servePreviewStill(response, job, Number(url.searchParams.get("time")));
    }
    if (request.method === "GET" && action === "image") {
      const section = Number(url.searchParams.get("section"));
      const point = Number(url.searchParams.get("point"));
      const draft = JSON.parse(await fsp.readFile(job.draftPath, "utf8"));
      const item = draft.lesson?.sections?.[section]?.points?.[point];
      const relative = item?.image || item?.stagedImage;
      if (!relative) return response.writeHead(404).end("No image");
      const filePath = path.resolve(ROOT, relative);
      const allowed = filePath.startsWith(path.resolve(WORK_ROOT) + path.sep) || filePath.startsWith(path.resolve(ROOT, "images") + path.sep);
      if (!allowed) return response.writeHead(403).end("Forbidden");
      return serveFile(response, filePath);
    }
  }

  if (request.method === "GET") {
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.resolve(GUI_DIR, file);
    if (filePath === GUI_DIR || !filePath.startsWith(GUI_DIR + path.sep)) return response.writeHead(403).end("Forbidden");
    return serveFile(response, filePath);
  }
  response.writeHead(404).end("Not found");
}

await loadDotEnv(path.join(ROOT, ".env"));
await fsp.mkdir(WORK_ROOT, { recursive: true });
const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) json(response, 500, { error: error.message });
    else response.end();
  });
});
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use. Video Studio may already be open.`);
  else console.error(error);
  process.exitCode = 1;
});
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`PTC Video Studio is running at ${url}`);
  console.log("Keep this window open while using the app. Press Ctrl+C to stop it.");
  if (process.env.PTC_GUI_NO_OPEN !== "1") openBrowser(url);
});

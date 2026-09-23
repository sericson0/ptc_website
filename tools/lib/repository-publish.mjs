import path from "node:path";
import { spawn } from "node:child_process";

function git(rootDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: rootDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`Could not run Git. ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `Git exited with code ${code}`).trim()));
    });
  });
}

function safeRelativePath(rootDir, value, requiredFolder = "") {
  const candidate = String(value || "").trim();
  if (!candidate || path.isAbsolute(candidate)) throw new Error(`Invalid repository path: ${candidate || "(empty)"}`);
  const root = path.resolve(rootDir);
  const absolute = path.resolve(root, candidate);
  if (!absolute.startsWith(root + path.sep)) throw new Error(`Repository path leaves the project: ${candidate}`);
  const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
  if (requiredFolder && !relative.startsWith(`${requiredFolder}/`)) {
    throw new Error(`Expected ${candidate} to be inside ${requiredFolder}/`);
  }
  return relative;
}

function localImages(lesson) {
  const points = [
    ...(Array.isArray(lesson?.points) ? lesson.points : []),
    ...(Array.isArray(lesson?.sections) ? lesson.sections.flatMap((section) => section?.points || []) : []),
  ];
  return points.map((point) => point?.image).filter(Boolean);
}

export function workflowFilesFromDraft(rootDir, draft) {
  if (!draft?.siteApplied?.relativeFile) throw new Error("Update the website before committing it.");
  const lessonFile = safeRelativePath(rootDir, draft.siteApplied.relativeFile, "lessons");
  const files = [lessonFile];
  for (const image of localImages(draft.lesson)) files.push(safeRelativePath(rootDir, image, "images"));
  if (draft.placement?.type === "new") files.push("index.html");
  return [...new Set(files)];
}

export async function publishDraftChanges(rootDir, draft, requestedMessage = "") {
  const files = workflowFilesFromDraft(rootDir, draft);
  const branch = await git(rootDir, ["branch", "--show-current"]);
  if (!branch) throw new Error("Git is in detached HEAD mode. Check out a branch before publishing.");
  await git(rootDir, ["remote", "get-url", "origin"]);

  const fallback = `Publish ${String(draft.lesson?.title || "lesson").trim()}`;
  const message = String(requestedMessage || fallback).replace(/\s+/g, " ").trim().slice(0, 120);
  if (!message) throw new Error("Enter a commit message.");

  const status = await git(rootDir, ["status", "--porcelain=v1", "--", ...files]);
  let committed = false;
  if (status) {
    await git(rootDir, ["add", "--", ...files]);
    await git(rootDir, ["commit", "--only", "-m", message, "--", ...files]);
    committed = true;
  }

  const commit = await git(rootDir, ["rev-parse", "HEAD"]);
  await git(rootDir, ["push", "origin", `HEAD:${branch}`]);
  return { committed, pushed: true, commit, branch, files, message };
}

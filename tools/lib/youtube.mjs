import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";

export const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
export const YOUTUBE_MANAGE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const DEFAULT_SCOPES = [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_MANAGE_SCOPE];

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function writePrivateJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
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

async function tokenRequest(params) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`YouTube OAuth failed (${response.status}): ${body.error_description || body.error || response.statusText}`);
  return body;
}

async function authorizeInteractively(credentials, scopes) {
  const state = crypto.randomBytes(24).toString("hex");
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  const timeout = setTimeout(() => {
    rejectCode(new Error("YouTube authorization timed out. Confirm that your Google account is listed under OAuth Audience > Test users, then try again."));
  }, 5 * 60 * 1000);
  const server = http.createServer((request, response) => {
    const current = new URL(request.url, "http://127.0.0.1");
    if (current.pathname !== "/oauth2callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    if (current.searchParams.get("state") !== state) {
      response.writeHead(400).end("OAuth state did not match. You can close this window.");
      rejectCode(new Error("YouTube OAuth state did not match."));
      return;
    }
    const error = current.searchParams.get("error");
    const code = current.searchParams.get("code");
    if (error || !code) {
      response.writeHead(400).end("Authorization was not completed. You can close this window.");
      rejectCode(new Error(`YouTube authorization was not completed${error ? `: ${error}` : "."}`));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<h1>YouTube connected</h1><p>You can close this window and return to the terminal.</p>");
    resolveCode(code);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: credentials.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  console.log("\nOpening Google authorization in your browser...");
  openBrowser(authUrl.toString());

  try {
    const code = await codePromise;
    return await tokenRequest({
      code,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}

function tokenHasScopes(token, requiredScopes) {
  const granted = new Set(String(token?.scope || "").split(/\s+/).filter(Boolean));
  return requiredScopes.every((scope) => granted.has(scope));
}

export async function getYouTubeAccessToken(clientFile, tokenFile, requiredScopes = DEFAULT_SCOPES) {
  const clientDocument = await readJson(clientFile);
  const credentials = clientDocument.installed || clientDocument.web;
  if (!credentials?.client_id || !credentials?.client_secret) {
    throw new Error("The Google OAuth client JSON is missing installed.client_id/client_secret.");
  }

  let token;
  try { token = await readJson(tokenFile); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (token?.access_token && Number(token.expires_at) > Date.now() + 60_000 && tokenHasScopes(token, requiredScopes)) {
    return token.access_token;
  }
  if (token?.refresh_token && tokenHasScopes(token, requiredScopes)) {
    const refreshed = await tokenRequest({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    });
    token = {
      ...token,
      ...refreshed,
      refresh_token: refreshed.refresh_token || token.refresh_token,
      expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000,
    };
    await writePrivateJson(tokenFile, token);
    return token.access_token;
  }

  const granted = await authorizeInteractively(credentials, requiredScopes);
  token = {
    ...granted,
    scope: granted.scope || requiredScopes.join(" "),
    expires_at: Date.now() + (granted.expires_in || 3600) * 1000,
  };
  await writePrivateJson(tokenFile, token);
  return token.access_token;
}

function uploadStream(uploadUrl, videoPath, accessToken, contentType, size) {
  return new Promise((resolve, reject) => {
    const target = new URL(uploadUrl);
    const transport = target.protocol === "http:" ? http : https;
    const request = transport.request(target, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
        "Content-Length": size,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const body = text ? JSON.parse(text) : {};
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(body);
        else reject(new Error(`YouTube upload failed (${response.statusCode}): ${body?.error?.message || text}`));
      });
    });
    request.on("error", reject);
    const stream = fs.createReadStream(videoPath);
    let sent = 0;
    let lastPercent = -1;
    stream.on("data", (chunk) => {
      sent += chunk.length;
      const percent = Math.floor((sent / size) * 100);
      if (percent >= lastPercent + 5 || percent === 100) {
        process.stdout.write(`\rUploading to YouTube: ${String(percent).padStart(3)}%`);
        lastPercent = percent;
      }
    });
    stream.on("error", reject);
    stream.on("end", () => process.stdout.write("\n"));
    stream.pipe(request);
  });
}

export async function uploadPrivateVideo({ videoPath, title, description, tags, madeForKids, categoryId = "27", accessToken }) {
  const stats = await fsp.stat(videoPath);
  const extension = path.extname(videoPath).toLowerCase();
  const mime = extension === ".mov" ? "video/quicktime" : extension === ".webm" ? "video/webm" : "video/mp4";
  const initialize = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(stats.size),
      "X-Upload-Content-Type": mime,
    },
    body: JSON.stringify({
      snippet: { title, description, tags, categoryId: String(categoryId) },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: Boolean(madeForKids) },
    }),
  });
  if (!initialize.ok) {
    const body = await initialize.text();
    throw new Error(`Could not start the YouTube upload (${initialize.status}): ${body}`);
  }
  const uploadUrl = initialize.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL.");
  const video = await uploadStream(uploadUrl, videoPath, accessToken, mime, stats.size);
  if (!video.id) throw new Error("YouTube finished the upload without returning a video ID.");
  return video;
}

export function playlistIdFromUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.searchParams.get("list") || "";
  } catch {
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : "";
  }
}

export async function addVideoToPlaylist({ videoId, playlistId, accessToken }) {
  const response = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Could not add the video to the playlist (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  return body;
}

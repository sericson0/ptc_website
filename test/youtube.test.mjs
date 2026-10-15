import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getYouTubeAccessToken, YOUTUBE_UPLOAD_SCOPE } from "../tools/lib/youtube.mjs";

const scopes = [YOUTUBE_UPLOAD_SCOPE];
const expiredToken = {
  access_token: "old-access",
  refresh_token: "old-refresh",
  scope: scopes.join(" "),
  expires_at: 1,
};

async function fixture(t, token = expiredToken) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ptc-youtube-test-"));
  const clientFile = path.join(dir, "client.json");
  const tokenFile = path.join(dir, "token.json");
  await fs.writeFile(clientFile, JSON.stringify({ installed: { client_id: "test-client", client_secret: "test-secret" } }));
  await fs.writeFile(tokenFile, JSON.stringify(token));
  t.after(async () => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const requests = [];
  const authorizations = [];
  const localFetch = globalThis.fetch;
  let callbackRequest;
  let callbackError;
  t.mock.method(childProcess, "spawn", (_command, args) => {
    const authUrl = new URL(args.at(-1));
    authorizations.push(authUrl);
    const callback = new URL(authUrl.searchParams.get("redirect_uri"));
    callback.searchParams.set("state", authUrl.searchParams.get("state"));
    if (callbackError) callback.searchParams.set("error", callbackError);
    else callback.searchParams.set("code", "new-code");
    callbackRequest = localFetch(callback);
    return { unref() {} };
  });
  syncBuiltinESMExports();
  return {
    requests,
    authorizations,
    tokenFile,
    getToken: () => getYouTubeAccessToken(clientFile, tokenFile, scopes),
    readToken: async () => JSON.parse(await fs.readFile(tokenFile, "utf8")),
    denyAuthorization: () => { callbackError = "access_denied"; },
    callbackStatus: async () => {
      const response = await callbackRequest;
      await response.text();
      return response.status;
    },
    respond: (handler) => t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      const params = Object.fromEntries(options.body);
      requests.push(params);
      return handler(params);
    }),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("YouTube reuses an unexpired access token", async (t) => {
  const f = await fixture(t, { ...expiredToken, expires_at: Date.now() + 3600_000 });
  f.respond(() => assert.fail("A valid token should not need a request"));
  assert.equal(await f.getToken(), "old-access");
  assert.equal(f.authorizations.length, 0);
});

test("YouTube refreshes an expired access token and keeps the refresh token", async (t) => {
  const f = await fixture(t);
  f.respond(() => json({ access_token: "refreshed-access", expires_in: 3600 }));
  assert.equal(await f.getToken(), "refreshed-access");
  assert.equal(f.requests[0].grant_type, "refresh_token");
  assert.equal(f.requests[0].refresh_token, "old-refresh");
  assert.equal((await f.readToken()).refresh_token, "old-refresh");
  assert.equal(f.authorizations.length, 0);
});

test("YouTube reconnects after a revoked refresh token and caches the new grant", async (t) => {
  const f = await fixture(t);
  f.respond((params) => params.grant_type === "refresh_token"
    ? json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)
    : json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }));
  assert.equal(await f.getToken(), "new-access");
  assert.equal(await f.callbackStatus(), 200);
  assert.deepEqual(f.requests.map((params) => params.grant_type), ["refresh_token", "authorization_code"]);
  assert.equal(f.requests[1].code, "new-code");
  assert.equal(f.authorizations.length, 1);
  assert.equal(f.authorizations[0].searchParams.get("scope"), scopes.join(" "));
  assert.equal(f.authorizations[0].searchParams.get("access_type"), "offline");
  const saved = await f.readToken();
  assert.equal(saved.refresh_token, "new-refresh");
  assert.equal(saved.scope, scopes.join(" "));
  assert.ok(saved.expires_at > Date.now() + 3500_000);
  assert.equal(await f.getToken(), "new-access");
  assert.equal(f.requests.length, 2);
});

test("canceling YouTube reconnection preserves the previous token file", async (t) => {
  const f = await fixture(t);
  f.denyAuthorization();
  f.respond(() => json({ error: "invalid_grant" }, 400));
  await assert.rejects(f.getToken(), /authorization was not completed: access_denied/);
  assert.equal(await f.callbackStatus(), 400);
  assert.deepEqual(await f.readToken(), expiredToken);
  assert.equal(f.requests.length, 1);
});

test("YouTube surfaces client and service failures without opening authorization", async (t) => {
  for (const [code, status] of [["invalid_client", 400], ["invalid_grant", 503]]) {
    await t.test(`${status} ${code}`, async (t) => {
      const f = await fixture(t);
      f.respond(() => json({ error: code }, status));
      await assert.rejects(f.getToken(), (error) => error.code === code && error.status === status);
      assert.equal(f.authorizations.length, 0);
      assert.deepEqual(await f.readToken(), expiredToken);
    });
  }
});

test("YouTube surfaces network failures without opening authorization", async (t) => {
  const f = await fixture(t);
  f.respond(() => { throw new TypeError("fetch failed"); });
  await assert.rejects(f.getToken(), /fetch failed/);
  assert.equal(f.authorizations.length, 0);
  assert.deepEqual(await f.readToken(), expiredToken);
});

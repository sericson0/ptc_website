import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexInvocation } from "../tools/lib/codex-cli.mjs";

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "ptc-codex-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const options = { home, platform: "win32", arch: "x64", env: {} };
  async function file(...parts) {
    const filename = path.join(home, ...parts);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, "");
    return filename;
  }
  return { home, options, file };
}

test("Explorer launch finds the newest usable VS Code Codex without PATH", async (t) => {
  const { options, file } = await fixture(t);
  await file(".vscode", "extensions", "openai.chatgpt-26.99.1-win32-x64", "package.json");
  const newest = await file(".vscode", "extensions", "openai.chatgpt-26.10.1-win32-x64", "bin", "windows-x86_64", "codex.exe");
  await file(".vscode", "extensions", "openai.chatgpt-26.9.1-win32-x64", "bin", "windows-x86_64", "codex.exe");
  assert.deepEqual(codexInvocation(options), { command: newest, prefix: [] });
});

test("a native Codex on PATH takes precedence over the VS Code bundle", async (t) => {
  const { options, home, file } = await fixture(t);
  await file(".vscode", "extensions", "openai.chatgpt-26.10.1", "bin", "windows-x86_64", "codex.exe");
  const native = await file("cli with spaces", "codex.exe");
  options.env = { Path: `"${path.join(home, "cli with spaces")}"` };
  assert.deepEqual(codexInvocation(options), { command: native, prefix: [] });
});

test("npm Codex runs through Node instead of a Windows cmd shim", async (t) => {
  const { options, home, file } = await fixture(t);
  await file("npm", "codex.cmd");
  const script = await file("npm", "node_modules", "@openai", "codex", "bin", "codex.js");
  options.env = { PATH: path.join(home, "npm") };
  assert.deepEqual(codexInvocation(options), { command: process.execPath, prefix: [script] });
});

test("ARM64 VS Code Insiders uses the matching bundled executable", async (t) => {
  const { options, file } = await fixture(t);
  const executable = await file(".vscode-insiders", "extensions", "openai.chatgpt-26.10.1", "bin", "windows-aarch64", "codex.exe");
  options.arch = "arm64";
  assert.deepEqual(codexInvocation(options), { command: executable, prefix: [] });
});

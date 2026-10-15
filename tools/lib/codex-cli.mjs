import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isFile(filename) {
  try { return fs.statSync(filename).isFile(); } catch { return false; }
}

// Explorer-launched apps do not inherit VS Code's additions to PATH. Resolve
// the bundled executable directly, and avoid executing Windows .cmd shims.
export function codexInvocation({ env = process.env, platform = process.platform, arch = process.arch, home = os.homedir() } = {}) {
  if (platform !== "win32") return { command: "codex", prefix: [] };

  const searchPath = Object.entries(env).find(([name]) => name.toLowerCase() === "path")?.[1] || "";
  for (const entry of searchPath.split(";").filter(Boolean)) {
    const directory = entry.replace(/^"|"$/g, "");
    const executable = path.join(directory, "codex.exe");
    if (isFile(executable)) return { command: executable, prefix: [] };
    const npmScript = path.join(directory, "node_modules", "@openai", "codex", "bin", "codex.js");
    if (isFile(npmScript)) return { command: process.execPath, prefix: [npmScript] };
  }

  const target = arch === "arm64" ? "windows-aarch64" : "windows-x86_64";
  for (const vscodeDirectory of [".vscode", ".vscode-insiders"]) {
    const extensions = path.join(home, vscodeDirectory, "extensions");
    let names;
    try { names = fs.readdirSync(extensions); } catch { continue; }
    const candidates = names.filter((name) => /^openai\.chatgpt-\d/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const name of candidates) {
      const executable = path.join(extensions, name, "bin", target, "codex.exe");
      if (isFile(executable)) return { command: executable, prefix: [] };
    }
  }
  return { command: "codex", prefix: [] };
}

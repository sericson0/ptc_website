import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { publishDraftChanges, workflowFilesFromDraft } from "../tools/lib/repository-publish.mjs";

function runGit(directory, ...args) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8", windowsHide: true }).trim();
}

test("repository publish is limited to generated lesson files", () => {
  const files = workflowFilesFromDraft(path.resolve("test-project"), {
    placement: { type: "new" },
    siteApplied: { relativeFile: "lessons/04-ochos-and-pivots.js" },
    lesson: {
      sections: [
        { points: [
          { image: "images/ochos-01.jpg" },
          { image: "images/ochos-02.jpg" },
          { image: "images/ochos-01.jpg" },
        ] },
      ],
    },
  });
  assert.deepEqual(files, [
    "lessons/04-ochos-and-pivots.js",
    "images/ochos-01.jpg",
    "images/ochos-02.jpg",
    "index.html",
  ]);
});

test("repository publish rejects paths outside lessons and images", () => {
  assert.throws(() => workflowFilesFromDraft(path.resolve("test-project"), {
    placement: { type: "existing" },
    siteApplied: { relativeFile: "../outside.js" },
    lesson: { sections: [] },
  }), /Invalid repository path|leaves the project|inside lessons/);
});

test("repository publish commits generated files and pushes the current branch", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ptc-publish-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const remote = path.join(directory, "remote.git");
  const repo = path.join(directory, "repo");
  await fs.mkdir(repo);
  runGit(directory, "init", "--bare", remote);
  runGit(repo, "init");
  runGit(repo, "config", "user.name", "PTC Test");
  runGit(repo, "config", "user.email", "ptc-test@example.invalid");
  await fs.writeFile(path.join(repo, "index.html"), "<!-- initial -->\n");
  await fs.writeFile(path.join(repo, "README.md"), "initial\n");
  runGit(repo, "add", "index.html", "README.md");
  runGit(repo, "commit", "-m", "Initial");
  runGit(repo, "branch", "-M", "main");
  runGit(repo, "remote", "add", "origin", remote);
  runGit(repo, "push", "-u", "origin", "main");

  await fs.mkdir(path.join(repo, "lessons"));
  await fs.mkdir(path.join(repo, "images"));
  await fs.writeFile(path.join(repo, "lessons", "04-ochos.js"), "PTC.addUnit({});\n");
  await fs.writeFile(path.join(repo, "images", "ochos-01.jpg"), "image\n");
  await fs.writeFile(path.join(repo, "index.html"), "<script src=\"lessons/04-ochos.js\"></script>\n");
  await fs.writeFile(path.join(repo, "unrelated.txt"), "leave me uncommitted\n");

  const result = await publishDraftChanges(repo, {
    placement: { type: "new" },
    siteApplied: { relativeFile: "lessons/04-ochos.js" },
    lesson: {
      title: "Lesson 1 · Ochos",
      sections: [{ points: [{ image: "images/ochos-01.jpg" }] }],
    },
  }, "Publish Ochos class");

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.equal(runGit(remote, "log", "-1", "--format=%s", "refs/heads/main"), "Publish Ochos class");
  assert.equal(runGit(repo, "status", "--porcelain", "--", "unrelated.txt"), "?? unrelated.txt");
});

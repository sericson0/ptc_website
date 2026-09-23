import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendLesson, createUnit, discoverUnits, formatDuration, lessonFromDraft, slugify, updateGeneratedYouTubeId } from "../tools/lib/site-content.mjs";
import { playlistIdFromUrl } from "../tools/lib/youtube.mjs";

test("small formatting helpers", () => {
  assert.equal(slugify("Rotating the Box Step!"), "rotating-the-box-step");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(playlistIdFromUrl("https://www.youtube.com/playlist?list=PL_abc-123"), "PL_abc-123");
  assert.equal(playlistIdFromUrl("PL_abc-123"), "PL_abc-123");
});

test("appendLesson preserves a valid unit and handles brackets inside strings", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ptc-site-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "unit.js");
  await fs.writeFile(file, `PTC.addUnit({\n  title: "Unit",\n  lessons: [\n    { title: "First [demo]", notes: "not ] the end" }\n  ]\n});\n`);
  await appendLesson(file, { title: "Lesson 2 · New", notes: ["Clear"] });
  const source = await fs.readFile(file, "utf8");
  assert.match(source, /Lesson 2 · New/);
  assert.match(source, /First \[demo\]/);
});

test("createUnit registers the generated file in index.html", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ptc-site-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, "lessons"));
  await fs.writeFile(path.join(dir, "index.html"), "<script defer src=\"lessons/01-old.js\"></script>\n<!-- ============================================================ -->\n");
  await fs.writeFile(path.join(dir, "lessons", "01-old.js"), "PTC.addUnit({ title: 'Old', lessons: [] });\n");
  const result = await createUnit(dir, { title: "New Unit", summary: "Summary", lessons: [] });
  assert.equal(result.relativeFile, "lessons/02-new-unit.js");
  const units = await discoverUnits(dir);
  assert.deepEqual(units.map((unit) => unit.title), ["Old", "New Unit"]);
});

test("lessonFromDraft strips workflow-only timestamps", () => {
  const lesson = lessonFromDraft({
    lesson: {
      title: "A Turn",
      date: "2026-09-22",
      duration: "2:00",
      notes: ["Note"],
      sections: [{ title: "Steps", points: [{ text: "Step", timeSeconds: 12, image: "images/step.jpg" }] }],
      practice: ["Repeat"],
      materials: [],
    },
  }, 4, "abc123");
  assert.equal(lesson.title, "Lesson 4 · A Turn");
  assert.equal(lesson.youtube, "abc123");
  assert.deepEqual(lesson.sections[0].points[0], { text: "Step", image: "images/step.jpg" });
});

test("a later YouTube upload can replace a generated placeholder", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ptc-site-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, "lessons"));
  const relativeFile = "lessons/generated.js";
  await fs.writeFile(path.join(dir, relativeFile), 'PTC.addUnit({ title: "Unit", lessons: [{ title: "Lesson", "youtube": "PASTE_VIDEO_ID" }] });\n');
  await updateGeneratedYouTubeId(dir, { relativeFile }, "video123");
  const source = await fs.readFile(path.join(dir, relativeFile), "utf8");
  assert.match(source, /"youtube": "video123"/);
});

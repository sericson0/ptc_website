import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// Small DOM adapter for running the actual editor without browser dependencies.
class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.className = "";
    this.value = "";
    this.classList = {
      add: (name) => { this.className = `${this.className} ${name}`.trim(); },
      remove: (name) => { this.className = this.className.split(" ").filter((item) => item !== name).join(" "); },
    };
  }
  append(...items) { items.forEach((item) => { item.parent = this; this.children.push(item); }); }
  prepend(item) { item.parent = this; this.children.unshift(item); }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  remove() { this.parent.children = this.parent.children.filter((item) => item !== this); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  matches(selector) { return selector.startsWith(".") ? this.className.split(" ").includes(selector.slice(1)) : this.tagName === selector; }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
  querySelectorAll(selector) {
    return this.children.flatMap((item) => [...(item.matches(selector) ? [item] : []), ...item.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const source = await fs.readFile(new URL("../tools/gui/app.js", import.meta.url), "utf8");
const copy = (value) => JSON.parse(JSON.stringify(value));

function editor() {
  const document = new Element("document");
  const ids = new Map();
  const images = [];
  document.createElement = (tag) => {
    const element = new Element(tag);
    if (tag === "img") images.push(element);
    return element;
  };
  const select = document.querySelector.bind(document);
  document.querySelector = (selector) => {
    if (!selector.startsWith("#")) return select(selector);
    if (!ids.has(selector)) {
      const element = new Element("div");
      ids.set(selector, element);
      document.append(element);
    }
    return ids.get(selector);
  };
  let savedDraft;
  const requests = [];
  const pendingImages = [];
  const timers = new Map();
  let timerId = 0;
  let imageStarted = deferred();
  const context = vm.createContext({
    document,
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      if (url.endsWith("/draft")) {
        savedDraft = body.draft;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (url.endsWith("/approve")) {
        return { ok: false, json: async () => ({ error: "Approval intercepted by the test" }) };
      }
      assert.ok(url.endsWith("/image"));
      const response = deferred();
      pendingImages.push({ body, response, draft: copy(savedDraft) });
      imageStarted.resolve();
      imageStarted = deferred();
      return response.promise;
    },
  });
  vm.runInContext(source.replace("  init();", "  globalThis.studio = { state, renderReview, renderSections, collectDraft, saveStill, saveDraft, previewStill, approve };"), context);
  const studio = context.studio;
  studio.state.config = { youtubeConfigured: true };
  studio.state.jobId = "editor-test-job";
  studio.state.draft = {
    lesson: { title: "Lesson", notes: ["Notes"], practice: ["Practice"], sections: [{
      title: "Section",
      points: [
        { text: "First", timeSeconds: 10, stagedImage: "old-first.jpg" },
        { text: "Second", timeSeconds: 20, stagedImage: "old-second.jpg" },
      ],
    }] },
    youtube: { title: "Video", description: "Description", tags: [], playlistUrl: "" },
  };
  savedDraft = copy(studio.state.draft);
  studio.renderReview();
  return {
    studio, images, requests,
    rows: () => document.querySelectorAll(".point-editor"),
    field: (selector) => document.querySelector(selector),
    saved: () => savedDraft,
    waitForImage: () => pendingImages.length ? Promise.resolve() : imageStarted.promise,
    saveStill: (row) => studio.saveStill(row, row.querySelector(".refresh-still")),
    selectTimestamp: (row, time) => {
      const target = row.querySelector(".point-time");
      target.value = String(time);
      document.querySelector("#sections-editor").listeners.input[0]({ target });
    },
    runTimers: () => {
      for (const [id, callback] of [...timers]) {
        if (timers.delete(id)) callback();
      }
    },
    finishImage: (error = "") => {
      const pending = pendingImages.shift();
      const point = pending.draft.lesson.sections[pending.body.section].points[pending.body.point];
      point.stagedImage = `new-${pending.body.timeSeconds}.jpg`;
      point.timeSeconds = pending.body.timeSeconds;
      if (!error) savedDraft = copy(pending.draft);
      pending.response.resolve({ ok: !error, json: async () => error ? { error } : { draft: pending.draft } });
    },
  };
}

test("saving a still preserves text, timestamps and edits made during extraction", async () => {
  const f = editor();
  const [first, second] = f.rows();
  first.querySelector(".point-text").value = "Edited before saving";
  first.querySelector(".point-time").value = "12";
  const saving = f.saveStill(first);
  await f.waitForImage();
  assert.equal(f.saved().lesson.sections[0].points[0].text, "Edited before saving");
  first.querySelector(".point-text").value = "Edited while extracting";
  first.querySelector(".point-time").value = "13";
  second.querySelector(".point-time").value = "29";
  f.field("#review-notes").value = "Updated notes";
  f.field("#youtube-description").value = "Updated video description";
  f.finishImage();
  await saving;
  assert.equal(f.rows()[0], first, "The editor must retain its original DOM rows");
  const saved = f.saved();
  assert.equal(saved.lesson.sections[0].points[0].text, "Edited while extracting");
  assert.equal(saved.lesson.sections[0].points[0].timeSeconds, 13);
  assert.equal(saved.lesson.sections[0].points[0].stagedImage, "new-12.jpg");
  assert.equal(saved.lesson.sections[0].points[1].timeSeconds, 29);
  assert.equal(saved.lesson.notes[0], "Updated notes");
  assert.equal(saved.youtube.description, "Updated video description");
});

test("multiple still saves and Save draft run in order without losing image choices", async () => {
  const f = editor();
  const [first, second] = f.rows();
  const saveFirst = f.saveStill(first);
  const saveSecond = f.saveStill(second);
  const saveDraft = f.studio.saveDraft();
  await f.waitForImage();
  assert.equal(f.requests.filter((request) => request.url.endsWith("/image")).length, 1);
  f.finishImage();
  await saveFirst;
  await f.waitForImage();
  f.finishImage();
  await Promise.all([saveSecond, saveDraft]);
  const points = f.saved().lesson.sections[0].points;
  assert.equal(points[0].stagedImage, "new-10.jpg");
  assert.equal(points[1].stagedImage, "new-20.jpg");
  assert.equal(first.querySelector(".refresh-still").disabled, false);
  assert.equal(second.querySelector(".refresh-still").disabled, false);
});

test("removing a point while saving its still does not restore it or change the next point", async () => {
  const f = editor();
  const saving = f.saveStill(f.rows()[0]);
  await f.waitForImage();
  f.studio.collectDraft();
  f.studio.state.draft.lesson.sections[0].points.splice(0, 1);
  f.studio.renderSections();
  f.finishImage();
  await saving;
  const points = f.saved().lesson.sections[0].points;
  assert.equal(points.length, 1);
  assert.equal(points[0].text, "Second");
  assert.equal(points[0].stagedImage, "old-second.jpg");
});

test("a failed image save keeps edits and lets the next save proceed", async () => {
  const f = editor();
  const first = f.rows()[0];
  first.querySelector(".point-text").value = "Keep this edit";
  const saving = f.saveStill(first);
  await f.waitForImage();
  f.finishImage("No frame available");
  await saving;
  assert.equal(f.field("#config-alert").textContent, "No frame available");
  assert.equal(first.querySelector(".point-text").value, "Keep this edit");
  assert.equal(first.querySelector(".refresh-still").disabled, false);
  assert.equal(f.saved().lesson.sections[0].points[0].stagedImage, "old-first.jpg");
  await assert.rejects(f.studio.saveDraft(), /image at 10 seconds could not be updated/);
  assert.equal(f.saved().lesson.sections[0].points[0].text, "Keep this edit");
  const retry = f.saveStill(first);
  await f.waitForImage();
  f.finishImage();
  await retry;
  await f.studio.saveDraft();
});

test("an older preview finishing last cannot replace the newest timestamp preview", () => {
  const f = editor();
  const first = f.rows()[0];
  const time = first.querySelector(".point-time");
  time.value = "30";
  f.studio.previewStill(first);
  const older = f.images.at(-1);
  time.value = "40";
  f.studio.previewStill(first);
  const newer = f.images.at(-1);
  newer.listeners.load[0]();
  older.listeners.load[0]();
  assert.equal(first.querySelector("img"), newer);
  assert.match(first.querySelector(".still-time").textContent, /40\.0 sec/);
});

test("changing a timestamp automatically saves the latest number without clicking Update now", async () => {
  const f = editor();
  const first = f.rows()[0];
  f.selectTimestamp(first, 31);
  f.selectTimestamp(first, 32);
  f.runTimers();
  await f.waitForImage();
  const images = f.requests.filter((request) => request.url.endsWith("/image"));
  assert.equal(images.length, 1);
  assert.equal(images[0].body.timeSeconds, 32);
  f.finishImage();
  await f.studio.saveDraft();
  assert.equal(f.saved().lesson.sections[0].points[0].timeSeconds, 32);
  assert.equal(f.saved().lesson.sections[0].points[0].stagedImage, "new-32.jpg");
});

test("Save draft flushes pending timestamp updates and waits for the selected image", async () => {
  const f = editor();
  f.selectTimestamp(f.rows()[0], 45);
  let finished = false;
  const saving = f.studio.saveDraft().then(() => { finished = true; });
  await f.waitForImage();
  assert.equal(finished, false);
  f.finishImage();
  await saving;
  assert.equal(f.saved().lesson.sections[0].points[0].stagedImage, "new-45.jpg");
  f.runTimers();
  assert.equal(f.requests.filter((request) => request.url.endsWith("/image")).length, 1);
});

test("an automatic timestamp update during an in-flight image save uses the newer number", async () => {
  const f = editor();
  f.selectTimestamp(f.rows()[0], 50);
  f.runTimers();
  await f.waitForImage();
  f.selectTimestamp(f.rows()[0], 60);
  f.runTimers();
  f.finishImage();
  await f.waitForImage();
  f.finishImage();
  await f.studio.saveDraft();
  const point = f.saved().lesson.sections[0].points[0];
  assert.equal(point.timeSeconds, 60);
  assert.equal(point.stagedImage, "new-60.jpg");
});

test("approval waits for automatic image saves before submitting the selected actions", async () => {
  const f = editor();
  f.field("#action-site").checked = true;
  f.selectTimestamp(f.rows()[0], 70);
  const approving = f.studio.approve();
  await f.waitForImage();
  assert.equal(f.requests.some((request) => request.url.endsWith("/approve")), false);
  f.finishImage();
  await approving;
  assert.equal(f.saved().lesson.sections[0].points[0].stagedImage, "new-70.jpg");
  assert.equal(f.requests.some((request) => request.url.endsWith("/approve")), true);
});

test("a failed automatic image update prevents approval from using the old image", async () => {
  const f = editor();
  f.field("#action-site").checked = true;
  f.selectTimestamp(f.rows()[0], 80);
  const approving = f.studio.approve();
  await f.waitForImage();
  f.finishImage("No frame available");
  await approving;
  assert.equal(f.requests.some((request) => request.url.endsWith("/approve")), false);
  assert.match(f.field("#config-alert").textContent, /image at 80 seconds could not be updated/);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { discoverUnits } from "../tools/lib/site-content.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("Basic 8 has one illustrated card for every numbered step", async () => {
  const units = await discoverUnits(root);
  const unit = units.find((candidate) => candidate.relativeFile === "lessons/02-basic-8.js");
  const points = unit?.lessons?.[0]?.sections?.[0]?.points;
  assert.equal(points?.length, 8);
  for (let index = 0; index < points.length; index += 1) {
    const step = index + 1;
    assert.match(points[index].text, new RegExp(`\\*\\*Step ${step}\\*\\*`));
    assert.ok(points[index].image, `Step ${step} needs an image`);
    await fs.access(path.join(root, points[index].image));
  }
});

test("the unit index uses the full-width top layout", async () => {
  const css = await fs.readFile(path.join(root, "assets", "library.css"), "utf8");
  assert.match(css, /\.layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.index\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto/s);
});

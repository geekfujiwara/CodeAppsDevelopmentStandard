import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findTutorialHazards, tutorialHazards } from "./detect-tutorial-hazards.mjs";

test("ordinary dialogs are unaffected", () => {
  assert.deepEqual(tutorialHazards("<DialogPrimitive.Overlay />"), []);
});
test("spotlight cannot use the scroll-locking overlay", () => {
  for (const overlay of ["DialogPrimitive.Overlay", "DialogOverlay"]) {
    assert.equal(tutorialHazards(`<div data-tutorial-spotlight /><${overlay} />`).length, 1);
  }
});
test("fixed dimming backdrop is rejected only in spotlight components", () => {
  const bad = '<div data-tutorial-spotlight /><div className="fixed inset-0 bg-black/60" />';
  assert.equal(tutorialHazards(bad).length, 1);
});
test("outline and transparent blocker preserve original target brightness", () => {
  assert.deepEqual(tutorialHazards(`
    <div className="fixed inset-0" style={{ backgroundColor: rect ? "transparent" : "rgba(2,6,23,0.62)" }} />
    <div data-tutorial-spotlight className="outline-2" style={{ ...rect, boxShadow: "0 0 0 9999px rgba(2,6,23,0.62)" }} />
  `), []);
});
test("ring cannot share the spotlight's inline box shadow", () => {
  assert.equal(tutorialHazards('<div data-tutorial-spotlight className="ring-2" style={{boxShadow: "..."}} />').length, 1);
});
test("scanner checks nested source files but not ordinary dialogs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tutorial-guard-"));
  try {
    fs.mkdirSync(path.join(root, "src", "components"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "components", "tour.tsx"), '<div data-tutorial-spotlight /><DialogOverlay />');
    fs.writeFileSync(path.join(root, "src", "dialog.tsx"), "<DialogOverlay />");
    assert.equal(findTutorialHazards(root).length, 1);
    assert.deepEqual(findTutorialHazards(path.join(root, "absent")), []);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
test("normal predeploy and scaffold entrypoints run the same detector", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const canonical = fs.readFileSync(path.join(here, "detect-tutorial-hazards.mjs"), "utf8");
  for (const scripts of [here, path.join(here, "..", "templates", "generic-base", "scripts"),
    path.join(here, "..", "templates", "construction-cockpit", "scripts")]) {
    assert.equal(fs.readFileSync(path.join(scripts, "detect-tutorial-hazards.mjs"), "utf8"), canonical);
    assert.match(fs.readFileSync(path.join(scripts, "pre-deploy-check.mjs"), "utf8"), /errors\.push\(\.\.\.findTutorialHazards\(root\)\)/);
  }
});

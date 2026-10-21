import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deploymentTerminalError } from "./check-deploy-terminal.mjs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("deploy checks for an interactive terminal before building", () => {
  assert.match(
    packageJson.scripts.deploy,
    /^node scripts\/check-deploy-terminal\.mjs && .*npm run build/,
  );
});

test("allows deployment from an interactive terminal", () => {
  assert.equal(
    deploymentTerminalError({ isCI: false, stdinIsTTY: true, stdoutIsTTY: true }),
    null,
  );
});

test("blocks deployment from a non-interactive local shell", () => {
  const error = deploymentTerminalError({
    isCI: false,
    stdinIsTTY: false,
    stdoutIsTTY: false,
  });

  assert.match(error, /VS Code integrated terminal/);
});

test("allows CI to use its separately configured non-interactive identity", () => {
  assert.equal(
    deploymentTerminalError({ isCI: true, stdinIsTTY: false, stdoutIsTTY: false }),
    null,
  );
});

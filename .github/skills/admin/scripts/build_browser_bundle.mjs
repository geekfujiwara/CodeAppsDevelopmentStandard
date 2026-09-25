#!/usr/bin/env node
// Build a sandbox-evaluable bundle of m365_portal_browser_runner.mjs for the VS Code integrated browser tool.
// The tool sandbox exposes only `page` (no import/require/URL) and the admin center CSP blocks script injection,
// so the runner is served from 127.0.0.1 and evaluated with `new Function` against the real page.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalHash, validatePlan } from "./m365_portal_browser_runner.mjs";

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), "m365_portal_browser_runner.mjs");
// Node-only APIs the bundle must never reach; each stub fails loudly if a code path tries.
const NODE_ONLY = ["createHash", "readFile"];

export function toSandboxBody(rawSource) {
  const source = rawSource.replace(/\r\n/g, "\n");
  const importLines = source.split("\n").filter((line) => /^import\s/.test(line));
  for (const line of importLines) {
    if (!/from "node:(crypto|fs\/promises)";$/.test(line)) throw new Error(`unexpected runner import: ${line}`);
  }
  const names = [...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((match) => match[1]);
  if (!names.includes("executeApprovedPlan") || !names.includes("validatePlan")) {
    throw new Error("runner exports changed; bundle would be incomplete");
  }
  if (/\bnew URL\(page\b/.test(source)) throw new Error("runner uses URL on the Node side; use pageOrigin(page)");
  const body = source
    .split("\n")
    .filter((line) => !/^import\s/.test(line))
    .join("\n")
    .replace(/^export\s+/gm, "");
  const stubs = NODE_ONLY.map((name) => `const ${name} = () => { throw new Error("${name} is Node-only"); };`).join("\n");
  return `${stubs}\n${body}\nreturn { ${names.join(", ")} };\n`;
}

async function main() {
  const [outDir, planPath, expectedHash] = process.argv.slice(2);
  if (!outDir) {
    console.error("usage: build_browser_bundle.mjs <serve-dir> [plan.json <PLAN_HASH>]");
    process.exit(2);
  }
  const target = resolve(outDir);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "runner.js"), toSandboxBody(await readFile(RUNNER, "utf8")), "utf8");
  console.log(`BUNDLE=${join(target, "runner.js")}`);
  if (planPath) {
    const text = await readFile(planPath, "utf8");
    const plan = validatePlan(JSON.parse(text));
    if (!expectedHash || canonicalHash(plan) !== expectedHash) throw new Error("approved plan hash mismatch");
    await writeFile(join(target, "plan.json"), text, "utf8");
    console.log(`PLAN_FILE_SHA256=${createHash("sha256").update(text, "utf8").digest("hex")}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

import test from "node:test"
import assert from "node:assert/strict"
import { cp, mkdtemp, readFile, rm } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

test("clean generation works without a previous validator and produces identical contracts", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url))
  const scratch = await mkdtemp(path.join(root, ".generation-test-"))
  try {
    for (const directory of ["src", "scripts"]) await cp(path.join(root, directory), path.join(scratch, directory), { recursive: true })
    await cp(path.join(root, "package.json"), path.join(scratch, "package.json"))
    await rm(path.join(scratch, "src/data/plant-design-validator.js"))
    execFileSync(process.execPath, ["--experimental-strip-types", "scripts/generate-design.mjs"], { cwd: scratch })
    const code = await readFile(path.join(scratch, "src/data/plant-design-validator.js"), "utf8")
    assert.doesNotMatch(code, /\brequire\s*\(|\bnew\s+Function\s*\(|\beval\s*\(/)
    for (const file of ["schema.json", "sample.json"]) {
      const generated = await readFile(path.join(scratch, "agent-skill", file), "utf8")
      assert.equal(generated, await readFile(path.join(scratch, "public/plant-design", file), "utf8"))
      assert.equal(generated, await readFile(path.join(root, "agent-skill", file), "utf8"))
    }
  } finally { await rm(scratch, { recursive: true, force: true }) }
})
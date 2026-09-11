import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))
const forbiddenNames = new Set([".env", ".env.local", "power.config.json", "local.settings.json", ".power", "generated", ".secrets"])
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "__pycache__"].includes(entry.name)) continue
    const filename = path.join(directory, entry.name)
    assert.ok(!forbiddenNames.has(entry.name), `Private/generated artifact: ${path.relative(root, filename)}`)
    if (entry.isDirectory()) { await check(filename); continue }
    if (!/\.(tsx?|py|json|md|mjs)$/.test(entry.name)) continue
    if (entry.name === "package-lock.json") continue
    const text = await readFile(filename, "utf8")
    assert.ok(!/https:\/\/[a-z0-9-]+\.crm\d*\.dynamics\.com/i.test(text), `Organization URL: ${filename}`)
    const identities = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []
    assert.ok(identities.every(value => /^00000000-0000-4000-8000-\d{12}$/.test(value)), `Literal identity: ${filename}`)
    assert.ok(!/\bgeek_\w+/.test(text), `Fixed publisher: ${filename}`)
  }
}
await check(root)
const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"))
assert.ok(lock.lockfileVersion >= 1, "A committed npm lockfile is required")
if (process.argv.includes("--tracked")) {
  for (const filename of ["package-lock.json", ".env.example", "plant-design-skill/design_plant.py"]) {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", filename], { cwd: root, stdio: "pipe" })
  }
}
const config = await readFile(path.join(root, "src/lib/plant-agent-config.ts"), "utf8")
assert.ok(!/RETRIEVAL_READY\s*=\s*true/.test(config), "Retrieval must default off")
const sourceFiles = [
  "src/components/plant-agent-images.tsx",
  "src/lib/plant-page-image-loader.ts",
  "src/integrations/connectors.ts",
]
for (const filename of sourceFiles) {
  const source = await readFile(path.join(root, filename), "utf8")
  assert.ok(!/Drawing_files_mcpService|GetIndexedDrawingPageImage|InvokeServer/.test(source), `Direct MCP connector usage: ${filename}`)
}
const imageLoader = await readFile(path.join(root, "src/lib/plant-page-image-loader.ts"), "utf8")
assert.match(imageLoader, /pageimagejson/, "Drawing images must be read from the verified Dataverse cache")
console.log("Sample publication checks passed")
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = file => fs.readFileSync(path.join(root, file), "utf8")

test("usage guide is the final control on the right side of the header", () => {
  const source = read("src/pages/_layout.tsx")
  const button = source.indexOf('data-tour="guide-button"')
  assert.ok(button > source.indexOf("<ModeToggle />"))
  assert.equal((source.match(/data-tour="guide-button"/g) ?? []).length, 1)
  assert.ok(source.indexOf("onClick={openGuide}", source.indexOf("<ModeToggle />")) > 0)
})

test("Dataverse is resolved lazily without requiring generated sources at scaffold time", () => {
  const source = read("src/lib/dataverse-client.ts")
  assert.match(source, /import\.meta\.glob/)
  assert.doesNotMatch(source, /import\s+.*from\s+["'].*generated/)
  assert.match(source, /未接続/)
  assert.match(source, /seenTokens\.has/)
  assert.match(source, /不完全な一覧の表示を中止/)
})

test("maps require explicit opt-in and predeploy checks the actual CSP", () => {
  assert.match(read(".env.example"), /VITE_FEATURE_MAPS=false/)
  assert.match(read("src/config.ts"), /VITE_FEATURE_MAPS === "true"/)
  const source = read("scripts/check-field-service.mjs")
  assert.match(source, /configure_code_app_csp\.py/)
  assert.match(source, /"--assert"/)
  assert.match(read("package.json"), /check-field-service\.mjs/)
})

function checkFixture(t, env, changeSources = () => {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field-service-check-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.mkdirSync(path.join(directory, "scripts"))
  fs.copyFileSync(path.join(root, "scripts", "check-field-service.mjs"), path.join(directory, "scripts", "check-field-service.mjs"))
  fs.cpSync(path.join(root, "src"), path.join(directory, "src"), { recursive: true })
  fs.writeFileSync(path.join(directory, ".env"), env)
  changeSources(directory)
  return spawnSync(process.execPath, [path.join(directory, "scripts", "check-field-service.mjs")], { encoding: "utf8" })
}

test("configuration guard accepts a matching alternate publisher prefix", t => {
  const result = checkFixture(t, "PUBLISHER_PREFIX=acme\nVITE_PUBLISHER_PREFIX=acme\nVITE_FEATURE_MAPS=false\n")
  assert.equal(result.status, 0, result.stderr)
})

test("configuration guard rejects publisher mismatch", t => {
  const result = checkFixture(t, "PUBLISHER_PREFIX=acme\nVITE_PUBLISHER_PREFIX=other\n")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /must match/)
})

test("configuration guard rejects a missing tutorial target", t => {
  const result = checkFixture(t, "PUBLISHER_PREFIX=acme\nVITE_PUBLISHER_PREFIX=acme\n", directory => {
    const layout = path.join(directory, "src", "pages", "_layout.tsx")
    fs.writeFileSync(layout, fs.readFileSync(layout, "utf8").replace('data-tour="guide-button"', ""))
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Missing guide target: guide-button/)
})

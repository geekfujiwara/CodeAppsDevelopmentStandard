import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { findCspHazards, cspAllowFromEnv } from "./detect-csp-hazards.mjs"

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "csp-hazards-"))
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
  }
  return root
}

test("fetch・GLTFLoader.load・Worker・blob URL を検出する", () => {
  const root = project({
    "src/a.ts": "const r = await fetch('./data.json')\n",
    "src/b.ts": "new GLTFLoader().load(url, onLoad)\n",
    "src/c.ts": "const w = new Worker(new URL('./w.js', import.meta.url))\n",
    "src/d.ts": "img.src = URL.createObjectURL(blob)\n",
    "src/e.ts": "const d = new DRACOLoader()\n",
  })
  const ids = findCspHazards(root).map(h => h.rule).sort()
  assert.deepEqual(ids, ["blob-url", "fetch", "three-file-loader", "worker", "worker-decoder"])
})

test("安全な書き方・コメント・テスト・生成物・csp-ok は検出しない", () => {
  const root = project({
    "src/ok.ts": [
      "await new GLTFLoader().parseAsync(buf, '')",
      "new THREE.TextureLoader().load(url)",
      "// fetch('./x') はコメント",
      "const prefetch = () => 1; prefetch()",
      "obj.fetch(1)",
      "// csp-ok: connect-src に api.example.com を追加済み",
      "await fetch('https://api.example.com')",
    ].join("\n"),
    "src/x.test.ts": "await fetch('/x')\n",
    "src/generated/services/S.ts": "await fetch('/x')\n",
    "node_modules/p/index.js": "fetch('/x')\n",
  })
  assert.deepEqual(findCspHazards(root), [])
})

test("CODE_APP_CSP_ALLOW で許可した種類は検出しない", () => {
  const root = project({ "src/a.ts": "const w = new Worker('w.js')\nawait fetch('/x')\n" })
  const allow = cspAllowFromEnv("FOO=1\nCODE_APP_CSP_ALLOW=worker-src\n")
  assert.deepEqual(findCspHazards(root, { allow }).map(h => h.rule), ["fetch"])
})

test("blob: URL を <a download> に渡すだけのダウンロードは検出しない（img.src に渡す場合は検出する）", () => {
  const root = project({
    "src/csv.ts": "const url = URL.createObjectURL(blob)\nconst a = document.createElement('a')\na.href = url\na.download = 'x.csv'\na.click()\n",
    "src/img.ts": "const url = URL.createObjectURL(blob)\nimg.src = url\n",
  })
  assert.deepEqual(findCspHazards(root).map(h => h.file), ["src/img.ts"])
})

test("drei の Environment preset・ローダー フック・?inline の無い 3D 素材の import を検出する", () => {
  const root = project({
    "src/env.tsx": "<Environment preset=\"city\" />\n",
    "src/env-multi.tsx": "<Environment\n  preset=\"sunset\"\n  background\n/>\n",
    "src/hook.tsx": "const { scene } = useGLTF(modelUrl)\n",
    "src/asset.ts": "import bridge from \"../assets/bridge.glb\"\n",
    "src/asset-url.ts": "const hdr = await import(\"./sky.hdr?url\")\n",
  })
  const found = findCspHazards(root).map(h => `${h.file}:${h.rule}`).sort()
  assert.deepEqual(found, [
    "src/asset-url.ts:asset-url-import",
    "src/asset.ts:asset-url-import",
    "src/env-multi.tsx:drei-environment",
    "src/env.tsx:drei-environment",
    "src/hook.tsx:three-loader-hook",
  ])
})

test("?inline の 3D 素材・照明だけの Canvas・パラメータ名 preset は検出しない", () => {
  const root = project({
    "src/ok.tsx": [
      "import bridge from \"../assets/bridge.glb?inline\"",
      "const models = import.meta.glob(\"../assets/models/*.glb\", { query: \"?inline\", import: \"default\" })",
      "<hemisphereLight args={[\"#fff\", \"#333\", 1]} />",
      "const preset = presets[key]",
      "<Button preset=\"primary\" />",
    ].join("\n"),
  })
  assert.deepEqual(findCspHazards(root), [])
})

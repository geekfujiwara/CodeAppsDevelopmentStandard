import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"

const lib = JSON.parse(readFileSync(new URL("../src/data/material-library.json", import.meta.url), "utf8"))
const SLOTS = ["wall:siding", "wall:plaster", "wall:brick", "wall:wood", "wall:metal", "roof:slate", "roof:kawara", "roof:metal", "floor:oak", "floor:tile", "grass", "concrete", "road"]

test("材質ライブラリ: アプリの全仕上げ材にスロットがあり、同梱ファイルが揃っている", () => {
  const slots = lib.materials.map(m => m.slot)
  for (const s of SLOTS) assert.ok(slots.includes(s), `スロット ${s} が無い`)
  for (const m of lib.materials) {
    for (const f of ["color.jpg", "normal.jpg", "rough.jpg"]) {
      const size = statSync(new URL(`../public/${m.path}/${f}`, import.meta.url)).size
      assert.ok(size > 1000, `${m.slot}/${f}`)
    }
  }
})

test("材質ライブラリ: 同梱物の検証スクリプト（実寸・平均色・ライセンス・色相・サイズ上限）が通る", () => {
  const out = execFileSync("python", ["scripts/fetch_materials.py", "--check"], { cwd: new URL("..", import.meta.url), encoding: "utf8" })
  assert.match(out, /\[check\] \d+ slots/)
})

test("3D 資産の共通利用の契約（汎用検証: 材質マニフェスト + Blender の GLB）を満たす", () => {
  const keys = "exteriorWall,interiorWall,floor,ceiling,roof,flatRoof,soffit,fascia,sash,windowBoard,casing,baseboard,door,section,foundation,concrete,road,glass,ground,foliage,foliageDark,trunk"
  const out = execFileSync(
    "python",
    ["scripts/validate_3d_assets.py", "--materials", "src/data/material-library.json", "--public", "public", "--glb", "public/samples/blender/sample-model.glb", "--material-keys", keys, "--material-prefix", "furn_",
      // 焼き込みのライトマップ・家具のテクスチャは埋め込み（csp-safe-gltf で読む）。ライトマップ付きの材質は Blender の複製名（floor.001）
      "--allow-embedded-images", "--strip-blender-suffix", "--max-glb-bytes", "4000000"],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
  )
  assert.match(out, /^OK$/m)
  execFileSync("python", ["-m", "unittest", "scripts/test_validate_3d_assets.py"], { cwd: new URL("..", import.meta.url), stdio: "pipe" })
})

test("材質ライブラリ: 色合わせは「選んだ色 × albedoScale / 平均色」で、平均色を選ぶと albedoScale 倍になる", async () => {
  // three.js の Color は #RRGGBB をリニアで保持するので、平均色をそのまま sRGB に戻した色を渡すと albedoScale 倍になる
  const THREE = await import("three")
  const { tintFor } = await import("../src/lib/material-library.ts")
  for (const e of lib.materials) {
    const avg = new THREE.Color().setRGB(...e.avgLinear, THREE.LinearSRGBColorSpace)
    const t = tintFor(e, `#${avg.getHexString()}`)
    const want = e.albedoScale ?? 1
    for (const v of [t.r, t.g, t.b]) assert.ok(Math.abs(v - want) < 0.05 * want, `${e.slot}: ${v} (want ${want})`)
    assert.deepEqual([tintFor(e, null).r, tintFor(e, null).g, tintFor(e, null).b], [1, 1, 1])
  }
})

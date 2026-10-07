import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { Batch, addFloor, addFoundation, addLowerRoofs, addRoof, addTopCeiling } from "../src/lib/building-geometry.ts"

const spec = JSON.parse(readFileSync(new URL("../src/data/sample-spec.json", import.meta.url), "utf8"))

function tsCounts() {
  const b = new Batch()
  for (const f of spec.floors) addFloor(b, spec, f)
  addFoundation(b, spec.floors[0].walls)
  addTopCeiling(b, spec)
  addLowerRoofs(b, spec)
  addRoof(b, spec)
  const counts = {}
  // Batch は材質キーごとに頂点・インデックスを持つ。ポリゴン数 = 四角形 2 / 三角形 1 の三角形から復元できないため、
  // 頂点数（4 = 四角形, 3 = 三角形）の合計で比べる
  for (const [key, bucket] of b.buckets) counts[key] = bucket.pos.length / 3
  return counts
}

test("Three.js と Blender が同じ部材を同じ数だけ生成する", { skip: !hasPython() }, () => {
  const py = JSON.parse(
    execFileSync("python", ["-c", `
import json, sys
sys.path.insert(0, "blender")
from geometry import build_all
spec = json.load(open("src/data/sample-spec.json", encoding="utf-8"))
c = {}
for polys in build_all(spec).values():
    for key, pts, uv in polys:
        c[key] = c.get(key, 0) + len(pts)
print(json.dumps(c))
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" }),
  )
  const ts = tsCounts()
  assert.deepEqual(Object.keys(ts).sort(), Object.keys(py).sort())
  for (const k of Object.keys(ts)) assert.equal(ts[k], py[k], `材質 ${k} の頂点数`)
  // 主要な部材が生成されていること
  for (const k of ["sash", "glass", "casing", "baseboard", "door", "foundation", "fascia", "soffit", "windowBoard", "concrete"]) assert.ok(ts[k] > 0, k)
})

function hasPython() {
  try {
    execFileSync("python", ["--version"])
    return existsSync(new URL("../blender/geometry.py", import.meta.url))
  } catch {
    return false
  }
}

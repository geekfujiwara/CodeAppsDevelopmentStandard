import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { autoStage, catalogItem, ceilingHeight, toModelVariant, expandParts, footprint, snapItem, CATALOG, roomBox } from "../src/lib/furniture.ts"
import { DEFAULT_MASSING, generateFromMassing, parseBuildingSpec } from "../src/lib/building-spec.ts"
import { stairKeepouts } from "../src/lib/stairs.ts"
import { siteLayout } from "../src/lib/building-geometry.ts"

const spec = JSON.parse(readFileSync(new URL("../src/data/sample-spec.json", import.meta.url), "utf8"))
delete spec.furniture

const overlap = (a, b) => a.x0 < b.x1 - 0.005 && b.x0 < a.x1 - 0.005 && a.z0 < b.z1 - 0.005 && b.z0 < a.z1 - 0.005
const wallBox = w => ({ x0: w.x, x1: w.x + w.w, z0: w.z, z1: w.z + w.d })

test("おまかせ配置: LDK・寝室・玄関・駐車場に家具と車が置かれる", () => {
  const items = autoStage(spec)
  const types = items.map(i => i.type)
  console.log(items.map(i => `${i.level}F:${i.type}@${i.x},${i.z},${i.ry}`).join(" "))
  for (const t of ["kitchen", "diningSet", "sofa", "tvBoard", "bedDouble", "wardrobe", "shoeCabinet", "car"]) assert.ok(types.includes(t), t)
  assert.ok(types.filter(t => t.startsWith("bed")).length >= 3, "2F の個室にベッド")
})

test("おまかせ配置: 壁・他の家具と重ならず、建物の中に収まる", () => {
  const items = autoStage(spec)
  for (const it of items) {
    if (catalogItem(it.type).place === "parking") continue
    const fp = footprint(it)
    const floor = spec.floors.find(f => f.level === it.level)
    for (const w of floor.walls) assert.ok(!overlap(fp, wallBox(w)), `${it.type} が壁 ${JSON.stringify(w)} と重なる`)
    assert.ok(fp.x0 >= 0 && fp.z0 >= 0 && fp.x1 <= spec.footprint.width && fp.z1 <= spec.footprint.depth, `${it.type} が建物外`)
    for (const o of items) {
      if (o === it || o.level !== it.level || catalogItem(o.type).flat || catalogItem(it.type).flat) continue
      assert.ok(!overlap(fp, footprint(o)), `${it.type} と ${o.type} が重なる`)
    }
  }
})

test("おまかせ配置: ドアの前 0.9m をふさがない", () => {
  const items = autoStage(spec)
  for (const floor of spec.floors) {
    for (const d of floor.walls.filter(w => w.kind === "door")) {
      const alongX = d.w >= d.d
      const clear = alongX ? { x0: d.x, x1: d.x + d.w, z0: d.z - 0.9, z1: d.z + d.d + 0.9 } : { x0: d.x - 0.9, x1: d.x + d.w + 0.9, z0: d.z, z1: d.z + d.d }
      for (const it of items.filter(i => i.level === floor.level && !catalogItem(i.type).flat && catalogItem(i.type).place !== "parking")) {
        assert.ok(!overlap(footprint(it), clear), `${it.type} がドア (${d.x},${d.z}) の前をふさぐ`)
      }
    }
  }
})

test("車は駐車場の中に収まり、道路側を向く", () => {
  const car = autoStage(spec).find(i => i.type === "car")
  const p = siteLayout(spec).parking
  const fp = footprint(car)
  assert.ok(fp.x0 >= p.x0 && fp.x1 <= p.x1 && fp.z0 >= p.z0 && fp.z1 <= p.z1, JSON.stringify({ fp, p }))
  assert.equal(car.ry, 0)
})

test("手動配置: 壁際に落としたソファは壁に背を付け、部屋の内側を向く", () => {
  // LDK の東の壁（x = 9.1 - 0.15）付近に、向きを気にせず置く
  const placed = snapItem(spec, { id: "t1", type: "sofa", level: 0, x: 8.5, z: 5.2, ry: 0 }, [])
  const fp = footprint(placed)
  assert.equal(placed.ry, -90, "東の壁を背に西向き")
  assert.ok(Math.abs(fp.x1 - (spec.footprint.width - 0.15)) < 0.05, `背が壁に付く: ${fp.x1}`)
  // 駐車場の近くに落とした車は駐車場の中央へ
  const p = siteLayout(spec).parking
  const car = snapItem(spec, { id: "c1", type: "suv", level: 0, x: p.x0 + 0.3, z: p.z0 + 1, ry: 30 }, [])
  assert.ok(Math.abs(car.x - (p.x0 + p.x1) / 2) < 0.01)
})

test("部屋の範囲: LDK の重心から壁で囲まれた矩形を求める", () => {
  const f = spec.floors[0]
  const ldk = f.rooms.find(r => r.name === "LDK")
  const b = roomBox(f, { x0: 0, x1: spec.footprint.width, z0: 0, z1: spec.footprint.depth }, ldk.x, ldk.z)
  assert.ok(b.x1 - b.x0 > 5.5 && b.z1 - b.z0 > 6.5, JSON.stringify(b))
})

test("カタログ: Three.js と Blender が同じ部品を展開する", () => {
  const py = JSON.parse(
    execFileSync("python", ["-c", `
import json, sys
sys.path.insert(0, "blender")
from furniture import load_catalog, expand_parts
cat = load_catalog()
print(json.dumps({t: expand_parts(cat, t) for t in cat["items"]}))
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" }),
  )
  for (const type of Object.keys(CATALOG.items)) {
    const ts = expandParts(type)
    assert.equal(py[type].length, ts.length, type)
    ts.forEach((p, i) => {
      const q = py[type][i]
      for (let k = 0; k < 3; k++) {
        assert.ok(Math.abs(p.p[k] - q.p[k]) < 1e-6, `${type}[${i}].p`)
        assert.ok(Math.abs((p.rot ?? [0, 0, 0])[k] - (q.rot ?? [0, 0, 0])[k]) < 1e-6, `${type}[${i}].rot`)
      }
    })
  }
})

test("水回り・照明: 浴槽・洗面台・トイレと、各部屋の天井照明・ダイニングのペンダント", () => {
  const items = autoStage(spec)
  const types = items.map(i => i.type)
  for (const t of ["bathtub", "washbasin", "toilet", "ceilingLight", "pendant"]) assert.ok(types.includes(t), t)
  const dining = items.find(i => i.type === "diningSet")
  const pendant = items.find(i => i.type === "pendant")
  assert.deepEqual([pendant.x, pendant.z, pendant.level], [dining.x, dining.z, dining.level], "ペンダントはテーブルの真上")
  // 全部屋（ラベル）の矩形に天井の器具が 1 つ以上
  const fp = { x0: 0, x1: spec.footprint.width, z0: 0, z1: spec.footprint.depth }
  for (const f of spec.floors) {
    for (const r of f.rooms) {
      const b = roomBox(f, fp, r.x, r.z)
      const n = items.filter(i => i.level === f.level && catalogItem(i.type).mount === "ceiling" && i.x > b.x0 && i.x < b.x1 && i.z > b.z0 && i.z < b.z1).length
      assert.ok(n >= 1, `${f.level}F ${r.name} に照明がない`)
    }
  }
  // 天井付けの器具は通行の障害物にならない（flat）
  for (const t of ["ceilingLight", "pendant"]) assert.ok(catalogItem(t).flat && catalogItem(t).mount === "ceiling")
})

test("家具は階段・上り口・上がり口・吹き抜けの手すり壁に重ならない", () => {
  for (const s of [parseBuildingSpec(spec), generateFromMassing(DEFAULT_MASSING)]) {
    const items = autoStage(s)
    for (const it of items.filter(i => !catalogItem(i.type).flat && catalogItem(i.type).place !== "parking")) {
      for (const k of stairKeepouts(s, it.level)) assert.ok(!overlap(footprint(it), k), `${s.name} ${it.level}F ${it.type} が階段まわり ${JSON.stringify(k)} に重なる`)
    }
  }
})

test("天井の高さ: Three.js と Blender で同じ（最上階は屋根下、それ以外は上階スラブの下面）", () => {
  const py = JSON.parse(
    execFileSync("python", ["-c", `
import json, sys
sys.path.insert(0, "blender")
from furniture import ceiling_height
spec = json.load(open("src/data/sample-spec.json", encoding="utf-8"))
print(json.dumps([ceiling_height(spec, f["level"]) for f in spec["floors"]]))
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" }),
  )
  assert.deepEqual(spec.floors.map(f => ceilingHeight(spec, f.level)), py)
  assert.ok(Math.abs(py[0] - 2.65) < 1e-9 && Math.abs(py[1] - 2.795) < 1e-9)
})

test("3D モデル: 同梱 GLB の契約（ライセンス・出典・寸法・材質名・サイズ・CSP で読める形式）", () => {
  const env = { ...process.env, PYTHONIOENCODING: "utf-8" }
  const cwd = new URL("..", import.meta.url)
  execFileSync("python", ["scripts/fetch_models.py", "--check"], { cwd, encoding: "utf8", env })
  const glbs = Object.values(CATALOG.items).filter(c => c.model).map(c => `src/assets/models/${c.model.file}`)
  assert.ok(glbs.length >= 2)
  execFileSync("python", ["scripts/validate_3d_assets.py", ...glbs.flatMap(g => ["--glb", g]), "--material-keys", "", "--material-prefix", "furn_", "--allow-embedded-images", "--max-glb-bytes", "1200000"], { cwd, encoding: "utf8", env })
})

test("3D モデル: おまかせ配置で実物のモデルに置き換え、壁付けは背を壁に付けたまま・他と重ならない", () => {
  const items = autoStage(spec, { models: true })
  const sofa = items.find(i => i.type === "sofaModel")
  assert.ok(sofa, "ソファが 3D モデルになる")
  assert.ok(items.some(i => i.type === "coffeeTableModel"))
  // 置き換え前と同じ壁に背が付く: 手続き生成版の背面と同じ位置
  const prim = autoStage(spec).find(i => i.type === "sofa")
  const back = (it) => { const c = catalogItem(it.type); const a = (it.ry * Math.PI) / 180; return [it.x - Math.sin(a) * c.d / 2, it.z - Math.cos(a) * c.d / 2] }
  const [bx, bz] = back(sofa)
  const [px, pz] = back({ ...prim, x: prim.x, z: prim.z })
  assert.ok(Math.abs(bx - px) < 0.02 && Math.abs(bz - pz) < 0.02, `背面 ${bx},${bz} vs ${px},${pz}`)
  for (const it of items.filter(i => !catalogItem(i.type).flat && catalogItem(i.type).place !== "parking")) {
    for (const o of items) {
      if (o === it || o.level !== it.level || catalogItem(o.type).flat) continue
      assert.ok(!overlap(footprint(it), footprint(o)), `${it.type} と ${o.type} が重なる`)
    }
  }
  // モデルが元より大きいときは置き換えない
  assert.equal(toModelVariant({ id: "x", type: "rug", level: 0, x: 1, z: 1, ry: 0 }).type, "rug")
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PNG } from "pngjs"
import { applyFloorplanEdits, editRect, imageRect, manualFloorplan, modelRect, removePlanImage, replacePlanImages, restoreEditedWalls, swapPlanImages, validateEdits } from "../src/lib/floorplan-edits.ts"
import { analyzeFloorplan, DEFAULT_FLOORPLAN_OPTIONS, specFromFloorplans } from "../src/lib/floorplan-analyzer.ts"
import { DEFAULT_MATERIALS, parseBuildingSpec } from "../src/lib/building-spec.ts"

const size = { width: 800, height: 600 }
const base = () => ({
  bboxPx: { x: 100, y: 50, w: 600, h: 500 }, pxPerMeter: 100,
  footprint: { width: 6, depth: 5 }, floorArea: 30, fixtures: [], stairHints: [],
  stats: { walls: 5, windows: 0, doors: 0, rooms: 2, cellMeters: 0.05 },
  applied: { threshold: 110, cleanRadius: 2, wallPx: 15 },
  scaleCheck: { wallMeters: 0.15, suggestedWidth: null },
  floor: { level: 0, height: 2.8, slabs: [{ x: 0, z: 0, w: 6, d: 5 }],
    rooms: [{ name: "LDK", x: 1.5, z: 2.5, area: 14 }, { name: "洋室1", x: 4.5, z: 2.5, area: 14 }],
    walls: [
      { x: 0, z: 0, w: 6, d: 0.15, kind: "wall", outside: ["-z"] },
      { x: 0, z: 4.85, w: 6, d: 0.15, kind: "wall", outside: ["+z"] },
      { x: 0, z: 0.15, w: 0.15, d: 4.7, kind: "wall", outside: ["-x"] },
      { x: 5.85, z: 0.15, w: 0.15, d: 4.7, kind: "wall", outside: ["+x"] },
      { x: 2.9, z: 0.15, w: 0.15, d: 4.7, kind: "wall" },
    ] },
})
let n = 0
const edit = (result, category, r, extra = {}) => ({ id: `edit-${n++}`, category, ...imageRect(r, size, result), ...extra })
const at = (r, x, z) => r.floor.walls.filter(w => x > w.x - 0.0001 && x < w.x + w.w + 0.0001 && z > w.z - 0.0001 && z < w.z + w.d + 0.0001)
const area = rs => rs.reduce((a, r) => a + r.w * r.d, 0)

test("補正なしの結果は同じオブジェクト・同じ出力を返す", () => {
  const b = base()
  assert.equal(applyFloorplanEdits(b, [], size), b)
})

test("窓を手動追加すると既存の壁を切り抜き、外周面と残りの壁を保持する（元結果を変更しない）", () => {
  const b = base(), before = JSON.stringify(b)
  const e = edit(b, "window", { x: 1, z: 0, w: 0.8, d: 0.15 })
  const r = applyFloorplanEdits(b, [e], size)
  assert.equal(JSON.stringify(b), before)
  assert.equal(at(r, 1.4, 0.07).length, 1)
  assert.equal(at(r, 1.4, 0.07)[0].kind, "window")
  assert.deepEqual(at(r, 1.4, 0.07)[0].outside, ["-z"])
  assert.equal(at(r, 0.5, 0.07)[0].kind, "wall")
  assert.ok(Math.abs(area(r.floor.walls) - area(b.floor.walls)) < 0.001)
})

test("壁→扉→消去の後勝ち指定ができ、消去領域に設備や階段の自動候補が残らない", () => {
  const b = base(), box = { x: 2.85, z: 2, w: 0.3, d: 0.8 }
  b.fixtures = [{ ...box, kind: "washer", lines: [1, 1, 1, 1] }]
  b.stairHints = [{ ...box, axis: "z", lines: 6, strong: true }]
  const door = edit(b, "door", box), erase = edit(b, "erase", box)
  const r = applyFloorplanEdits(b, [door], size)
  assert.ok(at(r, 3, 2.4).every(w => w.kind === "door"))
  assert.equal(r.fixtures.length, 0)
  assert.equal(r.stairHints.length, 0)
  assert.equal(at(applyFloorplanEdits(b, [door, erase], size), 3, 2.4).length, 0)
  assert.equal(at(applyFloorplanEdits(b, [erase, door], size), 3, 2.4)[0].kind, "door")
})

test("矩形分割で、新しい切断面に元の外壁属性をコピーしない", () => {
  const b = base()
  b.floor.walls = [{ x: 0, z: 0, w: 6, d: 0.3, kind: "wall", outside: ["-z", "-x", "+x"] }]
  const r = applyFloorplanEdits(b, [edit(b, "erase", { x: 2, z: 0.1, w: 1, d: 0.2 })], size)
  const innerPiece = r.floor.walls.find(w => w.x === 3 && w.z === 0.1)
  assert.ok(innerPiece)
  assert.deepEqual(innerPiece.outside, ["+x"])
})

test("画像サイズと縮尺を変えても同じ元画像比率の場所に補正を適用する", () => {
  const b = base(), e = edit(b, "window", { x: 1, z: 0, w: 1, d: 0.15 })
  const doubled = { ...b, bboxPx: { x: 200, y: 100, w: 1200, h: 1000 }, pxPerMeter: 200 }
  assert.deepEqual(modelRect(e, { width: 1600, height: 1200 }, doubled), modelRect(e, size, b))
  const scaled = { ...b, pxPerMeter: 50 }
  assert.deepEqual(modelRect(e, size, scaled), { x: 2, z: 0, w: 2, d: 0.3 })
  assert.deepEqual(editRect({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.3 }), { x: 0.2, y: 0.3, w: 0.6000000000000001, h: 0.6000000000000001 })
})

test("収納や水回りをクリック・領域で再分類し、生成時の自動命名で上書きされない", () => {
  const b = base()
  const storage = edit(b, "storage", { x: 3.5, z: 1, w: 2, d: 3 })
  const washroom = edit(b, "washroom", { x: 1.49, z: 2.49, w: 0.02, d: 0.02 }, { point: true })
  const r = applyFloorplanEdits(b, [storage, washroom], size)
  assert.deepEqual(r.floor.rooms.map(r => r.name), ["洗面所", "収納"])
  const s = specFromFloorplans([r], { name: "手動", roof: "flat", pitch: 0, materials: DEFAULT_MATERIALS, withPerspective: false })
  assert.ok(s.floors[0].rooms.some(r => r.name === "収納"))
  assert.ok(s.floors[0].rooms.some(r => r.name === "洗面所"))
  assert.ok(parseBuildingSpec(s).floors[0].rooms.some(r => r.name === "収納"))
})

test("壁を全く検出できない画像も、床範囲を指定して手描きで作成できる（明示表示）", () => {
  const img = { width: 300, height: 250, data: new Uint8ClampedArray(300 * 250 * 4).fill(255) }
  assert.throws(() => analyzeFloorplan(img, DEFAULT_FLOORPLAN_OPTIONS), /壁を検出できませんでした/)
  const edits = [
    { id: "floor", category: "floor", x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    { id: "wall", category: "wall", x: 0.1, y: 0.1, w: 0.8, h: 0.02 },
    { id: "win", category: "window", x: 0.4, y: 0.1, w: 0.2, h: 0.02 },
    { id: "storage", category: "storage", x: 0.6, y: 0.4, w: 0.2, h: 0.2 },
  ]
  const r = analyzeFloorplan(img, { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 6, edits })
  assert.equal(r.manualOnly, true)
  assert.equal(r.footprint.width, 6)
  assert.ok(r.floor.slabs.length > 0)
  assert.equal(r.floor.rooms[0].name, "収納")
  assert.ok(r.floor.walls.some(w => w.kind === "window"))
  assert.ok(r.floor.walls.every(w => w.x >= 0 && w.z >= 0))
})

test("不正なカテゴリ・座標・重複 ID・全て範囲外の指定は明示エラーにする", () => {
  const b = base(), e = edit(b, "wall", { x: 1, z: 1, w: 1, d: 0.15 })
  for (const change of [{ x: NaN }, { w: -1 }, { category: "unknown" }, { x: 1.1 }]) {
    assert.throws(() => validateEdits([{ ...e, ...change }]), /手動補正/)
  }
  assert.throws(() => validateEdits([e, e]), /手動補正/)
  assert.throws(() => applyFloorplanEdits(b, [{ ...e, x: 0, y: 0, w: 0.02, h: 0.02 }], size), /範囲外/)
  assert.throws(() => manualFloorplan(size, 6, 0, 2.8, []), /床範囲/)
})

test("指定データは JSON 保存後も同一結果を生成し、自動解析の再実行にも残る", () => {
  const p = PNG.sync.read(readFileSync(new URL("../public/samples/floorplan-1f.png", import.meta.url)))
  const img = { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) }
  const r = analyzeFloorplan(img, DEFAULT_FLOORPLAN_OPTIONS)
  const w = r.floor.walls.find(w => w.kind === "wall" && w.w > 1)
  assert.ok(w)
  const e = { id: "window", category: "window", ...imageRect(w, img, r) }
  const opts = { ...DEFAULT_FLOORPLAN_OPTIONS, edits: [e] }
  const a = analyzeFloorplan(img, opts)
  const b = analyzeFloorplan(img, JSON.parse(JSON.stringify(opts)))
  assert.deepEqual(a, b)
  assert.ok(a.floor.walls.some(w => w.kind === "window"))
  assert.deepEqual(analyzeFloorplan(img, DEFAULT_FLOORPLAN_OPTIONS), r)
})

test("階の入れ替えは画像・補正・縮尺を一緒に移動し、差し替えと削除はその階だけの補正を外す", () => {
  const b = base(), e = edit(b, "storage", { x: 3, z: 1, w: 2, d: 2 })
  const images = { perspective: "exterior", floorplans: { "0": "first", "1": "second" },
    floorplanEdits: { "0": [e], "1": [] }, floorplanSettings: { "0": { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 6 }, "1": { ...DEFAULT_FLOORPLAN_OPTIONS, level: 1, widthMeters: 7 } } }
  const swapped = swapPlanImages(images, "0", "1")
  assert.equal(swapped.floorplans["1"], "first")
  assert.deepEqual(swapped.floorplanEdits["1"], [e])
  assert.equal(swapped.floorplanSettings["1"].widthMeters, 6)
  assert.equal(swapped.floorplanSettings["1"].level, 1)
  assert.deepEqual(swapPlanImages(swapped, "0", "1"), images)
  const replaced = replacePlanImages(images, { "1": "new" }, false)
  assert.deepEqual(replaced.floorplanEdits["0"], [e])
  assert.equal(replaced.floorplanSettings["1"], undefined)
  const removed = removePlanImage(images, "0")
  assert.equal(removed.floorplanEdits["0"], undefined)
  assert.equal(removed.floorplanSettings["0"], undefined)
  assert.equal(removed.floorplans["1"], "second")
  assert.equal(images.floorplans["0"], "first")
})

test("階段の自動補完で壁が消えても、指定範囲の確定した壁・扉・消去を復元する", () => {
  const b = base(), doorBox = { x: 2.85, z: 2, w: 0.3, d: 0.8 }
  const confirmed = applyFloorplanEdits(b, [edit(b, "door", doorBox)], size)
  const changed = { ...b.floor, walls: [] }
  const restored = restoreEditedWalls(changed, confirmed.floor, [doorBox])
  assert.ok(restored.walls.some(w => w.kind === "door"))
  const erased = applyFloorplanEdits(b, [edit(b, "erase", doorBox)], size)
  const restoreErase = restoreEditedWalls(b.floor, erased.floor, [doorBox])
  assert.equal(at({ floor: restoreErase }, 3, 2.4).length, 0)
})

test("補正した扉は3Dと同じ半径22cmの当たり判定で通れ、窓・壁は通れない", () => {
  const b = base(), box = { x: 2.85, z: 2, w: 0.3, d: 1 }
  const free = (floor, x, z) => floor.walls.every(w => w.kind === "door" ||
    (x - Math.max(w.x, Math.min(x, w.x + w.w))) ** 2 + (z - Math.max(w.z, Math.min(z, w.z + w.d))) ** 2 >= 0.22 ** 2)
  const door = applyFloorplanEdits(b, [edit(b, "door", box)], size)
  const window = applyFloorplanEdits(b, [edit(b, "window", box)], size)
  for (let x = 2.5; x < 3.5; x += 0.05) assert.ok(free(door.floor, x, 2.5))
  assert.equal(free(window.floor, 3, 2.5), false)
  assert.equal(free(b.floor, 3, 2.5), false)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PNG } from "pngjs"
import { analyzeFloorplan, DEFAULT_FLOORPLAN_OPTIONS, specFromFloorplans } from "../src/lib/floorplan-analyzer.ts"
import { computeQuantities, generateFromMassing, DEFAULT_MASSING, DEFAULT_MATERIALS, parseBuildingSpec } from "../src/lib/building-spec.ts"

const load = name => {
  const png = PNG.sync.read(readFileSync(new URL(`../public/samples/${name}`, import.meta.url)))
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }
}

test("1F 間取り図: 外形寸法・開口部・部屋を検出する", () => {
  const r = analyzeFloorplan(load("floorplan-1f.png"), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 9.1 })
  console.log(JSON.stringify(r.stats), r.footprint, r.floor.rooms.map(x => `${x.name}:${x.area}`).join(", "))
  assert.ok(Math.abs(r.footprint.width - 9.1) < 0.1, `width ${r.footprint.width}`)
  assert.ok(Math.abs(r.footprint.depth - 7.28) < 0.15, `depth ${r.footprint.depth}`)
  const kinds = r.floor.walls.reduce((m, w) => ((m[w.kind] = (m[w.kind] ?? 0) + 1), m), {})
  assert.ok(kinds.glassdoor >= 2, "南面の掃き出し窓 2 箇所")
  assert.ok(kinds.window >= 3, "窓")
  assert.ok(kinds.door >= 3, "玄関 + 室内ドア")
  // 玄関は外周に面したドア
  assert.ok(r.floor.walls.some(w => w.kind === "door" && w.outside?.includes("+z")), "玄関ドアが南面にある")
  assert.ok(r.floor.rooms.length >= 4 && r.floor.rooms.length <= 6, `rooms ${r.floor.rooms.length}`)
  assert.equal(r.floor.rooms[0].name, "LDK")
  assert.ok(r.floor.rooms[0].area > 38 && r.floor.rooms[0].area < 46, `LDK area ${r.floor.rooms[0].area}`)
  // 開口部は rect 単位ではなく 1 箇所ずつ数える（窓 4 + 掃き出し窓 2、玄関 + 室内ドア 3）
  const q = computeQuantities(specFromFloorplans([r], { name: "t", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false }))
  assert.equal(q.windowCount, 6)
  assert.equal(q.doorCount, 4)
})

test("2F 間取り図: 廊下を開口扱いせず 5 室を検出する", () => {
  const r = analyzeFloorplan(load("floorplan-2f.png"), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 9.1, level: 1 })
  console.log(JSON.stringify(r.stats), r.floor.rooms.map(x => `${x.name}:${x.area}`).join(", "))
  assert.equal(r.floor.rooms.length, 5)
  assert.ok(r.stats.doors >= 4)
  assert.ok(!r.floor.rooms.some(x => x.name === "LDK"))
})

test("手続き生成: 階数・部屋・数量が整合する", () => {
  const spec = generateFromMassing(DEFAULT_MASSING)
  assert.equal(spec.floors.length, 2)
  const q = computeQuantities(spec)
  assert.ok(Math.abs(q.floorArea - 9.1 * 7.28 * 2) < 0.01)
  assert.ok(q.windowCount > 4)
  assert.ok(spec.floors[0].walls.some(w => w.kind === "door" && w.outside?.includes("+z")))
  // JSON 往復（Blender へ渡す形式）で欠落しない
  const back = parseBuildingSpec(JSON.parse(JSON.stringify(spec)))
  assert.deepEqual(back.floors[1].walls.length, spec.floors[1].walls.length)
})

test("parseBuildingSpec: 不正な JSON を拒否する", () => {
  assert.throws(() => parseBuildingSpec({ floors: [] }), /footprint/)
  assert.throws(() => parseBuildingSpec({ footprint: { width: 5, depth: 5 }, floors: [{ walls: [{ x: "a" }] }] }), /数値/)
})

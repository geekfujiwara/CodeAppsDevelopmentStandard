// サンプル間取り図（public/samples/floorplan-*.png）を解析して、サンプル案件用の BuildingSpec を生成する。
// 出力: src/data/sample-spec.json（アプリの初期データ。Code Apps は fetch 不可のためバンドルする）,
//       public/samples/sample-spec.json（ダウンロード用）, blender/samples/sample-spec.json（Blender 入力例）
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { PNG } from "pngjs"
import { analyzeFloorplan, DEFAULT_FLOORPLAN_OPTIONS, specFromFloorplans } from "../src/lib/floorplan-analyzer.ts"
import { DEFAULT_MATERIALS } from "../src/lib/building-spec.ts"
import { autoStage, roomBox } from "../src/lib/furniture.ts"
import { withAutoStairs } from "../src/lib/stairs.ts"

const load = name => {
  const png = PNG.sync.read(readFileSync(new URL(`../public/samples/${name}`, import.meta.url)))
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }
}

const results = ["floorplan-1f.png", "floorplan-2f.png"].map((f, level) =>
  analyzeFloorplan(load(f), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 9.1, level }),
)
const spec = specFromFloorplans(results, { name: "サンプル邸 2 階建て", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: true })
spec.floors[0].rooms = spec.floors[0].rooms.map(r => (r.area > 8 && r.area < 10 ? { ...r, name: "玄関・ホール" } : r))
// 2F の細長い部屋（幅 1.5m 未満）は廊下
spec.floors.slice(1).forEach(f => {
  let n = 0
  f.rooms = f.rooms.map(r => {
    const box = roomBox(f, { x0: 0, x1: spec.footprint.width, z0: 0, z1: spec.footprint.depth }, r.x, r.z)
    return Math.min(box.x1 - box.x0, box.z1 - box.z0) < 1.5 ? { ...r, name: "廊下" } : { ...r, name: `洋室${++n}` }
  })
})
// 間取り解析は階段記号を拾えないため、置ける場所を探して階段を足す（読み込み時の自動配置と同じ）
const staired = withAutoStairs(spec)
// サンプルは家具・水回り・照明・車をおまかせ配置（3D モデルがあれば使う）した状態で配る（ID は差分が出ないよう固定）
staired.furniture = autoStage(staired, { models: true }).map((f, i) => ({ ...f, id: `seed-f${String(i + 1).padStart(2, "0")}` }))
const json = JSON.stringify(staired, null, 1) + "\n"
for (const dir of ["public/samples", "blender/samples", "src/data"]) {
  mkdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true })
  writeFileSync(new URL(`../${dir}/sample-spec.json`, import.meta.url), json)
}
console.log(`sample-spec.json: ${staired.floors.length} floors, ${staired.floors.reduce((s, f) => s + f.walls.length, 0)} wall rects, ${staired.stairs.length} stairs, ${staired.furniture.length} items, ${json.length} bytes`)

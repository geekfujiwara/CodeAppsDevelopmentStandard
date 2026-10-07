import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { analyzeFloorplan, chooseScale, DEFAULT_FLOORPLAN_OPTIONS, nameRooms, relativeTones, roomTone, scaleCandidates, specFromFloorplans, structureScore } from "../src/lib/floorplan-analyzer.ts"
import { DEFAULT_MATERIALS, parseBuildingSpec } from "../src/lib/building-spec.ts"
import { canStep, guardBlocks, stairFromHints, stairLayout, walkSurface } from "../src/lib/stairs.ts"
import { placePlanFixtures } from "../src/lib/plan-fixtures.ts"
import { autoStage } from "../src/lib/furniture.ts"

/**
 * 不動産サイト風の色付き間取り図（1F）を合成する。壁 = 灰色（縁が濃い）、居室 = 水色、収納 = 緑、トイレ = 桃色、玄関 = 灰色の土間。
 * 窓は外壁の中の細い 2 本線、階段は等間隔の細線、外に敷地の破線と「1F」の文字の塊。縮尺 50px/m、小さい画像（250px 前後）
 */
function coloredPlan() {
  const PPM = 50
  const M = 40
  const W = 3.64
  const D = 6.37
  const w = Math.round(W * PPM) + 2 * M
  const h = Math.round(D * PPM) + 2 * M + 30
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  const px = v => Math.round(M + v * PPM)
  const fill = (x0, z0, x1, z1, rgb) => {
    for (let y = px(z0); y < px(z1); y++) for (let x = px(x0); x < px(x1); x++) {
      const i = (y * w + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
    }
  }
  const pix = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    data[i] = rgb[0]
    data[i + 1] = rgb[1]
    data[i + 2] = rgb[2]
  }
  const T = 0.15
  const wall = (x0, z0, x1, z1) => {
    fill(x0, z0, x1, z1, [186, 188, 188])
    for (let y = px(z0); y < px(z1); y++) { pix(px(x0), y, [118, 120, 120]); pix(px(x1) - 1, y, [118, 120, 120]) }
    for (let x = px(x0); x < px(x1); x++) { pix(x, px(z0), [118, 120, 120]); pix(x, px(z1) - 1, [118, 120, 120]) }
  }
  const BLUE = [198, 232, 253]
  // 塗り
  fill(0, 0, W, D, BLUE)
  fill(0, 0, 1.0, 1.7, [251, 238, 224]) // トイレ
  fill(1.0, 0, 2.4, 1.2, [233, 234, 234]) // 玄関（灰色の土間）
  fill(2.4, 0, W, 1.2, [207, 236, 221]) // 収納
  // 外壁（上: 玄関の扉 1.2〜2.0 は開口、下: 窓 1.0〜2.6 は細線 2 本）
  wall(0, 0, 1.2, T); wall(2.0, 0, W, T)
  wall(0, D - T, 1.0, D); wall(2.6, D - T, W, D)
  for (const zz of [D - T + 0.03, D - 0.04]) for (let x = px(1.0); x < px(2.6); x++) pix(x, px(zz), [150, 152, 152])
  wall(0, 0, T, D); wall(W - T, 0, W, D)
  // 間仕切り（トイレ: 扉 0.9〜1.6 は開口、収納: 扉 2.62〜3.15 は開口。扉の脇には 0.25m 以上の袖壁）
  wall(1.0 - T / 2, 0, 1.0 + T / 2, 0.9); wall(1.0 - T / 2, 1.6, 1.0 + T / 2, 1.7 + T); wall(0, 1.7, 1.0 + T / 2, 1.7 + T)
  wall(2.4 - T / 2, 0, 2.4 + T / 2, 1.2 + T); wall(2.4, 1.2, 2.62, 1.2 + T); wall(3.15, 1.2, W, 1.2 + T)
  // 階段の記号（左の列、0.2m 間隔の細線 6 本）
  for (let k = 0; k < 6; k++) for (let x = px(T); x < px(0.95); x++) pix(x, px(2.5 + k * 0.2), [96, 98, 98])
  // 敷地の破線と「1F」の文字の塊（建物の外）
  for (let x = px(-0.6); x < px(W + 0.6); x++) if (Math.floor(x / 6) % 2 === 0) pix(x, px(D + 0.45), [168, 168, 168])
  for (let y = px(D + 0.55); y < px(D + 0.55) + 14; y++) for (let x = M; x < M + 18; x++) if ((x + y) % 3) pix(x, y, [110, 110, 110])
  return { width: w, height: h, data }
}

test("色付きの間取り図: 灰色の壁を検出し、色で部屋の種類を決め、玄関は灰色の土間側の開口にする", () => {
  const r = analyzeFloorplan(coloredPlan(), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 3.64, level: 0 })
  assert.ok(Math.abs(r.footprint.width - 3.64) < 0.1 && Math.abs(r.footprint.depth - 6.37) < 0.15, JSON.stringify(r.footprint))
  assert.ok(r.applied.threshold > 150, `しきい値 ${r.applied.threshold}（灰色の壁を拾える高さ）`)
  const names = r.floor.rooms.map(x => x.name)
  assert.ok(names.includes("LDK"), names.join(","))
  assert.ok(names.some(n => n.startsWith("トイレ")), names.join(","))
  assert.ok(names.some(n => n.startsWith("収納")), names.join(","))
  // 上の外壁の 1.2〜2.0 は玄関（ドア）、下の外壁の細線 2 本は窓
  const top = r.floor.walls.filter(x => x.kind === "door" && x.z < 0.2 && x.x >= 1.1 && x.x + x.w <= 2.1)
  assert.ok(top.length > 0, "玄関")
  assert.ok(r.floor.walls.some(x => (x.kind === "window" || x.kind === "glassdoor") && x.z > 6.1 && x.x >= 0.9 && x.x + x.w <= 2.7), "下の窓")
  assert.ok(!r.floor.walls.some(x => x.kind === "door" && x.z > 6.1), "下の窓を玄関にしない")
  // 階段の記号
  assert.equal(r.stairHints.length, 1)
  assert.equal(r.stairHints[0].axis, "z")
  assert.ok(Math.abs(r.stairHints[0].z - 2.5) < 0.1 && Math.abs(r.stairHints[0].d - 1.0) < 0.1, JSON.stringify(r.stairHints[0]))
  // 縮尺は正しいので提案しない
  assert.equal(r.scaleCheck.suggestedWidth, null)
})

test("色付きの間取り図: 横幅の入力が違うと、壁の厚みから正しい横幅を提案する", () => {
  const r = analyzeFloorplan(coloredPlan(), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 9.1, level: 0 })
  assert.ok(r.scaleCheck.wallMeters > 0.25, `${r.scaleCheck.wallMeters}`)
  assert.ok(Math.abs(r.scaleCheck.suggestedWidth - 3.64) < 0.5, `${r.scaleCheck.suggestedWidth}`)
})

test("塗りの色の系統: 水色 = 居室、緑 = 収納、桃色 = 水回り、灰色 = 判断しない", () => {
  assert.equal(roomTone(198, 232, 253), "living")
  assert.equal(roomTone(207, 236, 221), "storage")
  assert.equal(roomTone(251, 238, 224), "wet")
  assert.equal(roomTone(233, 234, 234), "neutral")
})

test("間取り図の階段記号から回り階段を作り、1F の横の開口から 2F まで歩いて上がれる", () => {
  // 撮影した間取り（狭小 2 階建て）と同じ構成: 左の列に階段、北はトイレの壁でふさがり、DK 側の縁に開口がある
  const T = 0.15
  const lower = {
    level: 0, height: 2.8, slabs: [{ x: 0, z: 0, w: 3.64, d: 6.37 }], rooms: [{ name: "LDK", x: 2, z: 4, area: 14 }],
    walls: [
      { x: 0, z: 0, w: T, d: 6.37, kind: "wall" },
      { x: 0.15, z: 1.7, w: 0.8, d: 0.2, kind: "wall" }, // トイレの壁（階段の北をふさぐ）
      { x: 0.95, z: 1.05, w: 0.1, d: 2.85, kind: "wall" }, // 階段の縁の線（壁として拾われる）
      { x: 1.05, z: 1.9, w: 0.05, d: 0.8, kind: "door" }, // 縁の横の開口
      // 階段下収納の仕切り（色の境界の 1 セルの壁）。扉で途切れて、壁 1 本では列の半分に届かない
      { x: 0.15, z: 2.83, w: 0.35, d: 0.05, kind: "wall" },
      { x: 0.5, z: 2.83, w: 0.4, d: 0.05, kind: "door" },
    ],
  }
  const upper = {
    level: 1, height: 2.8, slabs: [{ x: 0, z: 0, w: 3.64, d: 6.37 }], rooms: [{ name: "洋室1", x: 2.2, z: 2.4, area: 10 }],
    walls: [
      { x: 0, z: 0, w: T, d: 6.37, kind: "wall" },
      { x: 0.1, z: 1.7, w: 0.85, d: 0.15, kind: "wall" },
      { x: 0.95, z: 2.7, w: 0.15, d: 1.2, kind: "wall" },
      { x: 0.15, z: 3.8, w: 0.8, d: 0.1, kind: "wall" }, // 段の線（記号の中）
      { x: 0.05, z: 4.6, w: 0.4, d: 0.2, kind: "wall" }, // 南の壁（この向きには伸ばせない）
    ],
  }
  const fake = (floor, hints) => ({ floor, footprint: { width: 3.64, depth: 6.37 }, bboxPx: { x: 0, y: 0, w: 1, h: 1 }, pxPerMeter: 50, stats: {}, applied: {}, scaleCheck: {}, stairHints: hints })
  const spec = parseBuildingSpec(specFromFloorplans([fake(lower, []), fake(upper, [{ x: 0.1, z: 2.85, w: 0.91, d: 1.01, axis: "z", lines: 6, strong: true }])], { name: "t", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false }))
  const s = spec.stairs[0]
  assert.equal(s.shape, "winder")
  assert.equal(s.up, "+z")
  assert.equal(s.entry, "+x")
  assert.ok(Math.abs(s.z - 1.9) < 0.01 && Math.abs(s.x - 0.15) < 0.01 && Math.abs(s.w - 0.8) < 0.01, JSON.stringify(s))
  const lay = stairLayout(spec, s)
  // 図面の階段（長さ 1.96m・幅 0.8m、回り段 4 段）に合わせる。直進部の踏面は 15cm をわずかに下回る急な階段になる（記録に残す）
  assert.ok(lay.riser <= 0.23 + 1e-9 && lay.minTread >= 0.14, `蹴上げ ${lay.riser} 踏面 ${lay.minTread}`)
  // 2F の段の線は壁から外れ、1F の縁の線は開口の範囲だけ切れている
  assert.ok(!spec.floors[1].walls.some(w => w.z === 3.8 && w.x === 0.15), "段の線")
  assert.ok(!spec.floors[0].walls.some(w => w.kind === "wall" && w.x === 0.95 && w.z < 2.6 && w.z + w.d > 2.0), "縁の線の開口")
  // 階段の列を横切る仕切り（壁 + 扉）は、段の下になるので外す
  assert.ok(!spec.floors[0].walls.some(w => w.z === 2.83 && w.d === 0.05), "階段下の仕切り")
  // 歩く: DK（x 1.6）→ 西へ回り段に入る → 南へ上る
  const layouts = [lay]
  const FL = 0.45
  let level = 0
  let cur = walkSurface(spec, layouts, 1.6, 2.3, level, FL)
  const path = [[1.6, 2.3], [0.3, 2.3], [0.3, 2.3], [0.3, 4.2]]
  let overhead = false
  for (let i = 1; i < path.length; i++) {
    const [x0, z0] = path[i - 1]
    const [x1, z1] = path[i]
    for (let k = 1; k <= 40; k++) {
      const next = walkSurface(spec, layouts, x0 + ((x1 - x0) * k) / 40, z0 + ((z1 - z0) * k) / 40, level, FL)
      assert.ok(canStep(cur, next), `${i}/${k}: ${cur?.y} → ${next?.y}`)
      // 段の途中で上の階に切り替わった後も、頭上にある開口の縁の手すり壁では止まらない
      const x = x0 + ((x1 - x0) * k) / 40
      const z = z0 + ((z1 - z0) * k) / 40
      if (next.level === 1 && next.stair && cur?.stair) {
        overhead ||= guardBlocks(layouts, x, z, 1, 0.22, false)
        assert.ok(!guardBlocks(layouts, x, z, 1, 0.22, true), `手すり壁 ${i}/${k}: ${x},${z}`)
      }
      cur = next
      level = next.level
    }
  }
  assert.equal(level, 1)
  assert.ok(overhead, "上の階に切り替わる位置は開口の縁の手すり壁の近く（climbing で除外しないと止まる）")
  // 上の階の開口は図面の記号の範囲（z 2.85 から上端まで）。その手前の段の上（上の階の収納）は床が残り、上の階として歩ける
  assert.ok(s.opening && Math.abs(s.opening.z - 2.85) < 0.01 && Math.abs(s.opening.z + s.opening.d - (s.z + s.d)) < 0.01, JSON.stringify(s.opening))
  const closet = walkSurface(spec, layouts, 0.5, 2.3, 1, FL)
  assert.ok(closet && !closet.stair && Math.abs(closet.y - (2.8 + FL)) < 1e-9, "上の階の収納の床")
  assert.equal(walkSurface(spec, layouts, 0.5, 3.3, 1, FL)?.stair, true, "開口の中は段")
  // 上の階の床からは、開口の縁の手すり壁で止まる
  assert.ok(guardBlocks(layouts, 0.5, 2.7, 1, 0.22, false), "2F の床から開口へ踏み出せない")
  // 2F から下りて 1F に戻れる
  let back = walkSurface(spec, layouts, 0.3, 4.2, 1, FL)
  let lv = 1
  for (let k = 1; k <= 60; k++) {
    const next = walkSurface(spec, layouts, 0.3, 4.2 - (2.0 * k) / 60, lv, FL)
    assert.ok(canStep(back, next), `下り ${k}: ${back?.y} → ${next?.y}`)
    back = next
    lv = next.level
  }
  assert.equal(lv, 0)
})

test("画像の再圧縮で記号の位置がずれ、横の開口が検出できなくても、正面がふさがった階段は内側の横から入る回り階段にする", () => {
  const T = 0.15
  const lower = {
    level: 0, height: 2.8, slabs: [{ x: 0, z: 0, w: 3.64, d: 6.37 }], rooms: [{ name: "LDK", x: 2, z: 4, area: 14 }],
    walls: [
      { x: 0, z: 0, w: T, d: 6.37, kind: "wall" },
      { x: 0.15, z: 1.7, w: 0.8, d: 0.2, kind: "wall" },
      { x: 0.95, z: 1.05, w: 0.1, d: 2.85, kind: "wall" }, // 縁の線（開口は検出されていない）
      { x: 1.05, z: 2.25, w: 0.05, d: 0.1, kind: "wall" }, // 圧縮の切れ端
    ],
  }
  const upper = {
    level: 1, height: 2.8, slabs: [{ x: 0, z: 0, w: 3.64, d: 6.37 }], rooms: [],
    walls: [
      { x: 0, z: 0, w: T, d: 6.37, kind: "wall" },
      { x: 0.1, z: 1.7, w: 0.85, d: 0.15, kind: "wall" },
      { x: 0.15, z: 3.8, w: 0.8, d: 0.1, kind: "wall" }, // 段の線（端が外壁に付いている）
      { x: 0.05, z: 4.6, w: 0.4, d: 0.2, kind: "wall" },
    ],
  }
  const fake = (floor, hints) => ({ floor, footprint: { width: 3.64, depth: 6.37 }, bboxPx: { x: 0, y: 0, w: 1, h: 1 }, pxPerMeter: 50, stats: {}, applied: {}, scaleCheck: {}, stairHints: hints })
  const spec = specFromFloorplans([fake(lower, []), fake(upper, [{ x: 0.17, z: 2.85, w: 0.93, d: 1.01, axis: "z", lines: 6, strong: true }])], { name: "t", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false })
  const s = spec.stairs[0]
  assert.equal(s.shape, "winder")
  assert.equal(s.entry, "+x", "外壁側ではなく DK 側から入る")
  assert.ok(!spec.floors[0].walls.some(w => w.kind === "wall" && w.x === 0.95 && w.z < s.z + s.w - 0.05 && w.z + w.d > s.z + 0.05), "上り口の正方形の範囲は縁の線が切れている")
})

test("記号が無い 2 階建ては、生成の時点で自動配置の階段が入る", () => {
  const fake = level => ({ floor: { level, height: 2.8, walls: [], slabs: [{ x: 0, z: 0, w: 9.1, d: 7.3 }], rooms: [] }, footprint: { width: 9.1, depth: 7.3 }, bboxPx: { x: 0, y: 0, w: 1, h: 1 }, pxPerMeter: 50, stats: {}, applied: {}, scaleCheck: {}, stairHints: [] })
  const spec = specFromFloorplans([fake(0), fake(1)], { name: "t", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false })
  assert.equal(spec.stairs?.length, 1)
})

// 利用者が撮影した間取り図（リポジトリには含めない）があるときだけ動く
const local = [".tools/fp/01.png", ".tools/fp/02.png"].map(p => new URL(`../${p}`, import.meta.url))
test("撮影した間取り図（ローカルのみ）: 壁・部屋・階段が取れる", { skip: !local.every(u => existsSync(u)) }, async () => {
  const { PNG } = await import("pngjs")
  const load = u => { const p = PNG.sync.read(readFileSync(u)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) } }
  const res = local.map((u, level) => analyzeFloorplan(load(u), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 3.64, level }))
  const spec = parseBuildingSpec(specFromFloorplans(res, { name: "local", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false }))
  assert.ok(spec.floors.every(f => f.rooms.length >= 3))
  assert.equal(spec.stairs?.length, 1)
})

test("2F 以上には玄関（外へ出るドア）を作らない", () => {
  const r = analyzeFloorplan(coloredPlan(), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 3.64, level: 1 })
  assert.ok(!r.floor.walls.some(w => w.kind === "door" && w.outside?.length), JSON.stringify(r.floor.walls.filter(w => w.kind === "door" && w.outside?.length)))
})

test("玄関が図面の上側（-z）にあれば、建物ごと回して玄関を道路側（+z）に向ける", () => {
  const r = analyzeFloorplan(coloredPlan(), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 3.64, level: 0 })
  const spec = parseBuildingSpec(specFromFloorplans([r], { name: "t", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false }))
  const { width: W, depth: D } = spec.footprint
  const doors = spec.floors[0].walls.filter(w => w.kind === "door" && w.outside?.length)
  assert.ok(doors.length >= 1 && doors.every(w => w.outside.includes("+z") && w.z > D - 0.3), JSON.stringify(doors))
  // 図面の左上のトイレは、180° 回して右下に来る
  const toilet = spec.floors[0].rooms.find(x => x.name.startsWith("トイレ"))
  assert.ok(toilet && toilet.x > W / 2 && toilet.z > D / 2, JSON.stringify(toilet))
})

test("設備の記号: 洗面所の中の破線の正方形は洗濯機置き場。窓のある外壁に付いていてもエアコンの表記にしない", () => {
  const floor = {
    level: 0, height: 2.8, slabs: [{ x: 0, z: 0, w: 5, d: 6 }],
    rooms: [{ name: "洗面所1", x: 4.2, z: 2.2, area: 2.3 }],
    walls: [
      { x: 3.4, z: 1.5, w: 0.1, d: 1.3, kind: "wall" },
      { x: 5.05, z: 1.5, w: 0.15, d: 0.4, kind: "wall" },
      { x: 5.05, z: 1.9, w: 0.15, d: 0.9, kind: "window", outside: ["+x"] },
      { x: 3.4, z: 1.4, w: 1.8, d: 0.1, kind: "wall" },
      { x: 3.4, z: 2.8, w: 1.8, d: 0.1, kind: "wall" },
    ],
  }
  const { items } = placePlanFixtures(floor, [{ x: 4.44, z: 2.2, w: 0.6, d: 0.53, kind: null, lines: [0.81, 0.86, 0.75, 0.6] }])
  assert.deepEqual(items.map(i => i.type), ["washer"])
  // 細長い薄い箱（0.95 × 0.51m）が窓の前にあればエアコンの表記
  const ac = placePlanFixtures(floor, [{ x: 4.5, z: 1.95, w: 0.51, d: 0.95, kind: null, lines: [0.8, 0.8, 0.5, 0.5] }])
  assert.equal(ac.items.length, 0)
})

test("設備の記号: キッチン・冷蔵庫（破線）・洗面台（水回りの近く）・洗濯機に分け、エアコンの表記は置かない", () => {
  const T = 0.15
  const floor = {
    level: 0, height: 2.8, slabs: [{ x: 0, z: 0, w: 3.64, d: 6.37 }],
    rooms: [{ name: "浴室1", x: 0.6, z: 0.6, area: 1.4 }, { name: "LDK", x: 2.0, z: 4.0, area: 14 }],
    walls: [
      { x: 0, z: 0, w: T, d: 6.37, kind: "wall" },
      { x: 3.49, z: 0, w: T, d: 2.0, kind: "wall" },
      { x: 3.49, z: 2.0, w: T, d: 1.6, kind: "window", outside: ["+x"] },
      { x: 3.49, z: 3.6, w: T, d: 2.77, kind: "wall" },
      { x: 0, z: 0, w: 3.64, d: T, kind: "wall" },
      { x: 0, z: 6.22, w: 3.64, d: T, kind: "wall" },
      { x: 0.15, z: 1.2, w: 1.05, d: 0.1, kind: "wall" },
      { x: 1.2, z: 0.15, w: 0.1, d: 1.15, kind: "wall" },
    ],
  }
  const box = (x, z, w, d, lines = [1, 1, 1, 1]) => ({ x, z, w, d, kind: null, lines })
  const hints = [
    box(0.15, 3.0, 0.65, 1.8), // 壁沿いの長い箱
    box(0.15, 4.85, 0.65, 0.65, [0.5, 0.5, 0.5, 0.5]), // 破線の正方形（キッチンの端）
    box(0.15, 1.35, 0.6, 0.6), // 浴室に近い正方形
    box(0.15, 2.05, 0.65, 0.65), // その隣
    box(3.2, 2.3, 0.25, 0.8), // 窓の前の薄い箱（エアコンの表記）
  ]
  const { items } = placePlanFixtures(floor, hints)
  const types = items.map(i => i.type).sort()
  assert.deepEqual(types, ["fridge", "kitchenCompact", "washbasin", "washer"], JSON.stringify(items))
  assert.ok(items.every(i => i.fixed && i.ry === 90), "西の壁を背にした固定の設備")
  const wb = items.find(i => i.type === "washbasin")
  const wa = items.find(i => i.type === "washer")
  assert.ok(wb.z < wa.z, "浴室に近い方が洗面台")
})

test("おまかせ配置: 4 人掛けが入らない狭い DK には 2 人掛けのダイニングを置く（図面のキッチンは動かさない）", () => {
  const W = 2.6, D = 6
  const T = 0.15
  const spec = parseBuildingSpec({
    name: "narrow", footprint: { width: W, depth: D }, wallHeightDefault: 2.8, roof: { type: "flat", pitch: 0 }, materials: DEFAULT_MATERIALS,
    floors: [{
      level: 0, height: 2.8, slabs: [{ x: 0, z: 0, w: W, d: D }], rooms: [{ name: "LDK", x: 1.3, z: 3, area: 14 }],
      walls: [
        { x: 0, z: 0, w: T, d: D, kind: "wall" }, { x: W - T, z: 0, w: T, d: D, kind: "wall" },
        { x: 0, z: 0, w: W, d: T, kind: "wall" }, { x: 0, z: D - T, w: 1.0, d: T, kind: "wall" },
        { x: 1.0, z: D - T, w: 0.9, d: T, kind: "door", outside: ["+z"] }, { x: 1.9, z: D - T, w: W - 1.9, d: T, kind: "wall" },
      ],
    }],
  })
  spec.furniture = [{ id: "k", type: "kitchenCompact", level: 0, x: 0.475, z: 1.2, ry: 90, fixed: true }]
  const staged = autoStage(spec)
  assert.ok(staged.some(i => i.id === "k" && i.x === 0.475 && i.z === 1.2), "図面のキッチンはそのまま")
  assert.ok(!staged.some(i => i.type === "diningSet"), "4 人掛けは入らない")
  assert.ok(staged.some(i => i.type === "diningSet2"), staged.map(i => i.type).join(","))
})

test("塗り分けの色がサイトごとに違う図面: 最も広い部屋の色を居室とし、設備の記号の有無で水回りと収納を分ける", () => {
  // 居室 = 桃色、水回り = 水色、収納 = 茶色、廊下 = 白（不動産サイトによっては 01 と逆の配色）
  const box = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 })
  const found = [
    { area: 12, cx: 2, cz: 2, tone: roomTone(246, 221, 225), rgb: [246, 221, 225], minDim: 3, maxDim: 4, box: box(0, 0, 4, 3) },
    { area: 7, cx: 2, cz: 5, tone: roomTone(246, 222, 226), rgb: [246, 222, 226], minDim: 2.5, maxDim: 3, box: box(0, 3.5, 3, 6) },
    { area: 2.2, cx: 5, cz: 1, tone: roomTone(221, 239, 250), rgb: [221, 239, 250], minDim: 1.4, maxDim: 1.6, box: box(4.2, 0, 5.6, 1.6) },
    { area: 2.4, cx: 5, cz: 3, tone: roomTone(220, 238, 249), rgb: [220, 238, 249], minDim: 1.4, maxDim: 1.7, box: box(4.2, 2, 5.6, 3.7) },
    { area: 0.9, cx: 5, cz: 4.5, tone: roomTone(222, 239, 250), rgb: [222, 239, 250], minDim: 0.75, maxDim: 1.2, box: box(4.6, 3.9, 5.35, 5.1) },
    { area: 1.2, cx: 1, cz: 3.2, tone: roomTone(207, 189, 165), rgb: [207, 189, 165], minDim: 0.8, maxDim: 1.5, box: box(0, 3, 1.5, 3.4) },
    { area: 2.1, cx: 3.6, cz: 3.6, tone: "neutral", rgb: [253, 254, 253], minDim: 0.9, maxDim: 2.3, box: box(3.2, 2.5, 4.1, 4.8) },
  ]
  const fixtures = [
    { x: 4.3, z: 0.2, w: 1.1, d: 0.7 }, // 浴槽
    { x: 4.5, z: 2.4, w: 0.6, d: 0.55 }, // 洗濯機置き場
    { x: 4.8, z: 4.4, w: 0.5, d: 0.5 }, // 便器のタンク
  ]
  relativeTones(found, fixtures)
  const names = nameRooms(found, 1).map(r => r.name)
  assert.deepEqual(names, ["洋室1", "洋室2", "浴室1", "洗面所1", "トイレ1", "収納1", "廊下1"])
})

test("01 と同じ配色（居室 = 水色）の図面は、塗りの色の意味を変えない", () => {
  const found = [
    { area: 14, cx: 2, cz: 2, tone: roomTone(198, 232, 253), rgb: [198, 232, 253], minDim: 3, maxDim: 5, box: { x0: 0, z0: 0, x1: 3.6, z1: 4 } },
    { area: 1.2, cx: 3, cz: 5, tone: roomTone(207, 236, 221), rgb: [207, 236, 221], minDim: 0.9, maxDim: 1.4, box: { x0: 2.5, z0: 4.5, x1: 3.6, z1: 5.6 } },
  ]
  relativeTones(found, [])
  assert.deepEqual(found.map(f => f.tone), ["living", "storage"])
})

test("階段下トイレの図面: 上の階の段の線が途中だけでも、上端は上の階の壁の手前（上がり口を残す）、下端は下の階の壁まで伸ばし、高い所の下の仕切りは階段に取り込む", () => {
  const T = 0.15
  // 下の階: 階段の列 x 4.3〜5.0。z 2.8 に洗面所との壁（列の外まで続く）、z 4.1 にトイレと階段の間の仕切り（列を横切る）、z 5.55 に玄関との壁
  const lower = {
    level: 0, height: 2.8, slabs: [{ x: 0, z: 0, w: 5.2, d: 6.6 }], rooms: [],
    walls: [
      { x: 4.15, z: 3.55, w: T, d: 1.25, kind: "wall" },
      { x: 5.05, z: 0, w: T, d: 6.6, kind: "wall" },
      { x: 3.4, z: 2.8, w: 1.65, d: T, kind: "wall" },
      { x: 4.3, z: 4.1, w: 0.8, d: 0.2, kind: "wall" },
      { x: 4.2, z: 5.55, w: 0.9, d: T, kind: "wall" },
    ],
  }
  // 上の階: 階段の列の上は z 2.7 の寝室の壁、下は z 4.5 の寝室の壁。段の線（記号）は z 3.68〜4.12 だけ
  const upper = {
    level: 1, height: 2.8, slabs: [{ x: 0, z: 0, w: 5.2, d: 7.4 }], rooms: [],
    walls: [
      { x: 4.15, z: 3.7, w: T, d: 0.95, kind: "wall" },
      { x: 5.0, z: 0, w: T, d: 7.4, kind: "wall" },
      { x: 4.3, z: 2.7, w: 0.7, d: T, kind: "wall" },
      { x: 4.15, z: 2.85, w: T, d: 0.75, kind: "door" },
      { x: 4.3, z: 4.5, w: 0.7, d: T, kind: "wall" },
    ],
  }
  const hint = { x: 4.26, z: 3.68, w: 0.74, d: 0.44, axis: "z", lines: 3, strong: true }
  // 白黒の図面（従来の判定）では置かない
  assert.equal(stairFromHints(structuredClone(lower), structuredClone(upper), [hint]), null)
  const lo = structuredClone(lower)
  const s = stairFromHints(lo, structuredClone(upper), [hint], { throughFloor: true })
  assert.ok(s, "置ける")
  assert.equal(s.up, "-z")
  assert.ok(Math.abs(s.x - 4.3) < 0.01 && Math.abs(s.w - 0.7) < 0.01, JSON.stringify(s))
  // 下端は玄関との壁（z 5.55）の手前、上端は上の階の壁から上がり口ぶん離れる
  assert.ok(Math.abs(s.z + s.d - 5.55) < 0.06, JSON.stringify(s))
  assert.ok(s.z >= 2.85 + 0.44, JSON.stringify(s))
  assert.ok(s.d >= 12 * 0.15 - 1e-6, "最小の長さ")
  // トイレと階段の間の仕切り（列を横切る）は取り込み、洗面所との壁（列の外まで続く）は残す
  assert.ok(!lo.walls.some(w => w.z === 4.1), "仕切りを取り込む")
  assert.ok(lo.walls.some(w => w.z === 2.8), "洗面所の壁は残す")
  // 開口は上端から上の階の壁（z 4.5）まで
  assert.ok(s.opening && Math.abs(s.opening.z - s.z) < 0.01 && Math.abs(s.opening.z + s.opening.d - 4.5) < 0.01, JSON.stringify(s.opening))
})

// 利用者が撮影した 2 枚目の物件（1F-01 / 2F-01。黒い壁・居室が桃色と黄色・出窓・バルコニー・階段下トイレ）。ローカルにあるときだけ
const local2 = [".tools/fp/h1.png", ".tools/fp/h2.png"].map(p => new URL(`../${p}`, import.meta.url))
test("撮影した間取り図 2（ローカルのみ）: 部屋・設備・階段が取れ、1F の廊下から 2F の廊下まで歩ける", { skip: !local2.every(u => existsSync(u)) }, async () => {
  const { PNG } = await import("pngjs")
  const load = u => { const p = PNG.sync.read(readFileSync(u)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) } }
  // 物件情報の延床面積 64.39m²（2 階建）に合わせた横幅
  const res = local2.map((u, level) => analyzeFloorplan(load(u), { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: 5.26, level }))
  const spec = parseBuildingSpec(specFromFloorplans(res, { name: "local2", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false }))
  const names = spec.floors.map(f => f.rooms.map(r => r.name).join(","))
  for (const n of ["LDK", "浴室", "洗面所", "玄関・ホール", "トイレ"]) assert.ok(names[0].includes(n), `1F ${n}: ${names[0]}`)
  assert.equal(spec.floors[1].rooms.filter(r => r.name.startsWith("洋室")).length, 3, names[1])
  const fixed = (spec.furniture ?? []).filter(f => f.fixed).map(f => f.type)
  for (const t of ["bathtub", "toilet", "kitchenCompact", "fridge", "washer"]) assert.ok(fixed.includes(t), `${t}: ${fixed}`)
  assert.equal(spec.stairs?.length, 1)
  const layouts = [stairLayout(spec, spec.stairs[0])]
  const FL = 0.45
  let level = 0
  let x = 3.8, z = 5.15
  let cur = walkSurface(spec, layouts, x, z, level, FL)
  for (const [tx, tz] of [[4.75, 5.15], [4.75, 3.2], [3.7, 3.2]]) {
    for (let k = 0; k < 400 && (Math.abs(tx - x) > 1e-6 || Math.abs(tz - z) > 1e-6); k++) {
      x += Math.sign(tx - x) * Math.min(0.03, Math.abs(tx - x))
      z += Math.sign(tz - z) * Math.min(0.03, Math.abs(tz - z))
      const next = walkSurface(spec, layouts, x, z, level, FL)
      assert.ok(next && canStep(cur, next), `${x.toFixed(2)},${z.toFixed(2)}: ${cur?.y} → ${next?.y}`)
      cur = next
      level = next.level
    }
  }
  assert.equal(level, 1)
})

test("縮尺の候補: ±2% を 0.5% 刻みで試し、構造が最も多く取れた横幅（同点なら元に近い方）", () => {
  const c = scaleCandidates(5.0)
  assert.equal(c.length, 9)
  assert.ok(c.includes(5) && Math.min(...c) >= 4.9 - 1e-9 && Math.max(...c) <= 5.1 + 1e-9, JSON.stringify(c))
  assert.equal(chooseScale(5.0, [{ width: 4.95, score: 19 }, { width: 5.0, score: 17 }, { width: 5.05, score: 19 }, { width: 5.1, score: 19 }]), 4.95)
  assert.equal(chooseScale(5.0, [{ width: 5.0, score: 19 }, { width: 5.05, score: 19 }]), 5.0)
  assert.equal(chooseScale(5.0, []), 5.0)
})

// アプリの取り込み（縮小・JPEG）を通した 2 枚目の物件の図面。建物面積から決めた横幅（5.21〜5.22m）だと、そのままでは
// 細い間仕切りが格子のずれで消える（トイレ・洗面所・階段が取れない）。候補から選べば取れる
const app2 = [".tools/fp/happ_0.png", ".tools/fp/happ_1.png"].map(p => new URL(`../${p}`, import.meta.url))
test("撮影した間取り図 2・アプリの前処理後（ローカルのみ）: 建物面積から決めた横幅の近くで、構造が最も取れる縮尺を選ぶ", { skip: !app2.every(u => existsSync(u)) }, async () => {
  const { PNG } = await import("pngjs")
  const imgs = app2.map(u => { const p = PNG.sync.read(readFileSync(u)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) } })
  const analyze = w => imgs.map((img, level) => analyzeFloorplan(img, { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: w, level }))
  for (const start of [5.21, 5.22]) {
    const width = chooseScale(start, scaleCandidates(start).map(w => ({ width: w, score: structureScore(analyze(w)) })))
    const spec = parseBuildingSpec(specFromFloorplans(analyze(width), { name: "app2", roof: "gable", pitch: 25, materials: DEFAULT_MATERIALS, withPerspective: false }))
    const names = spec.floors[0].rooms.map(r => r.name).join(",")
    for (const n of ["洗面所", "トイレ", "浴室", "玄関・ホール"]) assert.ok(names.includes(n), `${start} → ${width}: ${n} ${names}`)
    const fixed = (spec.furniture ?? []).filter(f => f.fixed).map(f => f.type)
    assert.ok(fixed.includes("toilet") && fixed.some(t => t.startsWith("kitchen")), `${start} → ${width}: ${fixed}`)
    assert.equal(spec.stairs?.length, 1)
    assert.ok(Math.abs(width - start) / start <= 0.021)
  }
})

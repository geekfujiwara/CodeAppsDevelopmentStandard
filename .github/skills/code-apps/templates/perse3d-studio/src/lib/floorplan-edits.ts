import type { FloorplanResult } from "./floorplan-analyzer"
import type { FloorSpec, Rect, Side, WallKind, WallRect } from "./building-spec"
import { subtractRect } from "./stairs.ts"
import type { SourceImages } from "../types/project"

export const EDIT_CATEGORIES = [
  { value: "wall", label: "壁", color: "#dc2626" },
  { value: "window", label: "窓", color: "#0284c7" },
  { value: "glassdoor", label: "掃き出し窓", color: "#059669" },
  { value: "door", label: "扉", color: "#d97706" },
  { value: "erase", label: "通路・消去", color: "#64748b" },
  { value: "floor", label: "床範囲", color: "#6366f1" },
  { value: "storage", label: "収納", color: "#9333ea" },
  { value: "ldk", label: "LDK", color: "#db2777" },
  { value: "room", label: "洋室", color: "#0891b2" },
  { value: "hall", label: "廊下", color: "#475569" },
  { value: "entrance", label: "玄関・ホール", color: "#a16207" },
  { value: "toilet", label: "トイレ", color: "#0d9488" },
  { value: "bath", label: "浴室", color: "#2563eb" },
  { value: "washroom", label: "洗面所", color: "#7c3aed" },
] as const

export type EditCategory = (typeof EDIT_CATEGORIES)[number]["value"]
/** 元画像に対する 0〜1 の座標。画面サイズや解析の縮尺を変えても同じ場所を指す。後の指定を優先する。 */
export type FloorplanEdit = {
  id: string
  category: EditCategory
  x: number
  y: number
  w: number
  h: number
  /** 部屋のクリック指定は既存ラベルの分類変更。ドラッグ指定は矩形の領域。 */
  point?: boolean
}
export type ImageSize = { width: number; height: number }
export type PlanPoint = { x: number; y: number }

export function replacePlanImages(images: SourceImages, replacements: Record<string, string>, sheet: boolean): SourceImages {
  const edits = { ...images.floorplanEdits }, settings = { ...images.floorplanSettings }
  for (const k of Object.keys(replacements)) { delete edits[k]; delete settings[k] }
  return { ...images, floorplans: { ...images.floorplans, ...replacements }, floorplanEdits: edits, floorplanSettings: settings, floorplanSheet: sheet }
}

export function removePlanImage(images: SourceImages, key: string): SourceImages {
  const floorplans = { ...images.floorplans }, edits = { ...images.floorplanEdits }, settings = { ...images.floorplanSettings }
  delete floorplans[key]; delete edits[key]; delete settings[key]
  return { ...images, floorplans, floorplanEdits: edits, floorplanSettings: settings }
}

export function swapPlanImages(images: SourceImages, a: string, b: string): SourceImages {
  if (!images.floorplans[a] || !images.floorplans[b]) throw new Error("入れ替える階の図面がありません")
  const settings = { ...images.floorplanSettings }
  for (const [to, from] of [[a, b], [b, a]]) {
    const s = images.floorplanSettings?.[from]
    if (s) settings[to] = { ...s, level: Number(to) }
    else delete settings[to]
  }
  return { ...images,
    floorplans: { ...images.floorplans, [a]: images.floorplans[b], [b]: images.floorplans[a] },
    floorplanEdits: { ...images.floorplanEdits, [a]: images.floorplanEdits?.[b] ?? [], [b]: images.floorplanEdits?.[a] ?? [] },
    floorplanSettings: settings,
  }
}

const ROOM_NAMES: Partial<Record<EditCategory, string>> = {
  storage: "収納", ldk: "LDK", room: "洋室", hall: "廊下", entrance: "玄関・ホール", toilet: "トイレ", bath: "浴室", washroom: "洗面所",
}
export const roomName = (category: EditCategory): string | undefined => ROOM_NAMES[category]

export function validateEdits(edits: readonly FloorplanEdit[]): void {
  const ids = new Set<string>()
  for (const e of edits) {
    if (!e.id || ids.has(e.id) || !EDIT_CATEGORIES.some(c => c.value === e.category) ||
      ![e.x, e.y, e.w, e.h].every(Number.isFinite) ||
      e.x < 0 || e.y < 0 || e.w <= 0 || e.h <= 0 || e.x + e.w > 1.000001 || e.y + e.h > 1.000001) {
      throw new Error("手動補正の種類・座標が不正です。該当する補正を削除して指定し直してください")
    }
    ids.add(e.id)
  }
}

export function editRect(a: PlanPoint, b: PlanPoint): Pick<FloorplanEdit, "x" | "y" | "w" | "h"> {
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const x = Math.min(clamp(a.x), clamp(b.x)), y = Math.min(clamp(a.y), clamp(b.y))
  return { x, y, w: Math.max(0.0001, Math.abs(clamp(a.x) - clamp(b.x))), h: Math.max(0.0001, Math.abs(clamp(a.y) - clamp(b.y))) }
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z
const contains = (r: Rect, x: number, z: number) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d
const round = (n: number) => Math.round(n * 1000) / 1000
const wallCategory = (category: EditCategory): category is WallKind =>
  category === "wall" || category === "window" || category === "glassdoor" || category === "door"

/** 分割した壁の外向きの面は、元の外周に残る部分だけに引き継ぐ。 */
function cutWall(w: WallRect, cut: Rect): WallRect[] {
  return subtractRect(w, cut).map(r => ({
    ...r, kind: w.kind,
    outside: w.outside?.filter(s => Math.abs(
      s === "-x" ? r.x - w.x : s === "+x" ? r.x + r.w - w.x - w.w :
        s === "-z" ? r.z - w.z : r.z + r.d - w.z - w.d,
    ) < 0.002),
  }))
}

/** 階段・設備の自動補完が変更した壁も、手動指定した範囲だけは確定結果に戻す。 */
export function restoreEditedWalls(floor: FloorSpec, confirmed: FloorSpec, regions: Rect[]): FloorSpec {
  let walls = [...floor.walls]
  for (const r of regions) {
    walls = walls.flatMap(w => cutWall(w, r))
    for (const w of confirmed.walls) {
      if (!intersects(w, r)) continue
      const x = Math.max(r.x, w.x), z = Math.max(r.z, w.z)
      walls.push({ ...w, x, z, w: Math.min(r.x + r.w, w.x + w.w) - x, d: Math.min(r.z + r.d, w.z + w.d) - z })
    }
  }
  return { ...floor, walls }
}

/** 画像とモデルの座標変換は、描画と判定と保存で共通にする。 */
export function modelRect(e: FloorplanEdit, size: ImageSize, result: FloorplanResult): Rect {
  return {
    x: round((e.x * size.width - result.bboxPx.x) / result.pxPerMeter),
    z: round((e.y * size.height - result.bboxPx.y) / result.pxPerMeter),
    w: round(e.w * size.width / result.pxPerMeter),
    d: round(e.h * size.height / result.pxPerMeter),
  }
}

export function imageRect(r: Rect, size: ImageSize, result: FloorplanResult): Pick<FloorplanEdit, "x" | "y" | "w" | "h"> {
  return {
    x: (r.x * result.pxPerMeter + result.bboxPx.x) / size.width,
    y: (r.z * result.pxPerMeter + result.bboxPx.y) / size.height,
    w: r.w * result.pxPerMeter / size.width,
    h: r.d * result.pxPerMeter / size.height,
  }
}

export function assignRooms(floor: FloorSpec, edits: readonly FloorplanEdit[], size: ImageSize, result: FloorplanResult): FloorSpec {
  let rooms = floor.rooms.map(r => ({ ...r }))
  for (const e of edits) {
    const name = roomName(e.category)
    if (!name) continue
    const r = modelRect(e, size, result)
    const x = r.x + r.w / 2, z = r.z + r.d / 2
    if (e.point && rooms.length) {
      const nearest = [...rooms].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]
      rooms = rooms.map(q => q === nearest ? { ...q, name } : q)
    } else if (e.point) {
      throw new Error("部屋が未検出です。用途を指定する範囲をドラッグしてください")
    } else {
      rooms = rooms.filter(q => !contains(r, q.x, q.z))
      rooms.push({ name, x: round(x), z: round(z), area: Math.round(r.w * r.d * 100) / 100 })
    }
  }
  return { ...floor, rooms }
}

/** 自動解析が全くできない場合でも「床範囲」の指定があれば手描きモデルを作れる。 */
export function manualFloorplan(size: ImageSize, width: number, level: number, height: number, edits: readonly FloorplanEdit[]): FloorplanResult {
  const floors = edits.filter(e => e.category === "floor")
  if (!floors.length) throw new Error("壁を検出できませんでした。「床範囲」をドラッグ指定し、壁・窓・扉を手動で追加してください")
  const x = Math.min(...floors.map(e => e.x)) * size.width
  const y = Math.min(...floors.map(e => e.y)) * size.height
  const w = Math.max(...floors.map(e => e.x + e.w)) * size.width - x
  const h = Math.max(...floors.map(e => e.y + e.h)) * size.height - y
  const ppm = w / width
  return {
    floor: { level, height, walls: [], slabs: [], rooms: [] },
    bboxPx: { x, y, w, h }, pxPerMeter: ppm, footprint: { width, depth: h / ppm },
    floorArea: 0, fixtures: [], stairHints: [], applied: { threshold: 0, cleanRadius: 0, wallPx: 0 },
    stats: { walls: 0, windows: 0, doors: 0, rooms: 0, cellMeters: 0.05 },
    scaleCheck: { wallMeters: 0, suggestedWidth: null },
    manualOnly: true,
  }
}

export function applyFloorplanEdits(base: FloorplanResult, edits: readonly FloorplanEdit[], size: ImageSize): FloorplanResult {
  if (!edits.length) return base
  validateEdits(edits)
  let result = { ...base, floor: { ...base.floor, walls: [...base.floor.walls], slabs: [...base.floor.slabs], rooms: [...base.floor.rooms] } }
  // 床を指定したときは外形・縮尺もその範囲から求め直す。未検出の壁が従来の外形の外にあっても追加できる。
  const floorEdits = edits.filter(e => e.category === "floor")
  if (floorEdits.length) {
    const frame = manualFloorplan(size, base.footprint.width, base.floor.level, base.floor.height, edits)
    const k = base.pxPerMeter / frame.pxPerMeter
    const dx = (base.bboxPx.x - frame.bboxPx.x) / frame.pxPerMeter
    const dz = (base.bboxPx.y - frame.bboxPx.y) / frame.pxPerMeter
    const transform = (r: Rect): Rect => ({ x: round(r.x * k + dx), z: round(r.z * k + dz), w: round(r.w * k), d: round(r.d * k) })
    result = {
      ...result, bboxPx: frame.bboxPx, pxPerMeter: frame.pxPerMeter, footprint: frame.footprint,
      fixtures: base.fixtures.map(r => ({ ...r, ...transform(r) })),
      stairHints: base.stairHints.map(r => ({ ...r, ...transform(r) })),
      floor: { ...result.floor, walls: base.floor.walls.map(r => ({ ...r, ...transform(r) })), slabs: [],
        rooms: base.floor.rooms.map(r => ({ ...r, x: round(r.x * k + dx), z: round(r.z * k + dz), area: r.area * k * k })) },
    }
    for (const e of floorEdits) {
      let pieces = [modelRect(e, size, result)]
      for (const s of result.floor.slabs) pieces = pieces.flatMap(r => subtractRect(r, s))
      result.floor.slabs.push(...pieces)
    }
    result.floorArea = Math.round(result.floor.slabs.reduce((a, s) => a + s.w * s.d, 0) * 100) / 100
    const onSlab = (x: number, z: number) => result.floor.slabs.some(s => contains(s, x, z))
    result.floor.rooms = result.floor.rooms.filter(r => onSlab(r.x, r.z))
    result.fixtures = result.fixtures.filter(r => onSlab(r.x + r.w / 2, r.z + r.d / 2))
    result.stairHints = result.stairHints.filter(r => onSlab(r.x + r.w / 2, r.z + r.d / 2))
  }
  const extent: Rect = { x: 0, z: 0, w: result.footprint.width, d: result.footprint.depth }
  const clipped = (r: Rect): Rect => {
    const x = Math.max(0, r.x), z = Math.max(0, r.z)
    return { x, z, w: Math.min(extent.w, r.x + r.w) - x, d: Math.min(extent.d, r.z + r.d) - z }
  }
  result.floor.walls = result.floor.walls.map(w => ({ ...w, ...clipped(w) })).filter(r => r.w > 0.001 && r.d > 0.001)
  for (const e of edits) {
    if (roomName(e.category) || e.category === "floor") continue
    const r = clipped(modelRect(e, size, result))
    if (r.w < 0.001 || r.d < 0.001) throw new Error("手動補正が建物の範囲外です。先に「床範囲」で建物全体を指定してください")
    const replaced = result.floor.walls.filter(w => intersects(w, r))
    result.floor.walls = result.floor.walls.flatMap(w => cutWall(w, r))
    result.fixtures = result.fixtures.filter(f => !intersects(f, r))
    result.stairHints = result.stairHints.filter(s => !intersects(s, r))
    if (wallCategory(e.category)) {
      const outside = new Set<Side>(replaced.flatMap(w => w.outside ?? []))
      const onFloor = (x: number, z: number) => result.floor.slabs.some(s => contains(s, x, z))
      const cx = r.x + r.w / 2, cz = r.z + r.d / 2
      if (!onFloor(r.x - 0.03, cz)) outside.add("-x")
      if (!onFloor(r.x + r.w + 0.03, cz)) outside.add("+x")
      if (!onFloor(cx, r.z - 0.03)) outside.add("-z")
      if (!onFloor(cx, r.z + r.d + 0.03)) outside.add("+z")
      result.floor.walls.push({ ...r, kind: e.category, outside: [...outside] })
    }
  }
  result.floor = assignRooms(result.floor, edits, size, result)
  return { ...result, manualEdits: [...edits], imageSize: size,
    stats: { ...result.stats,
      walls: result.floor.walls.filter(w => w.kind === "wall").length,
      windows: result.floor.walls.filter(w => w.kind === "window" || w.kind === "glassdoor").length,
      doors: result.floor.walls.filter(w => w.kind === "door").length, rooms: result.floor.rooms.length } }
}

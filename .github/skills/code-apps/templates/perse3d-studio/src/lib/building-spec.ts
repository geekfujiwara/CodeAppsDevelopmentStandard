import type { FurnitureItem } from "./furniture.ts"
import type { StairSpec } from "./stairs.ts"
import { autoStairs, sanitizeStairs, STAIR_WIDTH, straightRun, withAutoStairs } from "./stairs.ts"

/**
 * BuildingSpec — Code App（Three.js）と Blender パイプラインが共有する建物定義。
 * 座標系: x = 間口方向（m）, z = 奥行方向（m）, y = 高さ（m）。原点は建物外形の左奥。
 * 正面（道路側）は z = footprint.depth 側。
 * Blender 側（blender/build_from_spec.py）も同じ JSON を読むため、型を変えたら両方を更新する。
 */

export type WallKind = "wall" | "window" | "door" | "glassdoor"
export type Side = "+x" | "-x" | "+z" | "-z"
export type Rect = { x: number; z: number; w: number; d: number }
export type WallRect = Rect & { kind: WallKind; outside?: Side[] }
export type RoomLabel = { name: string; x: number; z: number; area: number }

export type FloorSpec = {
  level: number
  height: number
  walls: WallRect[]
  slabs: Rect[]
  rooms: RoomLabel[]
}

export type RoofType = "gable" | "hip" | "shed" | "flat"

/** 仕上げ材の種類（色とは別に、テクスチャ・凹凸・反射を決める） */
export type WallFinish = "siding" | "plaster" | "brick" | "wood" | "metal"
export type RoofFinish = "slate" | "kawara" | "metal"
export type FloorFinish = "oak" | "tile"

export const WALL_FINISH_LABELS: Record<WallFinish, string> = {
  siding: "窯業系サイディング",
  plaster: "塗り壁（ジョリパット調）",
  brick: "レンガタイル",
  wood: "板張り（杉・焼杉）",
  metal: "ガルバリウム角波",
}
export const ROOF_FINISH_LABELS: Record<RoofFinish, string> = {
  slate: "化粧スレート",
  kawara: "瓦",
  metal: "ガルバリウム立平葺き",
}
export const FLOOR_FINISH_LABELS: Record<FloorFinish, string> = {
  oak: "無垢フローリング",
  tile: "大判タイル",
}

/** 色を持つ部位（カラーピッカーで編集する対象） */
export type ColorKey = "exteriorWall" | "roof" | "floor" | "interiorWall" | "trim" | "ground"

export type Materials = Record<ColorKey, string> & {
  wallFinish?: WallFinish
  roofFinish?: RoofFinish
  floorFinish?: FloorFinish
}

/** 基礎の立ち上がり（地盤面から 1F 床まで、m）。Three.js と Blender で共通 */
export const FLOOR_LEVEL = 0.45

export const DEFAULT_FINISHES = { wallFinish: "siding", roofFinish: "slate", floorFinish: "oak" } as const

export function finishesOf(m: Materials): { wall: WallFinish; roof: RoofFinish; floor: FloorFinish } {
  return { wall: m.wallFinish ?? DEFAULT_FINISHES.wallFinish, roof: m.roofFinish ?? DEFAULT_FINISHES.roofFinish, floor: m.floorFinish ?? DEFAULT_FINISHES.floorFinish }
}

export type BuildingSpec = {
  version: 1
  name: string
  source: "floorplan" | "perspective" | "both" | "manual"
  footprint: { width: number; depth: number }
  wallHeightDefault: number
  openings: { sill: number; head: number }
  floors: FloorSpec[]
  roof: { type: RoofType; pitch: number; overhang: number }
  materials: Materials
  /** 家具・車（src/lib/furniture.ts）。未設定なら家具なし */
  furniture?: FurnitureItem[]
  /** 階段（src/lib/stairs.ts）。未設定なら読み込み時に自動配置する。[] は「階段なし」 */
  stairs?: StairSpec[]
}

export const SPEC_VERSION = 1 as const

export const ROOF_LABELS: Record<RoofType, string> = {
  gable: "切妻",
  hip: "寄棟",
  shed: "片流れ",
  flat: "陸屋根",
}

export const DEFAULT_MATERIALS: Materials = {
  exteriorWall: "#e8e2d6",
  roof: "#3f4448",
  floor: "#b98a5a",
  interiorWall: "#f6f4ef",
  trim: "#2f2f2f",
  ground: "#7da05a",
  ...DEFAULT_FINISHES,
}

export type MaterialPreset = { id: string; name: string; description: string; materials: Partial<Materials> }

/** 営業提案用のバリエーション（色 + 仕上げ材。Blender の一括レンダリングでも同じ ID を使う） */
export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "natural", name: "ナチュラル", description: "生成りサイディング × スレート屋根 × オーク無垢床", materials: { exteriorWall: "#e8e2d6", roof: "#3f4448", floor: "#b98a5a", trim: "#2f2f2f", wallFinish: "siding", roofFinish: "slate", floorFinish: "oak" } },
  { id: "modern", name: "モダン", description: "ガルバリウム角波 × 立平葺き × ウォールナット床", materials: { exteriorWall: "#55595e", roof: "#26292c", floor: "#6b4a33", trim: "#111111", wallFinish: "metal", roofFinish: "metal", floorFinish: "oak" } },
  { id: "japandi", name: "和モダン", description: "焼杉板張り × 瓦屋根 × 白木床 × 漆喰", materials: { exteriorWall: "#2d2a26", roof: "#4a4f55", floor: "#d9c3a0", interiorWall: "#f2efe6", trim: "#8b6b47", wallFinish: "wood", roofFinish: "kawara", floorFinish: "oak" } },
  { id: "white", name: "ホワイトキューブ", description: "白い塗り壁 × スレート屋根 × 大判タイル床", materials: { exteriorWall: "#f4f3ef", roof: "#9aa0a6", floor: "#d9d6cf", trim: "#6b6b6b", wallFinish: "plaster", roofFinish: "slate", floorFinish: "tile" } },
  { id: "brick", name: "ブリック", description: "レンガタイル × 瓦屋根 × オーク床", materials: { exteriorWall: "#9c5a3c", roof: "#4b3427", floor: "#a0703f", trim: "#e9e4da", wallFinish: "brick", roofFinish: "kawara", floorFinish: "oak" } },
]

export type MassingParams = {
  name: string
  width: number
  depth: number
  floors: number
  floorHeight: number
  roof: RoofType
  pitch: number
  windowDensity: number
  materials: Materials
}

export const DEFAULT_MASSING: MassingParams = {
  name: "新規プラン",
  width: 9.1,
  depth: 7.28,
  floors: 2,
  floorHeight: 2.8,
  roof: "gable",
  pitch: 25,
  windowDensity: 0.5,
  materials: DEFAULT_MATERIALS,
}

const T = 0.15 // 壁厚（m）

const round = (v: number) => Math.round(v * 1000) / 1000

/** 1 本の直線壁を、開口部（窓/扉）を挟んだ WallRect 列に分割する */
function segmentWall(
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  openings: { at: number; width: number; kind: WallKind }[],
  outside?: Side[],
): WallRect[] {
  const out: WallRect[] = []
  const sorted = [...openings].sort((a, b) => a.at - b.at)
  let cursor = from
  const push = (a: number, b: number, kind: WallKind) => {
    if (b - a < 0.01) return
    const r: WallRect =
      axis === "x"
        ? { x: round(a), z: round(fixed), w: round(b - a), d: T, kind }
        : { x: round(fixed), z: round(a), w: T, d: round(b - a), kind }
    if (outside) r.outside = outside
    out.push(r)
  }
  for (const o of sorted) {
    const a = Math.max(from, o.at - o.width / 2)
    const b = Math.min(to, o.at + o.width / 2)
    if (a <= cursor) continue
    push(cursor, a, "wall")
    push(a, b, o.kind)
    cursor = b
  }
  push(cursor, to, "wall")
  return out
}

function evenOpenings(length: number, density: number, kind: WallKind, width: number) {
  const count = Math.max(1, Math.round((length / 2.6) * (0.4 + density)))
  const step = length / (count + 1)
  return Array.from({ length: count }, (_, i) => ({ at: step * (i + 1), width: Math.min(width, step * 0.8), kind }))
}

/** 外観パースの寸法・階数・屋根形状から、内見可能な建物を手続き生成する */
export function generateFromMassing(p: MassingParams): BuildingSpec {
  const W = p.width
  const D = p.depth
  const floors: FloorSpec[] = []
  // 階段（1F → 2F）: 玄関ホールの左の外壁沿いに、玄関側から奥へ上る直階段。2F はその上がり口に廊下を通す
  const hasStair = p.floors >= 2
  const run = straightRun(p.floorHeight)
  const xHall = round(Math.max(Math.min(2.6, W * 0.3), hasStair ? T + STAIR_WIDTH + 1.0 : 0))
  const zS1 = round(D - T - 0.8)
  const zS0 = round(zS1 - run)
  const stairOk = hasStair && zS0 > 2.2
  const zWet = round(stairOk ? Math.min(D * 0.45, zS0 - T) : D * 0.45)
  const xMid = round((T + STAIR_WIDTH + xHall) / 2)
  for (let level = 0; level < p.floors; level++) {
    const walls: WallRect[] = []
    const isGround = level === 0
    // 正面（z = D）
    const frontOpenings = evenOpenings(W - 2 * T, p.windowDensity, isGround ? "glassdoor" : "window", isGround ? 2.4 : 1.6).map(o => ({ ...o, at: o.at + T }))
    if (isGround) {
      frontOpenings[0] = { at: stairOk ? xMid : Math.min(1.3, W * 0.15), width: 0.9, kind: "door" }
    }
    walls.push(...segmentWall("x", D - T, 0, W, frontOpenings, ["+z"]))
    walls.push(...segmentWall("x", 0, 0, W, evenOpenings(W, p.windowDensity * 0.6, "window", 1.2), ["-z"]))
    walls.push(...segmentWall("z", 0, T, D - T, evenOpenings(D - 2 * T, p.windowDensity * 0.6, "window", 1.2).map(o => ({ ...o, at: o.at + T })), ["-x"]))
    walls.push(...segmentWall("z", W - T, T, D - T, evenOpenings(D - 2 * T, p.windowDensity * 0.6, "window", 1.2).map(o => ({ ...o, at: o.at + T })), ["+x"]))

    const rooms: RoomLabel[] = []
    if (isGround) {
      // 1F: 玄関ホール（階段） + LDK + 水回り
      walls.push(...segmentWall("z", xHall, T, D - T, [{ at: D * 0.7, width: 0.9, kind: "door" }]))
      walls.push(...segmentWall("x", zWet, T, xHall, [{ at: stairOk ? xMid : xHall / 2, width: 0.8, kind: "door" }]))
      rooms.push({ name: "玄関・ホール", x: stairOk ? xMid : xHall / 2, z: (zWet + D) / 2, area: round(xHall * (D - zWet)) })
      rooms.push({ name: "水回り", x: xHall / 2, z: zWet / 2, area: round(xHall * zWet) })
      rooms.push({ name: "LDK", x: (xHall + W) / 2, z: D / 2, area: round((W - xHall) * D) })
    } else if (level === 1 && stairOk) {
      // 2F: 階段の上がり口から東西に廊下。前面は階段室の右に洋室 2 つ、奥に主寝室
      const zHall = zS0
      const zCorr = round(zHall - 1.0 - T)
      const xWell = round(T + STAIR_WIDTH + 0.1)
      const xR = round((xWell + W) / 2)
      walls.push(...segmentWall("x", zHall, xWell, W - T, [
        { at: (xWell + xR) / 2, width: 0.8, kind: "door" },
        { at: (xR + W) / 2, width: 0.8, kind: "door" },
      ]))
      walls.push(...segmentWall("z", xWell, zHall + T, D - T, []))
      walls.push(...segmentWall("z", xR, zHall + T, D - T, []))
      if (zCorr > 1.8) {
        walls.push(...segmentWall("x", zCorr, T, W - T, [{ at: W * 0.5, width: 0.8, kind: "door" }]))
        // 奥行 2.6m 未満はベッドが置けないので納戸として扱う
        rooms.push({ name: zCorr - T >= 2.6 ? "主寝室" : "納戸・WIC", x: W / 2, z: zCorr / 2, area: round(W * zCorr) })
      }
      rooms.push({ name: "廊下", x: W / 2, z: (Math.max(zCorr, 0) + zHall) / 2, area: round(W * (zHall - Math.max(zCorr, 0))) })
      rooms.push({ name: "洋室1A", x: (xWell + xR) / 2, z: (zHall + D) / 2, area: round((xR - xWell) * (D - zHall)) })
      rooms.push({ name: "洋室1B", x: (xR + W) / 2, z: (zHall + D) / 2, area: round((W - xR) * (D - zHall)) })
    } else {
      // 3F 以上（または階段を置けない奥行き）: 廊下 + 個室
      const zHall = round(Math.min(1.2, D * 0.18) + D * 0.3)
      const zCorr = round(zHall - 1.0)
      walls.push(...segmentWall("x", zHall, T, W - T, [
        { at: W * 0.25, width: 0.8, kind: "door" },
        { at: W * 0.75, width: 0.8, kind: "door" },
      ]))
      walls.push(...segmentWall("x", zCorr, T, W - T, [{ at: W * 0.5, width: 0.8, kind: "door" }]))
      walls.push(...segmentWall("z", round(W / 2), zHall + T, D - T, []))
      rooms.push({ name: `洋室${level}A`, x: W / 4, z: (zHall + D) / 2, area: round((W / 2) * (D - zHall)) })
      rooms.push({ name: `洋室${level}B`, x: (W * 3) / 4, z: (zHall + D) / 2, area: round((W / 2) * (D - zHall)) })
      rooms.push({ name: "廊下", x: W / 2, z: (zCorr + zHall) / 2, area: round(W * (zHall - zCorr)) })
      rooms.push({ name: "主寝室", x: W / 2, z: zCorr / 2, area: round(W * zCorr) })
    }
    floors.push({ level, height: p.floorHeight, walls, slabs: [{ x: 0, z: 0, w: W, d: D }], rooms })
  }
  const spec: BuildingSpec = {
    version: SPEC_VERSION,
    name: p.name,
    source: "perspective",
    footprint: { width: W, depth: D },
    wallHeightDefault: p.floorHeight,
    openings: { sill: 0.9, head: 2.05 },
    floors,
    roof: { type: p.roof, pitch: p.pitch, overhang: 0.45 },
    materials: { ...p.materials },
  }
  if (!hasStair) return spec
  const fixed = stairOk ? [{ fromLevel: 0, x: T, z: zS0, w: STAIR_WIDTH, d: run, up: "-z" as const, shape: "straight" as const }] : []
  return { ...spec, stairs: autoStairs(spec, fixed) }
}

export function totalHeight(spec: BuildingSpec) {
  return spec.floors.reduce((s, f) => s + f.height, 0)
}

export function floorBaseY(spec: BuildingSpec, level: number) {
  let y = 0
  for (const f of spec.floors) {
    if (f.level >= level) break
    y += f.height
  }
  return y
}

export type Quantities = {
  floorArea: number
  floorAreaTsubo: number
  exteriorWallArea: number
  windowCount: number
  doorCount: number
  roomCount: number
  roofArea: number
}

/** 接している同種の開口 rect を 1 箇所として数える（解析結果は 1 つの窓が複数 rect に分かれるため） */
function countOpenings(walls: WallRect[], kinds: WallKind[]) {
  const items = walls.filter(w => kinds.includes(w.kind))
  const parent = items.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const eps = 0.06
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      const touch = a.x <= b.x + b.w + eps && b.x <= a.x + a.w + eps && a.z <= b.z + b.d + eps && b.z <= a.z + a.d + eps
      if (touch) parent[find(i)] = find(j)
    }
  }
  return new Set(items.map((_, i) => find(i))).size
}

/** 概算数量（営業の初期見積・Blender の数量出力と同じ算出ロジック） */
export function computeQuantities(spec: BuildingSpec): Quantities {
  let floorArea = 0
  let exteriorWallArea = 0
  let windowCount = 0
  let doorCount = 0
  let roomCount = 0
  for (const f of spec.floors) {
    floorArea += f.slabs.reduce((s, r) => s + r.w * r.d, 0)
    roomCount += f.rooms.length
    for (const w of f.walls) {
      const len = Math.max(w.w, w.d)
      if (w.outside?.length) exteriorWallArea += len * f.height
    }
    windowCount += countOpenings(f.walls, ["window", "glassdoor"])
    doorCount += countOpenings(f.walls, ["door"])
  }
  const { width, depth } = spec.footprint
  const o = spec.roof.overhang
  const plan = (width + 2 * o) * (depth + 2 * o)
  const roofArea = spec.roof.type === "flat" ? plan : plan / Math.cos((spec.roof.pitch * Math.PI) / 180)
  return {
    floorArea: Math.round(floorArea * 100) / 100,
    floorAreaTsubo: Math.round((floorArea / 3.30579) * 100) / 100,
    exteriorWallArea: Math.round(exteriorWallArea * 10) / 10,
    windowCount,
    doorCount,
    roomCount,
    roofArea: Math.round(roofArea * 10) / 10,
  }
}

/** 外部（AI 解析・Blender・手入力）から受け取った JSON を検証して BuildingSpec に正規化する */
export function parseBuildingSpec(raw: unknown): BuildingSpec {
  if (!raw || typeof raw !== "object") throw new Error("JSON オブジェクトではありません")
  const s = raw as Partial<BuildingSpec>
  if (!s.footprint || typeof s.footprint.width !== "number" || typeof s.footprint.depth !== "number") {
    throw new Error("footprint.width / footprint.depth（m）が必要です")
  }
  if (!Array.isArray(s.floors) || s.floors.length === 0) throw new Error("floors が 1 つ以上必要です")
  const kinds: WallKind[] = ["wall", "window", "door", "glassdoor"]
  const floors: FloorSpec[] = s.floors.map((f, i) => {
    if (!Array.isArray(f.walls)) throw new Error(`floors[${i}].walls が配列ではありません`)
    const walls = f.walls.map((w, j) => {
      for (const k of ["x", "z", "w", "d"] as const) {
        if (typeof w[k] !== "number" || !Number.isFinite(w[k])) throw new Error(`floors[${i}].walls[${j}].${k} が数値ではありません`)
      }
      return { ...w, kind: kinds.includes(w.kind) ? w.kind : "wall" } as WallRect
    })
    return {
      level: typeof f.level === "number" ? f.level : i,
      height: typeof f.height === "number" && f.height > 1.8 ? f.height : 2.7,
      walls,
      slabs: Array.isArray(f.slabs) && f.slabs.length ? f.slabs : [{ x: 0, z: 0, w: s.footprint!.width, d: s.footprint!.depth }],
      rooms: Array.isArray(f.rooms) ? f.rooms : [],
    }
  })
  const roofType: RoofType = s.roof && ["gable", "hip", "shed", "flat"].includes(s.roof.type) ? s.roof.type : "gable"
  const stairs = sanitizeStairs(s.stairs, { floors })
  const parsed: BuildingSpec = {
    version: SPEC_VERSION,
    name: typeof s.name === "string" ? s.name : "取込プラン",
    source: s.source ?? "manual",
    footprint: { width: s.footprint.width, depth: s.footprint.depth },
    wallHeightDefault: typeof s.wallHeightDefault === "number" ? s.wallHeightDefault : 2.7,
    openings: s.openings ?? { sill: 0.9, head: 2.05 },
    floors,
    roof: { type: roofType, pitch: s.roof?.pitch ?? 25, overhang: s.roof?.overhang ?? 0.45 },
    materials: sanitizeMaterials(s.materials),
    ...(Array.isArray(s.furniture)
      ? { furniture: s.furniture.filter(f => f && typeof f.type === "string" && [f.x, f.z, f.ry, f.level].every(v => typeof v === "number" && Number.isFinite(v))) }
      : {}),
    ...(stairs ? { stairs } : {}),
  }
  // 階段の無い古いデータは、読み込み時に置ける場所を探して補う
  return stairs ? parsed : withAutoStairs(parsed)
}

const WALL_FINISHES = Object.keys(WALL_FINISH_LABELS) as WallFinish[]
const ROOF_FINISHES = Object.keys(ROOF_FINISH_LABELS) as RoofFinish[]
const FLOOR_FINISHES = Object.keys(FLOOR_FINISH_LABELS) as FloorFinish[]

/** 色は #RRGGBB、仕上げ材は既知の値だけを受け付ける（外部 JSON の取り込み用） */
export function sanitizeMaterials(raw: unknown): Materials {
  const m = { ...DEFAULT_MATERIALS }
  if (!raw || typeof raw !== "object") return m
  const r = raw as Record<string, unknown>
  for (const k of ["exteriorWall", "roof", "floor", "interiorWall", "trim", "ground"] as ColorKey[]) {
    if (typeof r[k] === "string" && /^#[0-9a-f]{6}$/i.test(r[k] as string)) m[k] = r[k] as string
  }
  if (WALL_FINISHES.includes(r.wallFinish as WallFinish)) m.wallFinish = r.wallFinish as WallFinish
  if (ROOF_FINISHES.includes(r.roofFinish as RoofFinish)) m.roofFinish = r.roofFinish as RoofFinish
  if (FLOOR_FINISHES.includes(r.floorFinish as FloorFinish)) m.floorFinish = r.floorFinish as FloorFinish
  return m
}

// ── 向きをそろえる（玄関を道路側 = +z へ） ─────────────────────────

/** 駐車場の車は建物と一緒に回さない（外構は回した後の建物から決まる） */
const catalogPlace = (type: string) => (/^(car|suv|kei)/.test(type) ? "parking" : "indoor")

type Rot = "cw" | "ccw" | "180"
const ROT_SIDE: Record<Rot, Record<Side, Side>> = {
  // 元の +x が新しい +z になる回転
  cw: { "+x": "+z", "-x": "-z", "+z": "-x", "-z": "+x" },
  // 元の -x が新しい +z になる回転
  ccw: { "-x": "+z", "+x": "-z", "+z": "+x", "-z": "-x" },
  "180": { "+x": "-x", "-x": "+x", "+z": "-z", "-z": "+z" },
}

function rotRect<T extends Rect>(r: T, rot: Rot, W: number, D: number): T {
  const q = (v: number) => Math.round(v * 1000) / 1000
  if (rot === "180") return { ...r, x: q(W - r.x - r.w), z: q(D - r.z - r.d) }
  if (rot === "cw") return { ...r, x: q(D - r.z - r.d), z: q(r.x), w: r.d, d: r.w }
  return { ...r, x: q(r.z), z: q(W - r.x - r.w), w: r.d, d: r.w }
}

function rotPoint(x: number, z: number, rot: Rot, W: number, D: number): [number, number] {
  const q = (v: number) => Math.round(v * 100) / 100
  if (rot === "180") return [q(W - x), q(D - z)]
  if (rot === "cw") return [q(D - z), q(x)]
  return [q(z), q(W - x)]
}

/** 1F の玄関（外に面したドア）が道路側（+z）に無ければ、建物全体を回して玄関を道路側に向ける。戻り値の rotated は回した向き */
export function faceEntranceToRoad(spec: BuildingSpec): { spec: BuildingSpec; rotated: Rot | null } {
  const ground = spec.floors.find(f => f.level === 0)
  const doors = (ground?.walls ?? []).filter(w => w.kind === "door" && w.outside?.length)
  if (!doors.length || doors.some(d => d.outside!.includes("+z"))) return { spec, rotated: null }
  const side = doors[0].outside![0]
  const rot: Rot = side === "-z" ? "180" : side === "+x" ? "cw" : "ccw"
  const W = spec.footprint.width
  const D = spec.footprint.depth
  const map = (sd: Side) => ROT_SIDE[rot][sd]
  const floors = spec.floors.map(f => ({
    ...f,
    walls: f.walls.map(w => ({ ...rotRect(w, rot, W, D), ...(w.outside ? { outside: w.outside.map(map) } : {}) })),
    slabs: f.slabs.map(r => rotRect(r, rot, W, D)),
    rooms: f.rooms.map(r => {
      const [x, z] = rotPoint(r.x, r.z, rot, W, D)
      return { ...r, x, z }
    }),
  }))
  const stairs = spec.stairs?.map(st => ({
    ...rotRect(st, rot, W, D),
    up: map(st.up),
    ...(st.entry ? { entry: map(st.entry) } : {}),
    ...(st.opening ? { opening: rotRect(st.opening, rot, W, D) } : {}),
  }))
  // 家具・設備: 位置を回し、向き（ry: 0 = +z を向く、90 = +x を向く）も同じだけ回す
  const dRy = rot === "180" ? 180 : rot === "cw" ? -90 : 90
  const norm = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180
  const furniture = spec.furniture?.map(it => {
    if (catalogPlace(it.type) === "parking") return it
    const [x, z] = rotPoint(it.x, it.z, rot, W, D)
    return { ...it, x, z, ry: norm(it.ry + dRy) }
  })
  const footprint = rot === "180" ? spec.footprint : { width: D, depth: W }
  return { spec: { ...spec, footprint, floors, ...(stairs ? { stairs } : {}), ...(furniture ? { furniture } : {}) }, rotated: rot }
}

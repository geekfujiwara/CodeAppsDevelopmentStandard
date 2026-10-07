import catalogJson from "../data/furniture-catalog.json" with { type: "json" }
import modelLibraryJson from "../data/model-library.json" with { type: "json" }
import type { BuildingSpec, FloorSpec, Rect, WallRect } from "./building-spec.ts"
import { siteLayout } from "./building-geometry.ts"
import { stairKeepouts } from "./stairs.ts"

/**
 * 家具・車の配置ロジック（three.js 非依存。Node のテストからも使う）
 *
 * 「自然に置く」ためのルール
 * - 壁付け家具（ソファ・ベッド・キッチン・テレビボード…）は最寄りの壁に背を付け、部屋の内側を向く
 * - ドアと掃き出し窓の前 0.9m は通路として空ける
 * - 窓台（床 +0.9m）より背の高い家具は窓の前に置かない
 * - 家具同士は重ならない（重なる場合は壁沿いにずらす）
 * - 車は駐車場の中央に、道路側を向けて置く
 */

export type Vec3 = [number, number, number]
export type ShapePart = { s: "box" | "cyl" | "sph"; p: Vec3; z: Vec3; r?: number; rot?: Vec3; axis?: "x" | "y" | "z"; m: string }
export type UsePart = { use: string; p: Vec3; ry?: number }
export type CatalogPart = ShapePart | UsePart
export type PlaceRule = "wall" | "free" | "corner" | "parking"
export type Category = "living" | "dining" | "bedroom" | "entry" | "wet" | "lighting" | "vehicle"
export type CatalogItem = {
  label: string
  category: Category
  place: PlaceRule
  w: number
  d: number
  h: number
  flat?: boolean
  /** "ceiling" = 天井から吊る（部品の y は天井面からの高さ。負の値で下がる） */
  mount?: "ceiling"
  /** 実在の 3D モデル（GLB）。読めないときは parts（外形の箱）で表示する */
  model?: ModelRef
  /** 置き換え元のアイテム（同じ使い方の手続き生成版） */
  base?: string
  hidden?: boolean
  colorable?: string
  colors?: string[]
  parts: CatalogPart[]
}
export type FurnitureMaterial = { color: string; roughness: number; metalness: number; sheen?: number; coat?: number; emissive?: number }
export type FurnitureCatalog = { version: number; materials: Record<string, FurnitureMaterial>; items: Record<string, CatalogItem> }

export type FurnitureItem = {
  id: string
  type: string
  /** 階（0 = 1F）。車は 0 */
  level: number
  x: number
  z: number
  /** 向き（度）。0 = 正面が +z（南・道路側） */
  ry: number
  color?: string
  /** 間取り図の設備の記号から置いたもの（おまかせ配置・片付けで消さない） */
  fixed?: boolean
}

export type ModelRef = { file: string; license: string; author: string; source: string; bytes: number; sha256: string; polys: number; materials: string[] }

/** 家具カタログ + 3D モデルの manifest（scripts/fetch_models.py が生成）。Blender の load_catalog も同じ統合をする */
export const CATALOG: FurnitureCatalog = (() => {
  const base = catalogJson as unknown as FurnitureCatalog
  const models = (modelLibraryJson as unknown as { models: Record<string, CatalogItem> }).models
  return { ...base, items: { ...base.items, ...models } }
})()

export const CATEGORY_LABELS: Record<Category, string> = {
  living: "リビング",
  dining: "ダイニング・キッチン",
  bedroom: "寝室・個室",
  entry: "玄関・インテリア",
  wet: "水回り",
  lighting: "照明",
  vehicle: "駐車場",
}

export const catalogItem = (type: string): CatalogItem | undefined => CATALOG.items[type]
export const isOutdoor = (type: string) => catalogItem(type)?.place === "parking"
export const isCeilingMount = (type: string) => catalogItem(type)?.mount === "ceiling"

/** 床から天井面までの高さ（m）。最上階は屋根下の天井、それ以外は上階の床スラブの下面。Blender の furniture.py と同じ */
export function ceilingHeight(spec: BuildingSpec, level: number): number {
  const floor = spec.floors.find(f => f.level === level)
  if (!floor) return spec.wallHeightDefault
  const top = spec.floors.every(f => f.level <= level)
  return floor.height - (top ? 0.005 : 0.15)
}

let seq = 0
export const newFurnitureId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ── 部品の展開（use を再帰的に解決） ─────────────────────────

const rad = (deg: number) => (deg * Math.PI) / 180

function rotY([x, y, z]: Vec3, deg: number): Vec3 {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  // three.js の Y 回転と同じ向き（+z を +x へ回す）
  return [x * c + z * s, y, -x * s + z * c]
}

/** アイテムのローカル座標の形状部品一覧（入れ子の use を展開済み） */
export function expandParts(type: string, depth = 0): ShapePart[] {
  const item = CATALOG.items[type]
  if (!item || depth > 4) return []
  const out: ShapePart[] = []
  for (const part of item.parts) {
    if ("use" in part) {
      const ry = part.ry ?? 0
      for (const child of expandParts(part.use, depth + 1)) {
        const p = rotY(child.p, ry)
        const rot = child.rot ?? [0, 0, 0]
        out.push({ ...child, p: [p[0] + part.p[0], p[1] + part.p[1], p[2] + part.p[2]], rot: [rot[0], rot[1] + ry, rot[2]] })
      }
    } else {
      out.push(part)
    }
  }
  return out
}

// ── 矩形（平面 x-z）ユーティリティ ─────────────────────────

export type Box2 = { x0: number; x1: number; z0: number; z1: number }

const overlap = (a: Box2, b: Box2, eps = 0.005) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps
const rectToBox = (r: Rect): Box2 => ({ x0: r.x, x1: r.x + r.w, z0: r.z, z1: r.z + r.d })
const area = (b: Box2) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.z1 - b.z0)

/** 回転を考慮した設置面（軸平行の外接矩形） */
export function footprint(item: Pick<FurnitureItem, "type" | "x" | "z" | "ry">): Box2 {
  const c = catalogItem(item.type)
  if (!c) return { x0: item.x, x1: item.x, z0: item.z, z1: item.z }
  const a = rad(item.ry)
  const hw = (Math.abs(Math.cos(a)) * c.w + Math.abs(Math.sin(a)) * c.d) / 2
  const hd = (Math.abs(Math.sin(a)) * c.w + Math.abs(Math.cos(a)) * c.d) / 2
  return { x0: item.x - hw, x1: item.x + hw, z0: item.z - hd, z1: item.z + hd }
}

/** 床から上の高さが窓台を超える（窓の前に置けない）か */
const isTall = (spec: BuildingSpec, type: string) => (catalogItem(type)?.h ?? 0) > spec.openings.sill + 0.02

// ── 部屋の範囲（クリック点や部屋重心から壁までの矩形） ─────────────────

/**
 * 点 (px, pz) を含む壁で囲まれた矩形を求める。
 * 4 方向に壁（開口部も壁の線として扱う）までレイを飛ばし、内側に食い込む壁があれば面積が最大になるよう切り詰める。
 */
export function roomBox(floor: FloorSpec, footprintBox: Box2, px: number, pz: number): Box2 {
  const walls = floor.walls
  const b: Box2 = { ...footprintBox }
  for (const w of walls) {
    const r = rectToBox(w)
    if (pz >= r.z0 - 1e-3 && pz <= r.z1 + 1e-3) {
      if (r.x0 >= px) b.x1 = Math.min(b.x1, r.x0)
      if (r.x1 <= px) b.x0 = Math.max(b.x0, r.x1)
    }
    if (px >= r.x0 - 1e-3 && px <= r.x1 + 1e-3) {
      if (r.z0 >= pz) b.z1 = Math.min(b.z1, r.z0)
      if (r.z1 <= pz) b.z0 = Math.max(b.z0, r.z1)
    }
  }
  for (let iter = 0; iter < 30; iter++) {
    const hit = walls.map(rectToBox).find(r => overlap(r, b, 0.01))
    if (!hit) break
    const cands: Box2[] = []
    if (hit.x0 > px) cands.push({ ...b, x1: hit.x0 })
    if (hit.x1 < px) cands.push({ ...b, x0: hit.x1 })
    if (hit.z0 > pz) cands.push({ ...b, z1: hit.z0 })
    if (hit.z1 < pz) cands.push({ ...b, z0: hit.z1 })
    if (!cands.length) break
    cands.sort((a, c) => area(c) - area(a))
    Object.assign(b, cands[0])
  }
  return b
}

type Side = "n" | "s" | "w" | "e"
const SIDES: Side[] = ["n", "s", "w", "e"]
/** 壁に背を付けたときの向き（正面 = 部屋の内側） */
const SIDE_RY: Record<Side, number> = { n: 0, s: 180, w: 90, e: -90 }
const OPPOSITE: Record<Side, Side> = { n: "s", s: "n", w: "e", e: "w" }

type Opening = { side: Side; a0: number; a1: number; kind: WallRect["kind"] }

/** 部屋の境界線上にある開口部（ドア・窓・掃き出し窓） */
function openingsOf(floor: FloorSpec, b: Box2): Opening[] {
  const out: Opening[] = []
  const tol = 0.3
  for (const w of floor.walls) {
    if (w.kind === "wall") continue
    const r = rectToBox(w)
    const alongX = r.x1 - r.x0 >= r.z1 - r.z0
    if (alongX) {
      if (r.x1 <= b.x0 + 0.05 || r.x0 >= b.x1 - 0.05) continue
      if (Math.abs(r.z1 - b.z0) < tol) out.push({ side: "n", a0: r.x0, a1: r.x1, kind: w.kind })
      else if (Math.abs(r.z0 - b.z1) < tol) out.push({ side: "s", a0: r.x0, a1: r.x1, kind: w.kind })
    } else {
      if (r.z1 <= b.z0 + 0.05 || r.z0 >= b.z1 - 0.05) continue
      if (Math.abs(r.x1 - b.x0) < tol) out.push({ side: "w", a0: r.z0, a1: r.z1, kind: w.kind })
      else if (Math.abs(r.x0 - b.x1) < tol) out.push({ side: "e", a0: r.z0, a1: r.z1, kind: w.kind })
    }
  }
  return out
}

/** ドア・掃き出し窓の前の通路（家具を置かない範囲） */
function clearanceOf(o: Opening, b: Box2): Box2 | null {
  if (o.kind !== "door" && o.kind !== "glassdoor") return null
  const depth = o.kind === "door" ? 0.9 : 0.75
  const a0 = o.a0 - 0.1
  const a1 = o.a1 + 0.1
  switch (o.side) {
    case "n": return { x0: a0, x1: a1, z0: b.z0, z1: b.z0 + depth }
    case "s": return { x0: a0, x1: a1, z0: b.z1 - depth, z1: b.z1 }
    case "w": return { x0: b.x0, x1: b.x0 + depth, z0: a0, z1: a1 }
    case "e": return { x0: b.x1 - depth, x1: b.x1, z0: a0, z1: a1 }
  }
}

type Ctx = {
  spec: BuildingSpec
  level: number
  box: Box2
  openings: Opening[]
  occupied: Box2[]
  placed: FurnitureItem[]
  /** この階の固定の設備（図面から） */
  fixed: FurnitureItem[]
}

function makeCtx(spec: BuildingSpec, level: number, box: Box2, existing: FurnitureItem[]): Ctx {
  const floor = spec.floors.find(f => f.level === level)!
  const openings = openingsOf(floor, box)
  const occupied: Box2[] = []
  for (const o of openings) {
    const c = clearanceOf(o, box)
    if (c) occupied.push(c)
  }
  // 階段・上り口・上がり口・吹き抜けの手すり壁
  occupied.push(...stairKeepouts(spec, level))
  for (const it of existing) {
    if (it.level !== level || catalogItem(it.type)?.flat || isOutdoor(it.type)) continue
    occupied.push(footprint(it))
  }
  return { spec, level, box, openings, occupied, placed: [], fixed: existing.filter(it => it.fixed && it.level === level) }
}

function fits(ctx: Ctx, item: FurnitureItem, side?: Side): boolean {
  const fp = footprint(item)
  const b = ctx.box
  if (fp.x0 < b.x0 - 0.01 || fp.x1 > b.x1 + 0.01 || fp.z0 < b.z0 - 0.01 || fp.z1 > b.z1 + 0.01) return false
  if (!catalogItem(item.type)?.flat && ctx.occupied.some(o => overlap(o, fp))) return false
  if (side && isTall(ctx.spec, item.type)) {
    const [a0, a1] = side === "n" || side === "s" ? [fp.x0, fp.x1] : [fp.z0, fp.z1]
    if (ctx.openings.some(o => o.side === side && o.kind !== "door" && o.a0 < a1 - 0.02 && a0 < o.a1 - 0.02)) return false
  }
  return true
}

function commit(ctx: Ctx, item: FurnitureItem) {
  ctx.placed.push(item)
  if (!catalogItem(item.type)?.flat) ctx.occupied.push(footprint(item))
  return item
}

/** この部屋（ctx.box）にある固定の設備のうち、種類が re に合うもの */
function fixedIn(ctx: Ctx, re: RegExp): FurnitureItem | undefined {
  // キッチンなどは部屋のくぼみ（アルコーブ）に置かれ、部屋の範囲の少し外になることがある
  const b = ctx.box
  const grown = { x0: b.x0 - 0.4, x1: b.x1 + 0.4, z0: b.z0 - 0.4, z1: b.z1 + 0.4 }
  return ctx.fixed.find(it => re.test(it.type) && overlap(footprint(it), grown, 0.05))
}

function sideRange(b: Box2, side: Side): [number, number] {
  return side === "n" || side === "s" ? [b.x0, b.x1] : [b.z0, b.z1]
}

function wallItem(ctx: Ctx, type: string, side: Side, a: number, extra?: Partial<FurnitureItem>): FurnitureItem {
  const c = catalogItem(type)!
  const off = c.d / 2 + 0.02
  const b = ctx.box
  const [x, z] =
    side === "n" ? [a, b.z0 + off] : side === "s" ? [a, b.z1 - off] : side === "w" ? [b.x0 + off, a] : [b.x1 - off, a]
  return { id: newFurnitureId(), type, level: ctx.level, x: round(x), z: round(z), ry: SIDE_RY[side], ...extra }
}

const round = (v: number) => Math.round(v * 100) / 100

/** 壁沿いに置く。prefer の位置から左右交互に 5cm ずつずらして空きを探す */
function tryWall(ctx: Ctx, type: string, side: Side, prefer: number | "center" | "start" | "end", extra?: Partial<FurnitureItem>): FurnitureItem | null {
  const c = catalogItem(type)
  if (!c) return null
  const [lo, hi] = sideRange(ctx.box, side)
  const min = lo + c.w / 2 + 0.02
  const max = hi - c.w / 2 - 0.02
  if (max < min) return null
  const start = prefer === "center" ? (min + max) / 2 : prefer === "start" ? min : prefer === "end" ? max : Math.min(max, Math.max(min, prefer))
  const steps = Math.ceil((max - min) / 0.05) + 1
  for (let i = 0; i <= steps * 2; i++) {
    const k = i % 2 === 0 ? i / 2 : -(i + 1) / 2
    const a = start + k * 0.05
    if (a < min - 1e-6 || a > max + 1e-6) continue
    const it = wallItem(ctx, type, side, a, extra)
    if (fits(ctx, it, side)) return commit(ctx, it)
  }
  return null
}

/** 自由配置。指定点から渦巻き状に空きを探す */
function tryFree(ctx: Ctx, type: string, x: number, z: number, ry: number, radius = 1.5, extra?: Partial<FurnitureItem>): FurnitureItem | null {
  for (let r = 0; r <= radius + 1e-6; r += 0.1) {
    const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 0.1))
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
      const it: FurnitureItem = { id: newFurnitureId(), type, level: ctx.level, x: round(x + Math.cos(t) * r), z: round(z + Math.sin(t) * r), ry, ...extra }
      if (fits(ctx, it)) return commit(ctx, it)
    }
  }
  return null
}

function tryCorner(ctx: Ctx, type: string, which: number[] = [0, 1, 2, 3]): FurnitureItem | null {
  const c = catalogItem(type)
  if (!c) return null
  const b = ctx.box
  const inset = Math.max(c.w, c.d) / 2 + 0.05
  const corners: [number, number][] = [[b.x0 + inset, b.z0 + inset], [b.x1 - inset, b.z0 + inset], [b.x1 - inset, b.z1 - inset], [b.x0 + inset, b.z1 - inset]]
  for (const i of which) {
    const [x, z] = corners[i]
    const it: FurnitureItem = { id: newFurnitureId(), type, level: ctx.level, x: round(x), z: round(z), ry: 0 }
    if (fits(ctx, it)) return commit(ctx, it)
  }
  return null
}

// ── 部屋ごとのレイアウト ──────────────────────────────

const openLen = (ctx: Ctx, side: Side, kinds: WallRect["kind"][]) =>
  ctx.openings.filter(o => o.side === side && kinds.includes(o.kind)).reduce((s, o) => s + (o.a1 - o.a0), 0)

/** LDK: キッチン（掃き出し窓の反対側）→ 冷蔵庫 → ダイニング → テレビとソファ（掃き出し窓側） → 観葉植物 */
function stageLiving(ctx: Ctx) {
  const b = ctx.box
  const view = [...SIDES].sort((a, c) => openLen(ctx, c, ["glassdoor"]) - openLen(ctx, a, ["glassdoor"]) || openLen(ctx, c, ["window"]) - openLen(ctx, a, ["window"]))[0]
  const kitchenSides: Side[] = [OPPOSITE[view], ...SIDES.filter(s => s !== view && s !== OPPOSITE[view])]
  let kitchen: FurnitureItem | null = null
  let kSide: Side = kitchenSides[0]
  // 図面にキッチンがあれば（固定の設備）それを使い、冷蔵庫も置かない
  // L 字の LDK は部屋の範囲がキッチンのくぼみの手前で切れることがある。1 つの階のキッチンは 1 つなので、同じ階の固定のキッチンを使う
  const fixedKitchen = fixedIn(ctx, /^kitchen/) ?? ctx.fixed.find(it => /^kitchen/.test(it.type))
  if (fixedKitchen) {
    kitchen = fixedKitchen
    kSide = (Object.keys(SIDE_RY) as Side[]).find(sd => SIDE_RY[sd] === fixedKitchen.ry) ?? kSide
  }
  for (const s of fixedKitchen ? [] : kitchenSides) {
    kitchen = tryWall(ctx, "kitchen", s, "center")
    if (kitchen) {
      kSide = s
      break
    }
  }
  const alongX = (s: Side) => s === "n" || s === "s"
  const inward = (s: Side, dist: number): [number, number] =>
    s === "n" ? [0, b.z0 + dist] : s === "s" ? [0, b.z1 - dist] : s === "w" ? [b.x0 + dist, 0] : [b.x1 - dist, 0]
  if (kitchen) {
    const kc = catalogItem(kitchen.type)!
    const fc = catalogItem("fridge")!
    const ka = alongX(kSide) ? kitchen.x : kitchen.z
    if (!fixedKitchen && !fixedIn(ctx, /^fridge$/)) {
      if (!tryWall(ctx, "fridge", kSide, ka + kc.w / 2 + fc.w / 2 + 0.05)) tryWall(ctx, "fridge", kSide, ka - kc.w / 2 - fc.w / 2 - 0.05)
    }
    // ダイニングはキッチンの前、通路 1m をあけて
    const dc = catalogItem("diningSet")!
    const dist = kc.d + 1.0 + dc.d / 2
    const [ix, iz] = inward(kSide, dist)
    const dx = alongX(kSide) ? ka : ix
    const dz = alongX(kSide) ? iz : ka
    if (!tryFree(ctx, "diningSet", dx, dz, alongX(kSide) ? 0 : 90, 1.5)) {
      // 狭い DK（キッチン前の幅 2m 未満など）は 2 人掛けを、椅子がキッチンと平行に並ぶ向き → 直交する向きの順で試す
      const d2 = catalogItem("diningSet2")!
      for (const [ry, depth] of alongX(kSide) ? [[90, d2.w], [0, d2.d]] : [[0, d2.w], [90, d2.d]]) {
        const [jx, jz] = inward(kSide, kc.d + 0.9 + depth / 2)
        if (tryFree(ctx, "diningSet2", alongX(kSide) ? ka : jx, alongX(kSide) ? jz : ka, ry, 1.5)) break
      }
    }
  } else if (!tryFree(ctx, "diningSet", (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, 2)) {
    tryFree(ctx, "diningSet2", (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, 2)
  }

  // リビング: キッチンと反対側の半分。テレビボードはキッチン壁と直交する壁に付け、ソファを向かい合わせる
  const perp: Side[] = alongX(kSide) ? ["e", "w"] : ["n", "s"]
  const [vlo, vhi] = alongX(kSide) ? [b.z0, b.z1] : [b.x0, b.x1]
  const toView = kSide === "n" || kSide === "w" ? 1 : -1
  const livingA = toView > 0 ? vlo + (vhi - vlo) * 0.72 : vlo + (vhi - vlo) * 0.28
  const tvc = catalogItem("tvBoard")!
  const sc = catalogItem("sofa")!
  for (const p of perp) {
    const tv = tryWall(ctx, "tvBoard", p, livingA)
    if (!tv) continue
    const a = alongX(p) ? tv.x : tv.z
    const gap = 2.3
    const dist = tvc.d + gap + sc.d / 2
    const [ix, iz] = inward(p, dist)
    const sx = alongX(p) ? a : ix
    const sz = alongX(p) ? iz : a
    const sofa = tryFree(ctx, "sofa", sx, sz, SIDE_RY[OPPOSITE[p]], 0.6)
    if (!sofa) {
      ctx.placed.pop()
      ctx.occupied.pop()
      continue
    }
    const [rx, rz] = inward(p, tvc.d + gap / 2 + 0.1)
    const cx = alongX(p) ? a : rx
    const cz = alongX(p) ? rz : a
    const rugRy = alongX(p) ? 0 : 90
    tryFree(ctx, "rug", cx, cz, rugRy, 0.3)
    tryFree(ctx, "coffeeTable", cx, cz, rugRy, 0.4)
    break
  }
  tryCorner(ctx, "plant")
  tryCorner(ctx, "plant")
}

function sidesByFreeness(ctx: Ctx) {
  return [...SIDES].sort((a, c) => {
    const score = (s: Side) => openLen(ctx, s, ["door"]) * 3 + openLen(ctx, s, ["glassdoor"]) * 2 + openLen(ctx, s, ["window"])
    return score(a) - score(c) || sideLen(ctx.box, c) - sideLen(ctx.box, a)
  })
}
const sideLen = (b: Box2, s: Side) => (s === "n" || s === "s" ? b.x1 - b.x0 : b.z1 - b.z0)

/** 寝室: ベッド（ドアの無い壁に頭）→ ナイトテーブル → ワードローブ → デスク */
function stageBedroom(ctx: Ctx, areaM2: number) {
  // 広い部屋はダブル。ドアの前の通路でダブルが入らなければシングルにする
  const types = areaM2 >= 9.5 ? ["bedDouble", "bedSingle"] : ["bedSingle"]
  let bed: FurnitureItem | null = null
  let bSide: Side = "n"
  let bedType = types[0]
  outer: for (const t of types) {
    for (const s of sidesByFreeness(ctx)) {
      bed = tryWall(ctx, t, s, "center")
      if (bed) {
        bSide = s
        bedType = t
        break outer
      }
    }
  }
  const bc = catalogItem(bedType)!
  if (bed) {
    const a = bSide === "n" || bSide === "s" ? bed.x : bed.z
    tryWall(ctx, "nightstand", bSide, a + bc.w / 2 + 0.28)
    tryWall(ctx, "nightstand", bSide, a - bc.w / 2 - 0.28)
  }
  for (const s of sidesByFreeness(ctx).filter(s => s !== bSide)) {
    if (tryWall(ctx, "wardrobe", s, "end") || tryWall(ctx, "wardrobe", s, "start")) break
  }
  if (areaM2 >= 9) {
    const windowSides = SIDES.filter(s => openLen(ctx, s, ["window"]) > 0 && s !== bSide)
    for (const s of [...windowSides, ...SIDES.filter(s => s !== bSide && !windowSides.includes(s))]) {
      if (tryWall(ctx, "desk", s, "center")) break
    }
  }
  tryCorner(ctx, "plant")
}

function stageEntry(ctx: Ctx) {
  for (const s of sidesByFreeness(ctx)) if (tryWall(ctx, "shoeCabinet", s, "center")) break
  tryCorner(ctx, "plant")
}

type RoomKind = "living" | "bedroom" | "entry" | "bath" | "wash" | "toilet" | "wet" | "skip"

function classify(name: string, areaM2: number, box: Box2): RoomKind {
  const minDim = Math.min(box.x1 - box.x0, box.z1 - box.z0)
  if (/LDK|リビング|LD/.test(name)) return "living"
  if (/玄関|ホール/.test(name)) return "entry"
  if (/浴室|風呂|バス|UB/.test(name)) return "bath"
  if (/洗面|脱衣/.test(name)) return "wash"
  if (/トイレ|WC/.test(name)) return "toilet"
  if (/水回り/.test(name)) return "wet"
  if (/廊下|水回り|浴室|洗面|トイレ|収納|WIC|クローゼット/.test(name)) return "skip"
  // シングルベッド（1.0 × 2.1m）が入る広さ（短辺 1.7m・4.5m² 以上）なら寝室として家具を置く（狭小住宅の 3〜4.5 帖の洋室）
  if (minDim < 1.7 || areaM2 < 4.5) return "skip"
  if (/洋室|寝室|和室|子供|書斎/.test(name)) return "bedroom"
  return "skip"
}

/**
 * 水回り: 浴槽はドアから遠い壁、洗面台はドアに近い壁、洗濯機は洗面台の隣、トイレは空いている壁の中央。
 * 「水回り」とだけ書かれた部屋は広さで中身を決める（3.5m² 未満: トイレ / 6.5m² 未満: 浴槽 + 洗面 / それ以上: 全部）
 */
function stageWet(ctx: Ctx, kind: "bath" | "wash" | "toilet" | "wet", areaM2: number) {
  const free = sidesByFreeness(ctx)
  // 図面の設備（固定）として同じ種類がこの部屋にあれば置かない
  const want = (kind === "wet" ? (areaM2 < 3.5 ? ["toilet"] : areaM2 < 6.5 ? ["bathtub", "washbasin"] : ["bathtub", "washbasin", "washer", "toilet"]) : kind === "bath" ? ["bathtub"] : kind === "wash" ? ["washbasin", "washer"] : ["toilet"])
    .filter(t => !fixedIn(ctx, new RegExp(`^${t}`)))
  const used = new Set<Side>()
  if (want.includes("bathtub")) {
    // 1616 が入らない小さな浴室はコンパクト（1216 相当）
    outer: for (const t of ["bathtub", "bathtubCompact"]) {
      for (const s of free) {
        if (tryWall(ctx, t, s, "end") || tryWall(ctx, t, s, "start")) {
          used.add(s)
          break outer
        }
      }
    }
  }
  if (want.includes("washbasin")) {
    // ドアに近い壁 = 空き順の逆から（ドアのある壁そのものは開口で置けない区間をよける）
    for (const s of [...free].reverse().filter(s => !used.has(s))) {
      const basin = tryWall(ctx, "washbasin", s, "start") ?? tryWall(ctx, "washbasin", s, "end")
      if (!basin) continue
      used.add(s)
      if (want.includes("washer")) {
        const a = s === "n" || s === "s" ? basin.x : basin.z
        const bc = catalogItem("washbasin")!
        const wc = catalogItem("washer")!
        if (!tryWall(ctx, "washer", s, a + bc.w / 2 + wc.w / 2 + 0.05)) tryWall(ctx, "washer", s, a - bc.w / 2 - wc.w / 2 - 0.05)
      }
      break
    }
  }
  if (want.includes("toilet")) {
    for (const s of free.filter(s => !used.has(s))) if (tryWall(ctx, "toilet", s, "center")) break
  }
}

/** 天井照明: 部屋ごとに 1 灯（長辺 4.5m 超は 2 灯）。ダイニングテーブルの上はペンダント */
function stageLights(level: number, box: Box2, placed: FurnitureItem[]): FurnitureItem[] {
  const out: FurnitureItem[] = []
  const w = box.x1 - box.x0
  const d = box.z1 - box.z0
  if (w * d < 1.2) return out
  const dining = placed.find(p => p.type.startsWith("diningSet") && p.level === level && p.x > box.x0 && p.x < box.x1 && p.z > box.z0 && p.z < box.z1)
  const cx = (box.x0 + box.x1) / 2
  const cz = (box.z0 + box.z1) / 2
  const spots: [number, number][] = Math.max(w, d) > 4.5 ? (w >= d ? [[box.x0 + w / 4, cz], [box.x1 - w / 4, cz]] : [[cx, box.z0 + d / 4], [cx, box.z1 - d / 4]]) : [[cx, cz]]
  for (const [x, z] of spots) {
    // ペンダントと近すぎるシーリングは置かない
    if (dining && Math.hypot(dining.x - x, dining.z - z) < 1.2) continue
    out.push({ id: newFurnitureId(), type: "ceilingLight", level, x: round(x), z: round(z), ry: 0 })
  }
  if (dining) out.push({ id: newFurnitureId(), type: "pendant", level, x: dining.x, z: dining.z, ry: 0 })
  return out
}

/** 全室のおまかせ配置（既存の家具は置き換え）と、駐車場への車 1 台 */
export function autoStage(spec: BuildingSpec, opts: { car?: string; carColor?: string; models?: boolean } = {}): FurnitureItem[] {
  // 図面の設備（固定）は残し、それを避けて置く。同じ部屋に同じ設備は重ねて置かない
  const result: FurnitureItem[] = (spec.furniture ?? []).filter(f => f.fixed)
  const fp = { x0: 0, x1: spec.footprint.width, z0: 0, z1: spec.footprint.depth }
  for (const floor of spec.floors) {
    for (const room of floor.rooms) {
      const box = roomBox(floor, fp, room.x, room.z)
      const kind = classify(room.name, room.area, box)
      if (kind !== "skip") {
        const ctx = makeCtx(spec, floor.level, box, result)
        if (kind === "living") stageLiving(ctx)
        else if (kind === "bedroom") stageBedroom(ctx, room.area)
        else if (kind === "entry") stageEntry(ctx)
        else stageWet(ctx, kind, room.area)
        result.push(...ctx.placed)
      }
      // 同じ矩形を共有する部屋（ラベルが 2 つある大部屋）に 2 回付けない
      if (!result.some(it => it.level === floor.level && isCeilingMount(it.type) && it.x > box.x0 && it.x < box.x1 && it.z > box.z0 && it.z < box.z1)) {
        result.push(...stageLights(floor.level, box, result))
      }
    }
  }
  const car = placeCar(spec, opts.car ?? "car", opts.carColor)
  if (car) result.push(car)
  if (!opts.models) return result
  const out = [...result]
  out.forEach((it, i) => (out[i] = toModelVariant(it, spec, out.filter((_, k) => k !== i))))
  return out
}

/**
 * 手続き生成の家具を、同じ用途の実在 3D モデル（カタログの base が一致）に置き換える。
 * 外形が元より小さければそのまま。大きいときは spec と周りの家具を渡せば、壁・家具・ドア前・階段に重ならないときだけ置き換える
 */
export function toModelVariant(item: FurnitureItem, spec?: BuildingSpec, others: FurnitureItem[] = []): FurnitureItem {
  const from = catalogItem(item.type)
  const entry = Object.entries(CATALOG.items).find(([, c]) => c.base === item.type && c.model)
  if (!from || !entry) return item
  const [type, to] = entry
  // 壁付けは背を壁に付けたまま（奥行きの差の半分だけ壁側へ寄せる）
  const back = from.place === "wall" ? (from.d - to.d) / 2 : 0
  const a = rad(item.ry)
  const next: FurnitureItem = { ...item, type, x: round(item.x - Math.sin(a) * back), z: round(item.z - Math.cos(a) * back) }
  delete next.color
  if (to.w <= from.w + 1e-6 && to.d <= from.d + 1e-6) return next
  if (!spec) return item
  const floor = spec.floors.find(f => f.level === item.level)
  if (!floor) return item
  const fp = footprint(next)
  const blocked = [
    ...floor.walls.map(rectToBox),
    ...floor.walls.filter(w => w.kind === "door").map(w => (w.w >= w.d ? { x0: w.x, x1: w.x + w.w, z0: w.z - 0.9, z1: w.z + w.d + 0.9 } : { x0: w.x - 0.9, x1: w.x + w.w + 0.9, z0: w.z, z1: w.z + w.d })),
    ...stairKeepouts(spec, item.level),
    ...others.filter(o => o.level === item.level && !catalogItem(o.type)?.flat && !isOutdoor(o.type)).map(footprint),
  ]
  return blocked.some(b => overlap(b, fp)) ? item : next
}

export function placeCar(spec: BuildingSpec, type = "car", color?: string): FurnitureItem | null {
  const p = siteLayout(spec).parking
  const c = catalogItem(type)
  if (!p || !c) return null
  // 頭から道路へ出られる向き（前向き = 道路側）で、奥（建物側）に寄せすぎない
  const z = Math.min(p.z1 - c.d / 2 - 0.3, p.z0 + c.d / 2 + 0.6)
  return { id: newFurnitureId(), type, level: 0, x: round((p.x0 + p.x1) / 2), z: round(Math.max(p.z0 + c.d / 2, z)), ry: 0, ...(color ? { color } : {}) }
}

// ── 手動配置のスナップ ─────────────────────────────────

/**
 * クリック／ドラッグで置いた位置を「自然な」位置に補正する。
 * - 壁付け家具: 0.8m 以内の壁に背を付け、部屋の内側を向ける（ドア前・窓前は避けて壁沿いにずらす）
 * - 自由配置: 他の家具・ドア前と重ならない最寄りの位置へ
 * - 車: 駐車場の近くなら駐車場の中央へ、建物とは重ならない位置へ
 */
export function snapItem(spec: BuildingSpec, item: FurnitureItem, others: FurnitureItem[]): FurnitureItem {
  const c = catalogItem(item.type)
  if (!c) return item
  if (c.place === "parking") return snapVehicle(spec, item, others)
  const floor = spec.floors.find(f => f.level === item.level) ?? spec.floors[0]
  const fpBox = { x0: 0, x1: spec.footprint.width, z0: 0, z1: spec.footprint.depth }
  const px = Math.min(fpBox.x1 - 0.05, Math.max(fpBox.x0 + 0.05, item.x))
  const pz = Math.min(fpBox.z1 - 0.05, Math.max(fpBox.z0 + 0.05, item.z))
  const box = roomBox(floor, fpBox, px, pz)
  const ctx = makeCtx(spec, floor.level, box, others.filter(o => o.id !== item.id))
  const keep = { id: item.id, color: item.color }
  if (c.flat) {
    const fp = footprint({ ...item, x: 0, z: 0 })
    return {
      ...item,
      x: round(Math.min(box.x1 + fp.x0, Math.max(box.x0 - fp.x0, item.x))),
      z: round(Math.min(box.z1 + fp.z0, Math.max(box.z0 - fp.z0, item.z))),
    }
  }
  if (c.place === "wall") {
    const dist: Record<Side, number> = { n: pz - box.z0, s: box.z1 - pz, w: px - box.x0, e: box.x1 - px }
    const sides = [...SIDES].sort((a, b) => dist[a] - dist[b])
    for (const s of sides) {
      if (dist[s] - c.d / 2 > 0.8) break
      const it = tryWall(ctx, item.type, s, s === "n" || s === "s" ? px : pz, keep)
      if (it) return it
    }
  }
  if (c.place === "corner") {
    const order = [0, 1, 2, 3].sort((a, b) => cornerDist(box, a, px, pz) - cornerDist(box, b, px, pz))
    if (cornerDist(box, order[0], px, pz) < 1.0) {
      const it = tryCorner(ctx, item.type, order.slice(0, 1))
      if (it) return { ...it, ...keep }
    }
  }
  return tryFree(ctx, item.type, px, pz, item.ry, 1.5, keep) ?? { ...item, x: round(px), z: round(pz) }
}

function cornerDist(b: Box2, i: number, x: number, z: number) {
  const [cx, cz] = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]][i]
  return Math.hypot(cx - x, cz - z)
}

function snapVehicle(spec: BuildingSpec, item: FurnitureItem, others: FurnitureItem[]): FurnitureItem {
  const c = catalogItem(item.type)!
  const p = siteLayout(spec).parking
  if (p) {
    const cx = (p.x0 + p.x1) / 2
    const cz = (p.z0 + p.z1) / 2
    if (Math.hypot(item.x - cx, item.z - cz) < 3.5) {
      const auto = placeCar(spec, item.type, item.color)!
      const ry = Math.abs(((item.ry % 360) + 360) % 360 - 180) < 90 ? 180 : 0
      return { ...auto, id: item.id, ry }
    }
  }
  // 建物・他の車と重ならない位置へ押し出す
  const building = { x0: -0.3, x1: spec.footprint.width + 0.3, z0: -0.3, z1: spec.footprint.depth + 0.3 }
  const blockers = [building, ...others.filter(o => o.id !== item.id && isOutdoor(o.type)).map(footprint)]
  for (let r = 0; r <= 8; r += 0.2) {
    const n = r === 0 ? 1 : Math.round((2 * Math.PI * r) / 0.2)
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
      const cand = { ...item, x: round(item.x + Math.cos(t) * r), z: round(item.z + Math.sin(t) * r) }
      const fp = footprint(cand)
      if (!blockers.some(b => overlap(b, fp))) return cand
    }
  }
  return { ...item, ry: item.ry || 0, x: item.x, z: item.z + c.d }
}

/** 回転（壁・他の家具と重なる場合は近くの空きへずらす） */
export function rotateItem(spec: BuildingSpec, item: FurnitureItem, others: FurnitureItem[], delta: number): FurnitureItem {
  const c = catalogItem(item.type)
  let ry = (((item.ry + delta) % 360) + 360) % 360
  if (ry > 180) ry -= 360
  const turned = { ...item, ry }
  if (!c) return turned
  if (c.place === "parking") return snapVehicle(spec, turned, others)
  const floor = spec.floors.find(f => f.level === item.level) ?? spec.floors[0]
  const fpBox = { x0: 0, x1: spec.footprint.width, z0: 0, z1: spec.footprint.depth }
  const box = roomBox(floor, fpBox, item.x, item.z)
  const ctx = makeCtx(spec, floor.level, box, others.filter(o => o.id !== item.id))
  return tryFree(ctx, item.type, item.x, item.z, ry, 1.0, { id: item.id, color: item.color }) ?? turned
}

/** 歩行の当たり判定用（ラグなど平らなものは除く） */
export function obstacleBoxes(items: FurnitureItem[], level: number, outdoor: boolean): Box2[] {
  return items
    .filter(i => !catalogItem(i.type)?.flat && (outdoor ? isOutdoor(i.type) : !isOutdoor(i.type) && i.level === level))
    .map(footprint)
}

/** 外部 JSON の取り込み用 */
export function sanitizeFurniture(raw: unknown): FurnitureItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .filter(r => typeof r.type === "string" && CATALOG.items[r.type as string] && !CATALOG.items[r.type as string].hidden)
    .filter(r => [r.x, r.z, r.ry, r.level].every(v => typeof v === "number" && Number.isFinite(v)))
    .map(r => ({
      id: typeof r.id === "string" ? r.id : newFurnitureId(),
      type: r.type as string,
      level: r.level as number,
      x: r.x as number,
      z: r.z as number,
      ry: r.ry as number,
      ...(typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? { color: r.color } : {}),
      ...(r.fixed === true ? { fixed: true } : {}),
    }))
}

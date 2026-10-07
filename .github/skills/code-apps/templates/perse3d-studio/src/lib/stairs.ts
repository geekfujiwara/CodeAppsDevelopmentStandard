import type { BuildingSpec, FloorSpec, Rect, Side } from "./building-spec"

/**
 * 階段（直階段・かね折れ階段）と上階床の開口。
 * spec には配置（外形・上り方向・形状）だけを持ち、段の寸法は stairLayout() で導く。
 * Blender 側（blender/geometry.py の stair_layout）も同じ式で段を作る。式を変えたら両方を直す。
 */

/** straight = 直階段、L = かね折れ（踊り場）、winder = 回り階段（上り口の正方形で横から入って 90° 回る → 直進） */
export type StairShape = "straight" | "L" | "winder"
export type StairSpec = {
  /** 下の階（この階の床から 1 つ上の階の床まで上る） */
  fromLevel: number
  /** 外形（上階の床開口もこの矩形） */
  x: number
  z: number
  w: number
  d: number
  /** 上り始めの方向（例: "-z" は奥へ向かって上る） */
  up: Side
  shape: StairShape
  /** かね折れの曲がる向き（上りながら見て左右） */
  turn?: "left" | "right"
  /** 蹴上げの段数（省略時は MAX_RISER から決める）。狭い家でコンパクトな階段（蹴上げ ≤ 0.23）にするときに持つ */
  risers?: number
  /** winder: 上り口に横から入る側（up と直交する向き） */
  entry?: Side
  /** 上の階の床の開口（省略時は外形と同じ）。図面の記号から作った階段は、上の階に描かれた範囲だけを開け、その手前（下の段の上）は上の階の床を残す */
  opening?: Rect
}

/** 上の階の床に開ける範囲 */
export function openingOf(s: StairSpec): Rect {
  return s.opening ?? { x: s.x, z: s.z, w: s.w, d: s.d }
}

/** 回り階段の上り口の正方形に入れる段数 */
export const WINDERS = 3

export type StairStep = { x0: number; z0: number; x1: number; z1: number; /** 段の上面（下階の床からの高さ） */ top: number; /** 段鼻の向き（下りる方向） */ down: Side }
export type StairLayout = {
  stair: StairSpec
  rise: number
  riser: number
  steps: StairStep[]
  /** 上り口（下階で空けておく範囲） */
  approach: Rect
  /** 上がり口（上階で空けておく範囲） */
  exit: Rect
  /** 上階の開口まわりの手すり壁（上がり口を除く周囲） */
  guards: Rect[]
  /** いちばん浅い踏面（m）。自動配置で 0.195 未満は採らない */
  minTread: number
  /** 手すり（外側の辺に沿う折れ線。y は下の階の床から） */
  rail: [number, number, number][]
}

export const RAIL_H = 0.8
const RAIL_IN = 0.05

export const STAIR_WIDTH = 0.85
export const TREAD = 0.225
export const MAX_RISER = 0.21
/** 狭小住宅の階段（建築基準法の住宅の階段: 幅 75cm 以上・蹴上げ 23cm 以下・踏面 15cm 以上。歩きやすさのため踏面は 20cm 以上にする） */
export const COMPACT = { width: 0.78, maxRiser: 0.23, tread: 0.21, minTread: 0.2 } as const
const GUARD_T = 0.1

const r3 = (v: number) => Math.round(v * 1000) / 1000
const OPP: Record<Side, Side> = { "+x": "-x", "-x": "+x", "+z": "-z", "-z": "+z" }

/** 上り方向に対して左右の向き */
function sideOf(up: Side, turn: "left" | "right"): Side {
  // 上り方向 → 左手の向き（y 上向き、カメラの前方 = up）
  const left: Record<Side, Side> = { "-z": "-x", "+z": "+x", "+x": "-z", "-x": "+z" }
  return turn === "left" ? left[up] : OPP[left[up]]
}

export function riserCount(rise: number) {
  return Math.max(2, Math.ceil(rise / MAX_RISER - 1e-6))
}

/** 直階段の上り方向の長さ（最後の 1 段は上階の床） */
export function straightRun(rise: number) {
  return r3((riserCount(rise) - 1) * TREAD)
}

type Frame = { o: [number, number]; u: [number, number]; v: [number, number] }

/** 局所座標（a: 上り方向, b: 横方向）→ ワールド矩形 */
function rectFrom(f: Frame, a0: number, a1: number, b0: number, b1: number) {
  const pts = [
    [a0, b0],
    [a1, b1],
  ].map(([a, b]) => [f.o[0] + f.u[0] * a + f.v[0] * b, f.o[1] + f.u[1] * a + f.v[1] * b])
  return { x0: r3(Math.min(pts[0][0], pts[1][0])), x1: r3(Math.max(pts[0][0], pts[1][0])), z0: r3(Math.min(pts[0][1], pts[1][1])), z1: r3(Math.max(pts[0][1], pts[1][1])) }
}

const VEC: Record<Side, [number, number]> = { "+x": [1, 0], "-x": [-1, 0], "+z": [0, 1], "-z": [0, -1] }

/** 外形の上り口側の角を原点に、上り方向 u・横方向 v（+）の局所座標を作る */
function frameOf(s: StairSpec, vSide: Side): Frame {
  const u = VEC[s.up]
  const v = VEC[vSide]
  const ox = u[0] < 0 || v[0] < 0 ? s.x + s.w : s.x
  const oz = u[1] < 0 || v[1] < 0 ? s.z + s.d : s.z
  return { o: [ox, oz], u, v }
}

const pt = (f: Frame, a: number, b: number, y: number): [number, number, number] => [r3(f.o[0] + f.u[0] * a + f.v[0] * b), r3(y), r3(f.o[1] + f.u[1] * a + f.v[1] * b)]

const toRect = (b: { x0: number; z0: number; x1: number; z1: number }): Rect => ({ x: b.x0, z: b.z0, w: r3(b.x1 - b.x0), d: r3(b.z1 - b.z0) })

export function stairLayout(spec: BuildingSpec, s: StairSpec): StairLayout {
  const lower = spec.floors.find(f => f.level === s.fromLevel)
  const rise = lower?.height ?? spec.wallHeightDefault
  const n = s.risers && s.risers >= 2 ? Math.round(s.risers) : riserCount(rise)
  const riser = rise / n
  const alongX = s.up === "+x" || s.up === "-x"
  const len = alongX ? s.w : s.d
  const span = alongX ? s.d : s.w
  const steps: StairStep[] = []
  let approach: Rect
  let exit: Rect
  let guards: Rect[]
  let minTread: number
  let rail: [number, number, number][]
  const turnSide = s.shape === "L" ? sideOf(s.up, s.turn ?? "right") : sideOf(s.up, "right")
  if (s.shape === "straight") {
    const f = frameOf(s, turnSide)
    const t = len / (n - 1)
    for (let i = 0; i < n - 1; i++) steps.push({ ...rectFrom(f, i * t, (i + 1) * t, 0, span), top: r3((i + 1) * riser), down: OPP[s.up] })
    rail = [pt(f, 0, RAIL_IN, riser + RAIL_H), pt(f, len, RAIL_IN, rise + RAIL_H)]
    approach = toRect(rectFrom(f, -0.9, 0, 0, span))
    exit = toRect(rectFrom(f, len, len + 0.75, 0, span))
    guards = guardsOf(s, s.up)
    minTread = t
  } else if (s.shape === "winder") {
    // 回り階段: 上り口の正方形（幅 × 幅）に横（entry）から入り、WINDERS 段で奥へ上ってから up 方向へ直進する。
    // 正方形の段は entry 側から帯状に並べる（扇形の段の近似。歩行の高さと当たり判定が合えばよい）
    const entry = s.entry && s.entry !== s.up && s.entry !== OPP[s.up] ? s.entry : turnSide
    const f = frameOf(s, entry)
    const sq = Math.min(span, len * 0.5)
    // 回り段は 3 段。直進部の踏面が 15cm に届かなければ 4 段まで増やす
    const k = Math.min(n - 2, (len - sq) / (n - 1 - WINDERS) < 0.15 ? WINDERS + 1 : WINDERS)
    // 最後（奥）の回り段は向きを変える場所なので 0.35m 以上にする（人の幅。等分だと 4 段のとき 0.2m で立てない）。残りを等分
    const last = Math.max(span / k, Math.min(0.35, span * 0.45))
    const each = (span - last) / Math.max(1, k - 1)
    const edge = (i: number) => (i >= k ? 0 : span - i * each)
    for (let i = 0; i < k; i++) steps.push({ ...rectFrom(f, 0, sq, i === k - 1 ? 0 : edge(i + 1), edge(i)), top: r3((i + 1) * riser), down: entry })
    const m = n - 1 - k
    const t = (len - sq) / m
    for (let j = 0; j < m; j++) steps.push({ ...rectFrom(f, sq + j * t, sq + (j + 1) * t, 0, span), top: r3((k + 1 + j) * riser), down: OPP[s.up] })
    rail = [pt(f, 0, RAIL_IN, k * riser + RAIL_H), pt(f, len, RAIL_IN, rise + RAIL_H)]
    approach = toRect(rectFrom(f, 0, sq, span, span + 0.9))
    exit = toRect(rectFrom(f, len, len + 0.75, 0, span))
    guards = guardsOf(s, s.up)
    minTread = t
  } else {
    // かね折れ: 1 本目（上り方向）→ 踊り場（正方形）→ 2 本目（turn 側へ）。幅は span の残りではなく STAIR_WIDTH
    const f = frameOf(s, turnSide)
    const wd = Math.min(STAIR_WIDTH, len / 2, span / 2)
    const run1 = len - wd
    const run2 = span - wd
    // 段数を 1 本目と 2 本目の長さに比例して配る（踊り場で 1 段使う。最後の 1 段は上階の床）
    const treads = n - 2
    let n1 = Math.round((treads * run1) / (run1 + run2))
    n1 = Math.max(1, Math.min(treads - 1, n1))
    const n2 = treads - n1
    const t1 = run1 / n1
    const t2 = run2 / n2
    for (let i = 0; i < n1; i++) steps.push({ ...rectFrom(f, i * t1, (i + 1) * t1, 0, wd), top: r3((i + 1) * riser), down: OPP[s.up] })
    steps.push({ ...rectFrom(f, run1, len, 0, wd), top: r3((n1 + 1) * riser), down: OPP[s.up] })
    for (let i = 0; i < n2; i++) steps.push({ ...rectFrom(f, run1, len, wd + i * t2, wd + (i + 1) * t2), top: r3((n1 + 2 + i) * riser), down: OPP[turnSide] })
    const yl = (n1 + 1) * riser + RAIL_H
    rail = [pt(f, 0, RAIL_IN, riser + RAIL_H), pt(f, run1, RAIL_IN, yl), pt(f, len - RAIL_IN, RAIL_IN, yl), pt(f, len - RAIL_IN, wd, yl), pt(f, len - RAIL_IN, span, rise + RAIL_H)]
    approach = toRect(rectFrom(f, -0.9, 0, 0, wd))
    exit = toRect(rectFrom(f, run1, len, span, span + 0.75))
    // 上がり口の辺のうち、1 本目の上（吹き抜け側）には手すり壁を残す
    guards = [...guardsOf(s, turnSide), toRect(rectFrom(f, -GUARD_T, run1, span, span + GUARD_T))]
    minTread = Math.min(t1, t2)
  }
  return { stair: s, rise, riser, steps, approach, exit, guards, minTread: r3(minTread), rail }
}

/** 開口の 3 辺に手すり壁（開口の外側に GUARD_T の厚み）。上がり口の辺には付けない */
function guardsOf(s: StairSpec, exitSide: Side): Rect[] {
  const o = openingOf(s)
  const x0 = o.x
  const x1 = o.x + o.w
  const z0 = o.z
  const z1 = o.z + o.d
  const t = GUARD_T
  const all: Record<Side, Rect> = {
    "-z": { x: r3(x0 - t), z: r3(z0 - t), w: r3(o.w + 2 * t), d: t },
    "+z": { x: r3(x0 - t), z: z1, w: r3(o.w + 2 * t), d: t },
    "-x": { x: r3(x0 - t), z: z0, w: t, d: o.d },
    "+x": { x: x1, z: z0, w: t, d: o.d },
  }
  return (Object.keys(all) as Side[]).filter(k => k !== exitSide).map(k => all[k])
}

export function stairsOf(spec: BuildingSpec): StairSpec[] {
  return spec.stairs ?? []
}

/** 開口を除いた床スラブ（上の階ほど、下から上がってくる階段の外形を抜く） */
export function slabsWithOpenings(spec: BuildingSpec, floor: FloorSpec): Rect[] {
  const holes = stairsOf(spec).filter(s => s.fromLevel === floor.level - 1)
  let rects: Rect[] = floor.slabs
  for (const h of holes) rects = rects.flatMap(r => subtractRect(r, openingOf(h)))
  return rects
}

/** r から h を引いた残り（最大 4 つの矩形） */
export function subtractRect(r: Rect, h: Rect): Rect[] {
  const ax0 = r.x
  const ax1 = r.x + r.w
  const az0 = r.z
  const az1 = r.z + r.d
  const bx0 = Math.max(ax0, h.x)
  const bx1 = Math.min(ax1, h.x + h.w)
  const bz0 = Math.max(az0, h.z)
  const bz1 = Math.min(az1, h.z + h.d)
  if (bx1 - bx0 < 1e-6 || bz1 - bz0 < 1e-6) return [r]
  const out: Rect[] = []
  const push = (x0: number, z0: number, x1: number, z1: number) => {
    if (x1 - x0 > 1e-6 && z1 - z0 > 1e-6) out.push({ x: r3(x0), z: r3(z0), w: r3(x1 - x0), d: r3(z1 - z0) })
  }
  push(ax0, az0, ax1, bz0)
  push(ax0, bz1, ax1, az1)
  push(ax0, bz0, bx0, bz1)
  push(bx1, bz0, ax1, bz1)
  return out
}

/** (x, z) に階段の段があれば、その段（下の階の床からの高さ付き） */
export function stepAt(layouts: StairLayout[], x: number, z: number): { layout: StairLayout; step: StairStep } | null {
  for (const layout of layouts) {
    const s = layout.stair
    if (x < s.x || x > s.x + s.w || z < s.z || z > s.z + s.d) continue
    for (const step of layout.steps) if (x >= step.x0 && x <= step.x1 && z >= step.z0 && z <= step.z1) return { layout, step }
  }
  return null
}

// ── 内見（歩行）の足元 ─────────────────────────────────

/** 階段の上り下りで越えられる段差（m）。これより高い段には横から乗れない */
export const MAX_STEP = 0.35

export type Surface = { y: number; level: number; stair: boolean }

const baseOf = (spec: BuildingSpec, level: number) => spec.floors.filter(f => f.level < level).reduce((s, f) => s + f.height, 0)

/**
 * 足元の高さ（ワールド y。fl = 基礎の立ち上がり）と、その位置の階。
 * 段の上なら段の高さ（段の上面が階高の半分を超えたら上の階）。上の階の吹き抜け（開口）は null。
 */
/**
 * 吹き抜けの手すり壁にぶつかるか。段の上を上り下りしているあいだ（climbing）は、開口の縁の手すり壁は頭上にあるので
 * ぶつけない（上り切る手前で上の階に切り替わった直後に、開口の縁で止まってしまうのを防ぐ）
 */
export function guardBlocks(layouts: StairLayout[], x: number, z: number, level: number, radius: number, climbing = false): boolean {
  if (climbing) return false
  for (const lay of layouts) {
    if (lay.stair.fromLevel !== level - 1) continue
    for (const g of lay.guards) {
      const cx = Math.max(g.x, Math.min(x, g.x + g.w))
      const cz = Math.max(g.z, Math.min(z, g.z + g.d))
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true
    }
  }
  return false
}

export function walkSurface(spec: BuildingSpec, layouts: StairLayout[], x: number, z: number, level: number, fl: number): Surface | null {
  const hit = stepAt(layouts, x, z)
  if (hit) {
    const from = hit.layout.stair.fromLevel
    const o = openingOf(hit.layout.stair)
    const inOpening = x >= o.x && x <= o.x + o.w && z >= o.z && z <= o.z + o.d
    // 上の階から見て開口の外（上の階の床の下にある段）は、上の階の床を歩く
    if (from === level || (from === level - 1 && inOpening)) {
      return { y: baseOf(spec, from) + fl + hit.step.top, level: inOpening && hit.step.top > hit.layout.rise / 2 ? from + 1 : from, stair: true }
    }
  }
  const floor = spec.floors.find(f => f.level === level)
  if (!floor) return null
  const e = level > 0 ? 0 : 0.1
  const on = slabsWithOpenings(spec, floor).some(s => x >= s.x - e && x <= s.x + s.w + e && z >= s.z - e && z <= s.z + s.d + e)
  if (level > 0) return on ? { y: baseOf(spec, level) + fl, level, stair: false } : null
  return { y: on ? fl : 0, level: 0, stair: false }
}

/** 今の足元から次の足元へ移れるか（階段に関わる移動だけ段差を制限する。玄関ポーチの段差は従来どおり） */
export function canStep(cur: Surface | null, next: Surface | null): boolean {
  if (!next) return false
  if (cur && (cur.stair || next.stair) && Math.abs(next.y - cur.y) > MAX_STEP) return false
  return true
}

// ── 自動配置 ───────────────────────────────────────────

type Box = { x0: number; z0: number; x1: number; z1: number }
const boxOf = (r: Rect): Box => ({ x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z + r.d })
const hit = (a: Box, b: Box, eps = 0.005) => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps

/** ドアの前後 0.8m・掃き出し窓の前 0.75m（階段で塞がない範囲） */
function doorZones(floor: FloorSpec, glassdoors: boolean, depth = 0.8): Box[] {
  return floor.walls
    .filter(w => w.kind === "door" || (glassdoors && w.kind === "glassdoor"))
    .map(w => {
      const m = w.kind === "door" ? depth : Math.min(depth, 0.75)
      return w.w >= w.d ? { x0: w.x, x1: w.x + w.w, z0: w.z - m, z1: w.z + w.d + m } : { x0: w.x - m, x1: w.x + w.w + m, z0: w.z, z1: w.z + w.d }
    })
}

function nearestRoom(floor: FloorSpec, x: number, z: number) {
  let best: { name: string; d: number } | null = null
  for (const r of floor.rooms) {
    const d = Math.hypot(r.x - x, r.z - z)
    if (!best || d < best.d) best = { name: r.name, d }
  }
  return best?.name ?? ""
}

/** 壁から 0.22m 以内の格子（壁ごとに塗る。階ごとに 1 回だけ作る。候補ごとに全格子 × 全壁を調べると数十秒かかった） */
const wallGrids = new WeakMap<FloorSpec, { key: string; grid: Uint8Array }>()
function wallGrid(floor: FloorSpec, nx: number, nz: number, g: number): Uint8Array {
  const key = `${nx}:${nz}:${g}:${floor.walls.length}`
  const cached = wallGrids.get(floor)
  if (cached && cached.key === key) return cached.grid
  const R = 0.22
  const grid = new Uint8Array(nx * nz)
  for (const w of floor.walls) {
    if (w.kind === "door") continue
    // セル中心から 0.22m の正方形が壁に（境界を除いて）重なるセル
    const i0 = Math.max(0, Math.floor((w.x - R) / g - 0.5) + 1)
    const i1 = Math.min(nx - 1, Math.ceil((w.x + w.w + R) / g - 0.5) - 1)
    const k0 = Math.max(0, Math.floor((w.z - R) / g - 0.5) + 1)
    const k1 = Math.min(nz - 1, Math.ceil((w.z + w.d + R) / g - 0.5) - 1)
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) grid[i * nz + k] = 1
  }
  wallGrids.set(floor, { key, grid })
  return grid
}

/** 歩ける格子（0.1m、壁から 0.22m 空ける。ドアは通れる）で start から到達できる点の判定器 */
function reachability(spec: BuildingSpec, floor: FloorSpec, blocked: Box[], start: [number, number], onSlab: (x: number, z: number) => boolean) {
  const g = 0.1
  const W = spec.footprint.width
  const D = spec.footprint.depth
  const nx = Math.ceil(W / g)
  const nz = Math.ceil(D / g)
  const nearWall = wallGrid(floor, nx, nz, g)
  const free = new Uint8Array(nx * nz)
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      if (nearWall[i * nz + k]) continue
      const x = (i + 0.5) * g
      const z = (k + 0.5) * g
      if (!onSlab(x, z)) continue
      if (blocked.some(b => hit(b, { x0: x, x1: x, z0: z, z1: z }, -1e-6))) continue
      free[i * nz + k] = 1
    }
  }
  const seen = new Uint8Array(nx * nz)
  const cell = (x: number, z: number): number => {
    const i = Math.floor(x / g)
    const k = Math.floor(z / g)
    return i >= 0 && i < nx && k >= 0 && k < nz ? i * nz + k : -1
  }
  // 開始点が壁の近くなら、近くの空き格子から始める
  let s0 = -1
  for (let r = 0; r <= 6 && s0 < 0; r++) {
    for (let di = -r; di <= r && s0 < 0; di++) {
      for (let dk = -r; dk <= r && s0 < 0; dk++) {
        const c = cell(start[0] + di * g, start[1] + dk * g)
        if (c >= 0 && free[c]) s0 = c
      }
    }
  }
  if (s0 >= 0) {
    const q = [s0]
    seen[s0] = 1
    while (q.length) {
      const c = q.pop()!
      const i = Math.floor(c / nz)
      const k = c % nz
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di
        const kk = k + dk
        if (ii < 0 || ii >= nx || kk < 0 || kk >= nz) continue
        const n = ii * nz + kk
        if (free[n] && !seen[n]) {
          seen[n] = 1
          q.push(n)
        }
      }
    }
  }
  return (x: number, z: number) => {
    for (let r = 0; r <= 6; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dk = -r; dk <= r; dk++) {
          const c = cell(x + di * g, z + dk * g)
          if (c >= 0 && seen[c]) return true
        }
      }
    }
    return false
  }
}

export type StairCandidate = { stair: StairSpec; score: number; reasons: string[] }

/**
 * 下の階と上の階の間取りから、階段を置ける場所を探す。
 * 条件: 外形・上り口・上がり口が壁と重ならない／ドア前を塞がない／外形の中心が部屋ラベルを潰さない／
 *       置いた後も両階のすべての部屋へ歩いて行ける。
 * 評価: ホール・廊下に近い、片側か両側が壁に沿う、直階段を優先。
 */
export function findStairPlacement(spec: BuildingSpec, fromLevel: number, existing: StairSpec[] = stairsOf(spec)): StairCandidate | null {
  // 標準（幅 0.85・蹴上げ ≤ 0.21・踏面 0.225）で置けなければ、狭小住宅向けのコンパクトな直階段で探す
  return placeWith(spec, fromLevel, existing, "standard") ?? placeWith(spec, fromLevel, existing, "compact")
}

/** 置けなかった理由の内訳（候補が各条件で何件落ちたか）。UI と検証で使う */
export type StairRejects = Record<"outside" | "wall" | "door" | "taken" | "tread" | "approachExit" | "approachExitWall" | "unreachable", number>

export function explainStairPlacement(spec: BuildingSpec, fromLevel: number, profile: "standard" | "compact" = "compact"): StairRejects {
  const rejects: StairRejects = { outside: 0, wall: 0, door: 0, taken: 0, tread: 0, approachExit: 0, approachExitWall: 0, unreachable: 0 }
  placeWith(spec, fromLevel, stairsOf(spec), profile, rejects)
  return rejects
}

function placeWith(spec: BuildingSpec, fromLevel: number, existing: StairSpec[], profile: "standard" | "compact", rejects?: StairRejects, relax = false): StairCandidate | null {
  const no = (k: keyof StairRejects) => {
    if (rejects) rejects[k]++
  }
  const lower = spec.floors.find(f => f.level === fromLevel)
  const upper = spec.floors.find(f => f.level === fromLevel + 1)
  if (!lower || !upper) return null
  const W = spec.footprint.width
  const D = spec.footprint.depth
  const compact = profile === "compact"
  const risers = compact ? Math.max(2, Math.ceil(lower.height / COMPACT.maxRiser - 1e-6)) : undefined
  const run = compact ? r3((risers! - 1) * COMPACT.tread) : straightRun(lower.height)
  const width = compact ? COMPACT.width : STAIR_WIDTH
  const minTread = compact ? COMPACT.minTread : 0.195
  // relax: 外壁だけを避ける（中の壁は階段に重なれば外す前提。図面の線の残り・解析しきれない間仕切りで置き場が無いとき）
  const lowWalls = lower.walls.filter(w => !relax || w.outside?.length).map(boxOf)
  const upWalls = upper.walls.filter(w => !relax || w.outside?.length).map(boxOf)
  const interior = relax ? [...lower.walls, ...upper.walls].filter(w => !w.outside?.length).map(boxOf) : []
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0))
  // ドアの前の空き: 標準 0.8m、狭小住宅は 0.5m（扉の幅ぶん。引き戸・内開きの最小）
  const doors = [...doorZones(lower, true, compact ? 0.5 : 0.8), ...doorZones(upper, false, compact ? 0.5 : 0.8)]
  // 下の階の吹き抜け（さらに下からの階段の開口）と、上の階から上る階段の外形には置かない
  const taken = existing.filter(e => e.fromLevel === fromLevel - 1 || e.fromLevel === fromLevel + 1).map(e => boxOf(e))
  const inner: Box = { x0: 0.15, z0: 0.15, x1: W - 0.15, z1: D - 0.15 }
  const inside = (b: Box) => b.x0 >= inner.x0 - 1e-6 && b.z0 >= inner.z0 - 1e-6 && b.x1 <= inner.x1 + 1e-6 && b.z1 <= inner.z1 + 1e-6
  // 階ごとに外形が違う（2 階が張り出す・1 階に車庫）ので、外接矩形の中でも床が無い所がある。四隅と中心が床の上にあるか
  const onFloor = (f: FloorSpec, b: Box) => {
    const pts: [number, number][] = [[b.x0 + 0.02, b.z0 + 0.02], [b.x1 - 0.02, b.z0 + 0.02], [b.x0 + 0.02, b.z1 - 0.02], [b.x1 - 0.02, b.z1 - 0.02], [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]]
    return pts.every(([x, z]) => f.slabs.some(r => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d))
  }

  // 候補の座標: 壁の面に沿う位置 + 0.3m 格子
  const xs = new Set<number>()
  const zs = new Set<number>()
  for (const w of [...lower.walls, ...upper.walls]) {
    xs.add(r3(w.x + w.w))
    xs.add(r3(w.x))
    zs.add(r3(w.z + w.d))
    zs.add(r3(w.z))
  }
  for (let v = 0.15; v < W; v += 0.3) xs.add(r3(v))
  for (let v = 0.15; v < D; v += 0.3) zs.add(r3(v))

  const shapes: { shape: StairShape; w: number; d: number; turn?: "left" | "right" }[] = [
    { shape: "straight", w: width, d: run },
    { shape: "straight", w: run, d: width },
  ]
  // かね折れ: 外形はおおむね 1.8m × 2.7m（910 モジュールの 2 × 3 マス）
  if (!compact) for (const [w, d] of [[1.82, 2.73], [2.73, 1.82], [1.82, 1.82]]) for (const turn of ["left", "right"] as const) shapes.push({ shape: "L", w, d, turn })

  const cands: StairCandidate[] = []
  for (const sh of shapes) {
    const ups: Side[] = sh.shape === "straight" ? (sh.w < sh.d ? ["-z", "+z"] : ["-x", "+x"]) : ["-z", "+z", "-x", "+x"]
    const xList = [...xs].flatMap(x => [x, r3(x - sh.w)])
    const zList = [...zs].flatMap(z => [z, r3(z - sh.d)])
    for (const x of xList) {
      for (const z of zList) {
        const fp: Box = { x0: x, z0: z, x1: x + sh.w, z1: z + sh.d }
        if (!inside(fp) || !onFloor(lower, fp) || !onFloor(upper, fp)) { no("outside"); continue }
        if (lowWalls.some(w => hit(w, fp)) || upWalls.some(w => hit(w, fp))) { no("wall"); continue }
        if (!relax && doors.some(d => hit(d, fp))) { no("door"); continue }
        if (taken.some(t => hit(t, fp))) { no("taken"); continue }
        for (const up of ups) {
          const stair: StairSpec = { fromLevel, x: r3(x), z: r3(z), w: r3(sh.w), d: r3(sh.d), up, shape: sh.shape, ...(sh.turn ? { turn: sh.turn } : {}), ...(risers ? { risers } : {}) }
          const lay = stairLayout(spec, stair)
          const ap = boxOf(lay.approach)
          const ex = boxOf(lay.exit)
          if (lay.minTread < minTread) { no("tread"); continue }
          if (!inside(ap) || !inside(ex) || !onFloor(lower, ap) || !onFloor(upper, ex)) { no("approachExit"); continue }
          if (lowWalls.some(w => hit(w, ap)) || upWalls.some(w => hit(w, ex))) { no("approachExitWall"); continue }
          const reasons: string[] = []
          let score = sh.shape === "straight" ? 1 : 0
          if (compact) reasons.push(`狭小住宅向け（幅 ${width}m・蹴上げ ${r3(lay.riser)}m・踏面 ${lay.minTread}m）`)
          const lowRoom = nearestRoom(lower, (ap.x0 + ap.x1) / 2, (ap.z0 + ap.z1) / 2)
          const upRoom = nearestRoom(upper, (ex.x0 + ex.x1) / 2, (ex.z0 + ex.z1) / 2)
          if (/ホール|玄関|廊下|階段/.test(lowRoom)) {
            score += 3
            reasons.push(`上り口: ${lowRoom}`)
          } else if (/LDK|リビング|LD/.test(lowRoom)) {
            score += 1
            reasons.push(`リビング階段（${lowRoom}）`)
          }
          if (/水回り|浴|洗面|トイレ|WC|UB/.test(lowRoom)) score -= 5
          if (/廊下|ホール|階段/.test(upRoom)) {
            score += 3
            reasons.push(`上がり口: ${upRoom}`)
          } else score -= 2
          // 壁沿い（段の側面が壁に付いている）
          const along = (walls: Box[]) => {
            let n = 0
            for (const side of [0, 1]) {
              const probe = sh.w < sh.d || sh.shape === "L"
                ? { x0: side ? fp.x1 : fp.x0 - 0.05, x1: side ? fp.x1 + 0.05 : fp.x0, z0: fp.z0 + 0.1, z1: fp.z1 - 0.1 }
                : { x0: fp.x0 + 0.1, x1: fp.x1 - 0.1, z0: side ? fp.z1 : fp.z0 - 0.05, z1: side ? fp.z1 + 0.05 : fp.z0 }
              if (walls.some(w => hit(w, probe, 0))) n++
            }
            return n
          }
          const a = along(lowWalls)
          score += a * 1.5
          if (a) reasons.push(`壁沿い ${a} 面`)
          // 上の階の部屋ラベルを潰すと減点（開口に部屋の中心が入る）
          if (upper.rooms.some(r => r.x > fp.x0 && r.x < fp.x1 && r.z > fp.z0 && r.z < fp.z1)) score -= 4
          if (lower.rooms.some(r => r.x > fp.x0 && r.x < fp.x1 && r.z > fp.z0 && r.z < fp.z1)) score -= 2
          // relax: 外す中の壁が少ないほど良い（1m² あたり -10）
          if (relax) score -= 10 * interior.reduce((a, w) => a + overlap(w, fp) + overlap(w, ap) + overlap(w, ex), 0)
          cands.push({ stair, score, reasons })
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score)
  if (relax) return cands[0] ?? null
  // 上位から順に、置いた後も全部屋へ歩けるかを確かめる
  const seen = new Set<string>()
  for (const c of cands) {
    const key = JSON.stringify(c.stair)
    if (seen.has(key)) continue
    seen.add(key)
    // 到達判定は重い（格子の塗りつぶし）。上位 40 件で決まらなければ諦める（最後の手段は forceStair）
    if (seen.size > 40) break
    if (connected(spec, c.stair)) return c
    no("unreachable")
  }
  return null
}

function connected(spec: BuildingSpec, s: StairSpec): boolean {
  const lay = stairLayout(spec, s)
  const lower = spec.floors.find(f => f.level === s.fromLevel)!
  const upper = spec.floors.find(f => f.level === s.fromLevel + 1)!
  const fp = boxOf({ x: s.x, z: s.z, w: s.w, d: s.d })
  const W = spec.footprint.width
  const D = spec.footprint.depth
  const inBuilding = (x: number, z: number) => x > 0 && x < W && z > 0 && z < D
  const ap = boxOf(lay.approach)
  const ex = boxOf(lay.exit)
  const lowReach = reachability(spec, lower, [fp], [(ap.x0 + ap.x1) / 2, (ap.z0 + ap.z1) / 2], inBuilding)
  if (!lower.rooms.every(r => lowReach(r.x, r.z) || inBox(fp, r.x, r.z))) return false
  const upReach = reachability(spec, upper, [fp, ...lay.guards.map(boxOf)], [(ex.x0 + ex.x1) / 2, (ex.z0 + ex.z1) / 2], inBuilding)
  return upper.rooms.every(r => upReach(r.x, r.z) || inBox(fp, r.x, r.z))
}

const inBox = (b: Box, x: number, z: number) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1

/**
 * どこにも置けないときの最後の手段: 外壁だけを避けて狭小住宅向けの直階段を置き、重なる中の壁（階段・上り口・上がり口）を両方の階から外す。
 * 2 階建てなのに階段が無いと内見で 2 階へ行けないので、図面と多少違っても上り下りできる方を選ぶ。floors を書き換える
 */
export function forceStair(spec: BuildingSpec, fromLevel: number, existing: StairSpec[]): StairSpec | null {
  const c = placeWith(spec, fromLevel, existing, "compact", undefined, true)
  if (!c) return null
  const lay = stairLayout(spec, c.stair)
  const zones = [boxOf(c.stair), boxOf(lay.approach), boxOf(lay.exit)]
  for (const f of spec.floors) {
    if (f.level !== fromLevel && f.level !== fromLevel + 1) continue
    f.walls = f.walls.filter(w => w.outside?.length || !zones.some(z => hit(boxOf(w), z, 0.01)))
  }
  return { ...c.stair, forced: true } as StairSpec
}

/** 階段が無い 2 階建て以上の spec に、各階の階段を自動で置く（置けない階は飛ばす） */
export function withAutoStairs(spec: BuildingSpec): BuildingSpec {
  if (spec.stairs || spec.floors.length < 2) return spec
  const next = { ...spec, stairs: autoStairs(spec, []) }
  // 既存の家具が新しい階段の上に乗っていたら外す（中心点で判定。寸法はカタログが要るためここでは見ない）
  if (next.furniture) {
    next.furniture = next.furniture.filter(it => !stairKeepouts(next, it.level).some(b => it.x > b.x0 - 0.2 && it.x < b.x1 + 0.2 && it.z > b.z0 - 0.2 && it.z < b.z1 + 0.2))
  }
  return next
}

/** fixed に無い階の階段を自動で探して足す */
export function autoStairs(spec: BuildingSpec, fixed: StairSpec[]): StairSpec[] {
  const stairs = [...fixed]
  for (const f of spec.floors.slice(0, -1)) {
    if (stairs.some(s => s.fromLevel === f.level)) continue
    const c = findStairPlacement(spec, f.level, stairs)
    if (c) stairs.push(c.stair)
  }
  return stairs.sort((a, b) => a.fromLevel - b.fromLevel)
}

/** 間取り図の階段記号（floorplan-analyzer の StairHint と同じ形） */
export type StairSymbol = Rect & { axis: "x" | "z"; strong?: boolean }

/** 図面から決めた階段の最小の踏面（建築基準法の住宅の階段: 15cm 以上）と最大の蹴上げ（23cm 以下） */
const PLAN_MIN_TREAD = 0.15
const PLAN_MAX_RISER = 0.23

/**
 * 間取り図の階段記号から階段を作る。上の階の記号は「階段の上の方（開口）」が描かれているので、
 * 記号を階段の上端側として、記号の外へ下の方を伸ばす（両方の階で壁に当たらない向き・長さ）。
 * 記号の中に壁として拾われた段の線は、上の階から取り除く（floors を書き換える）。
 * 置けなければ null（読み込み時の自動配置に任せる）
 */
export function stairFromHints(lower: FloorSpec, upper: FloorSpec, hints: StairSymbol[], opts: { throughFloor?: boolean } = {}): StairSpec | null {
  const sym = [...hints].filter(h => h.strong !== false).sort((a, b) => b.w * b.d - a.w * a.d)[0]
  if (!sym) return null
  const along = sym.axis
  const rise = lower.height
  const n = Math.max(2, Math.ceil(rise / PLAN_MAX_RISER - 1e-6))
  const minLen = (n - 1) * PLAN_MIN_TREAD
  const goodLen = (n - 1) * 0.21
  // 記号の範囲にあり、記号の幅の半分以上を横切る薄い（0.2m 以下）「壁」は段の線。
  // 外壁の切れ端は上り下りの向きに細長いので当たらない（画像の再圧縮で線の端が外壁に付いても判定が変わらない）
  const inSym = (w: Rect) => w.x >= sym.x - 0.08 && w.z >= sym.z - 0.08 && w.x + w.w <= sym.x + sym.w + 0.08 && w.z + w.d <= sym.z + sym.d + 0.08
  const symWidth = along === "z" ? sym.w : sym.d
  const isTread = (w: WallRectLike) => {
    if (w.kind !== "wall" || !inSym(w)) return false
    const across = along === "z" ? w.w : w.d
    const thick = along === "z" ? w.d : w.w
    return across >= symWidth * 0.5 && thick <= 0.2
  }
  // 文字・記号の残りの小さな塊（長辺 0.3m 以下・短辺 0.12m 以下）は通り道をふさぐ壁とみなさない
  const tiny = (w: WallRectLike) => w.kind === "wall" && Math.max(w.w, w.d) <= 0.3 && Math.min(w.w, w.d) <= 0.12
  const lowWalls = lower.walls.filter(w => w.kind !== "door" && !isTread(w) && !tiny(w))
  const upWalls = upper.walls.filter(w => w.kind !== "door" && !isTread(w) && !tiny(w))
  // 幅: 記号の幅から、記号の中を走る側壁（上り下りの向きに長い壁）を避ける
  let c0 = along === "z" ? sym.x : sym.z
  let c1 = along === "z" ? sym.x + sym.w : sym.z + sym.d
  const a0s = along === "z" ? sym.z : sym.x
  const a1s = along === "z" ? sym.z + sym.d : sym.x + sym.w
  for (const w of [...lowWalls, ...upWalls]) {
    const wc0 = along === "z" ? w.x : w.z
    const wc1 = along === "z" ? w.x + w.w : w.z + w.d
    const wa0 = along === "z" ? w.z : w.x
    const wa1 = along === "z" ? w.z + w.d : w.x + w.w
    if (wa1 - wa0 < 0.3 || wc1 <= c0 || wc0 >= c1 || Math.min(wa1, a1s + 1) - Math.max(wa0, a0s - 1) < 0.2) continue
    if ((wc0 + wc1) / 2 > (c0 + c1) / 2) c1 = Math.min(c1, wc0)
    else c0 = Math.max(c0, wc1)
  }
  if (c1 - c0 < 0.6) return null
  const box = (a0: number, a1: number) => (along === "z" ? { x: c0, z: a0, w: c1 - c0, d: a1 - a0 } : { x: a0, z: c0, w: a1 - a0, d: c1 - c0 })
  // 階段の列を横切る薄い仕切り（色で分けた境界 = 階段下収納の仕切り。厚み 0.08m 以下）は、階段がその上を通るので邪魔にしない
  // 仕切りは扉で途切れていることがあるので、同じ線上の薄い壁と扉を合わせた長さで判定する
  const thinIn = (w: WallRectLike) => {
    const [wc0, wc1] = along === "z" ? [w.x, w.x + w.w] : [w.z, w.z + w.d]
    const thick = along === "z" ? w.d : w.w
    return (w.kind === "wall" || w.kind === "door") && thick <= 0.08 && wc0 >= c0 - 0.08 && wc1 <= c1 + 0.08
  }
  const lineOf = (w: WallRectLike) => Math.round((along === "z" ? w.z + w.d / 2 : w.x + w.w / 2) / 0.05)
  const covered = new Map<number, number>()
  for (const w of lower.walls) if (thinIn(w)) covered.set(lineOf(w), (covered.get(lineOf(w)) ?? 0) + (along === "z" ? w.w : w.d))
  const crossesColumn = (w: WallRectLike) => {
    if (!thinIn(w)) return false
    const k = lineOf(w)
    return (covered.get(k - 1) ?? 0) + (covered.get(k) ?? 0) + (covered.get(k + 1) ?? 0) >= (c1 - c0) * 0.5
  }
  const blocked = (a0: number, a1: number) => {
    const b = boxOf(box(a0, a1))
    return [...lowWalls.filter(w => !crossesColumn(w)), ...upWalls].some(w => hit(boxOf(w), b, 0.01))
  }
  // 記号の外へ 5cm ずつ伸ばせる長さ（壁に当たるまで、最大 goodLen まで）
  const reach = (dir: 1 | -1) => {
    let len = a1s - a0s
    let a0 = a0s
    let a1 = a1s
    while (len < goodLen - 1e-6) {
      const n0 = dir < 0 ? a0 - 0.05 : a0
      const n1 = dir > 0 ? a1 + 0.05 : a1
      if (blocked(n0, n1)) break
      a0 = n0
      a1 = n1
      len = a1 - a0
    }
    return { a0, a1, len }
  }
  const options = ([-1, 1] as const)
    .map(dir => ({ dir, ...reach(dir) }))
    .filter(o => o.len >= minLen - 1e-6)
    .sort((a, b) => b.len - a.len)
  let best: { dir: 1 | -1; a0: number; a1: number; len: number } | undefined = options[0]
  // 置けなければ、記号が上端とは限らない（上の階の段の線が途中だけ描かれている）として、上端側にも伸ばす。
  // - 上端側: 上の階の開口の中なので、上の階の壁に当たるまで
  // - 下端側: 上の階の床の下を通るので、下の階の壁に当たるまで（上の階の壁は関係ない）
  // - 上り切る側（高い所）の下にある下の階の小部屋の仕切り（列を横切る壁）は、階段の箱に取り込む（階段下の空間）
  let through: { opening: Rect; absorbed: WallRectLike[] } | null = null
  if (!best) {
    const fb = opts.throughFloor ? throughFloor() : null
    if (!fb) return null
    best = fb.best
    through = { opening: fb.opening, absorbed: fb.absorbed }
  }
  // 下の方へ伸ばした向きの反対が上り方向（記号 = 上端）
  const up: Side = along === "z" ? (best.dir < 0 ? "+z" : "-z") : best.dir < 0 ? "+x" : "-x"
  const b = box(best.a0, best.a1)
  if (through) {
    const absorbed = new Set(through.absorbed)
    // 取り込んだ仕切りと、階段の縁・開口の縁にある文字・記号の小さな塊を外す
    const near = (r: Rect, m: number) => ({ x: r.x - m, z: r.z - m, w: r.w + 2 * m, d: r.d + 2 * m })
    lower.walls = lower.walls.filter(w => !absorbed.has(w) && !(tiny(w) && hit(boxOf(w), boxOf(near(b, 0.3)), 0)))
    upper.walls = upper.walls.filter(w => !(isTread(w) && hit(boxOf(w), boxOf(through!.opening), 0.02)) && !(tiny(w) && hit(boxOf(w), boxOf(near(through!.opening, 0.3)), 0)))
    const stair: StairSpec = { fromLevel: lower.level, x: r3(b.x), z: r3(b.z), w: r3(b.w), d: r3(b.d), up, shape: "straight", risers: n, opening: { x: r3(through.opening.x), z: r3(through.opening.z), w: r3(through.opening.w), d: r3(through.opening.d) } }
    const lay = stairLayout({ floors: [lower, upper], wallHeightDefault: lower.height } as BuildingSpec, stair)
    const frontBlocked = lower.walls.some(w => w.kind !== "door" && hit(boxOf(w), boxOf(lay.approach), 0.02))
    if (!frontBlocked) return stair
    const entry = sideEntry(lower.walls, b, along, up) ?? openSide(lower, b, along, up)
    if (!entry) return stair
    lower.walls = cutEdge(lower.walls, b, along, up, entry)
    return { ...stair, shape: "winder", entry }
  }

  function throughFloor() {
    const ext = lower.slabs.reduce((e, r) => ({ a0: Math.min(e.a0, along === "z" ? r.z : r.x), a1: Math.max(e.a1, along === "z" ? r.z + r.d : r.x + r.w) }), { a0: Infinity, a1: -Infinity })
    const solidLow = lower.walls.filter(w => w.kind !== "door" && !isTread(w) && !tiny(w))
    const solidUp = upper.walls.filter(w => w.kind !== "door" && !isTread(w) && !tiny(w))
    // 列を横切る壁（列の幅の半分以上・厚み 0.25m 以下・列の中）
    const across = (w: WallRectLike) => {
      const [wc0, wc1] = along === "z" ? [w.x, w.x + w.w] : [w.z, w.z + w.d]
      const thick = along === "z" ? w.d : w.w
      // 両端は側壁・外壁に食い込んでいることがある（0.2m まで）
      return thick <= 0.25 && wc0 >= c0 - 0.2 && wc1 <= c1 + 0.2 && wc1 - wc0 >= (c1 - c0) * 0.5
    }
    const posOf = (w: WallRectLike) => (along === "z" ? w.z + w.d / 2 : w.x + w.w / 2)
    let found: { best: { dir: 1 | -1; a0: number; a1: number; len: number }; opening: Rect; absorbed: WallRectLike[] } | null = null
    for (const dir of [1, -1] as const) {
      // 高い所（上端から全長の 6 割以内 = 段の高さが階高の 4 割以上）の下の壁は取り込める
      const absorbable = (w: WallRectLike, top: number) => across(w) && Math.abs(posOf(w) - top) <= goodLen * 0.6
      const segHits = (list: WallRectLike[], p0: number, p1: number, top: number | null) =>
        list.filter(w => hit(boxOf(w), boxOf(box(Math.min(p0, p1), Math.max(p0, p1))), 0.01) && !(top !== null && absorbable(w, top)) && !crossesColumn(w))
      // 上端（dir > 0 なら記号の a0 側）から、上の階・下の階の壁に当たるまで上り方向へ
      let top = dir > 0 ? a0s : a1s
      const symLow = dir > 0 ? a1s : a0s
      let wallAtTop = false
      while (Math.abs(symLow - top) < goodLen - 1e-6) {
        const nTop = top - dir * 0.05
        if (dir > 0 ? nTop < ext.a0 : nTop > ext.a1) { wallAtTop = true; break }
        if (segHits(solidUp, nTop, top, null).length || segHits(solidLow, nTop, top, nTop).length) { wallAtTop = true; break }
        top = nTop
      }
      // 上端が上の階の壁に突き当たるなら、上がり口（0.75m）を上の階の床に残す（横の扉から廊下へ出る。図面の上端の回り段の位置）
      // （全長が最小に足りなくなるなら上がり口を 0.45m まで詰める。下端は後で伸ばすので、ここでは上端側の長さだけで決める）
      if (wallAtTop) top += dir * 0.75
      // 下端: 記号の下り側の端から、下の階の壁に当たるまで
      let bot = symLow
      while (Math.abs(bot - top) < goodLen - 1e-6) {
        const nBot = bot + dir * 0.05
        if (dir > 0 ? nBot > ext.a1 : nBot < ext.a0) break
        if (segHits(solidLow, bot, nBot, top).length) break
        bot = nBot
      }
      let len = Math.abs(bot - top)
      // 上がり口を残したことで最小の長さに足りなければ、上がり口を 0.45m まで詰める（歩く人の幅 0.44m）
      if (wallAtTop && len < minLen - 1e-6 && len + 0.3 >= minLen - 1e-6) {
        top -= dir * (minLen - len)
        len = Math.abs(bot - top)
      }
      if (len < minLen - 1e-6) continue
      // 上の階の開口: 上端から、頭上 2m を確保できる所（全長の 7 割）まで。上の階の壁の手前で止める
      let oEnd = top + dir * Math.max(0.6, len * 0.7)
      for (const w of solidUp) {
        const [wa0, wa1] = along === "z" ? [w.z, w.z + w.d] : [w.x, w.x + w.w]
        const [wc0, wc1] = along === "z" ? [w.x, w.x + w.w] : [w.z, w.z + w.d]
        if (wc1 <= c0 + 0.01 || wc0 >= c1 - 0.01) continue
        if (dir > 0 && wa0 > top && wa0 < oEnd) oEnd = wa0
        if (dir < 0 && wa1 < top && wa1 > oEnd) oEnd = wa1
      }
      if (Math.abs(oEnd - top) < 0.6) continue
      const [a0, a1] = dir > 0 ? [top, bot] : [bot, top]
      const opening = box(Math.min(top, oEnd), Math.max(top, oEnd))
      const absorbed = solidLow.filter(w => absorbable(w, top) && hit(boxOf(w), boxOf(box(a0, a1)), 0.01))
      if (!found || len > found.best.len + 1e-6) found = { best: { dir, a0, a1, len }, opening, absorbed }
    }
    return found
  }
  // 段の線として拾われた壁と、階段・上がり口（0.75m）・上り口（0.9m）にある小さな塊を外す
  const grow = (r: Rect, a0: number, a1: number) => (along === "z" ? { ...r, z: r.z - a0, d: r.d + a0 + a1 } : { ...r, x: r.x - a0, w: r.w + a0 + a1 })
  const upZone = boxOf(best.dir < 0 ? grow(b, 0, 0.75) : grow(b, 0.75, 0))
  const lowZone = boxOf(best.dir < 0 ? grow(b, 0.9, 0) : grow(b, 0, 0.9))
  upper.walls = upper.walls.filter(w => !isTread(w) && !(tiny(w) && hit(boxOf(w), upZone, 0)))
  const fpBox = boxOf(b)
  lower.walls = lower.walls.filter(w => !isTread(w) && !(tiny(w) && hit(boxOf(w), lowZone, 0)) && !(crossesColumn(w) && hit(boxOf(w), fpBox, 0.01)))
  lower.walls = openStairSide(lower.walls, b, along)
  // 上の階の開口 = 記号の範囲から上端まで（記号の手前 = 下の段の上は、上の階の床として残す。図面どおり）
  const top = up === "+z" ? b.z + b.d : up === "-z" ? b.z : up === "+x" ? b.x + b.w : b.x
  const [o0, o1] = up === "+z" || up === "+x" ? [Math.max(along === "z" ? b.z : b.x, a0s), top] : [top, Math.min(along === "z" ? b.z + b.d : b.x + b.w, a1s)]
  const opening = o1 - o0 < (along === "z" ? b.d : b.w) - 0.3 && o1 - o0 >= 0.6 ? (along === "z" ? { x: r3(b.x), z: r3(o0), w: r3(b.w), d: r3(o1 - o0) } : { x: r3(o0), z: r3(b.z), w: r3(o1 - o0), d: r3(b.d) }) : undefined
  const stair: StairSpec = { fromLevel: lower.level, x: r3(b.x), z: r3(b.z), w: r3(b.w), d: r3(b.d), up, shape: "straight", risers: n, ...(opening ? { opening } : {}) }
  // 上り口の正面が壁でふさがれていて、上り口の横に開口があれば回り階段（横から入る）
  const lay = stairLayout({ floors: [lower, upper], wallHeightDefault: lower.height } as BuildingSpec, stair)
  const front = boxOf(lay.approach)
  const frontBlocked = lower.walls.some(w => w.kind !== "door" && hit(boxOf(w), front, 0.02))
  if (!frontBlocked) return stair
  // 横の開口が検出できなくても（画像の圧縮で切れ端が残る等）、正面がふさがっていれば横から入るしかない。
  // 建物の内側で床が空いている側を入口にし、上り口の正方形の範囲だけ縁の線を切る
  const entry = sideEntry(lower.walls, b, along, up) ?? openSide(lower, b, along, up)
  if (!entry) return stair
  lower.walls = cutEdge(lower.walls, b, along, up, entry)
  return { ...stair, shape: "winder", entry }
}

type WallRectLike = Rect & { kind: string }

/** 上り口の正方形（下端から階段の幅ぶん）の軸方向の範囲 */
function startSquare(b: Rect, along: "x" | "z", up: Side): [number, number] {
  const span = along === "z" ? b.w : b.d
  const start = up === "+z" ? b.z : up === "-z" ? b.z + b.d : up === "+x" ? b.x : b.x + b.w
  const s0 = up === "+z" || up === "+x" ? start : start - span
  return [s0, s0 + span]
}

/** 上り口の横で、建物の内側に床が空いている側（両側とも空いていれば広い方）。外壁側・壁が詰まっている側は選ばない */
function openSide(floor: FloorSpec, b: Rect, along: "x" | "z", up: Side): Side | null {
  const [s0, s1] = startSquare(b, along, up)
  const ext = floor.slabs.reduce((e, r) => ({ x0: Math.min(e.x0, r.x), z0: Math.min(e.z0, r.z), x1: Math.max(e.x1, r.x + r.w), z1: Math.max(e.z1, r.z + r.d) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity })
  const [bc0, bc1] = along === "z" ? [b.x, b.x + b.w] : [b.z, b.z + b.d]
  const [e0, e1] = along === "z" ? [ext.x0, ext.x1] : [ext.z0, ext.z1]
  const walls = floor.walls.filter(w => w.kind === "wall").map(boxOf)
  const cands: { side: Side; room: number }[] = []
  for (const dir of [1, -1] as const) {
    // 縁の線（0.15m）の外側 0.2〜0.75m の帯
    const c0 = dir > 0 ? bc1 + 0.2 : bc0 - 0.75
    const c1 = dir > 0 ? bc1 + 0.75 : bc0 - 0.2
    if (c0 < e0 + 0.15 || c1 > e1 - 0.15) continue
    const band: Box = along === "z" ? { x0: c0, x1: c1, z0: s0 + 0.05, z1: s1 - 0.05 } : { x0: s0 + 0.05, x1: s1 - 0.05, z0: c0, z1: c1 }
    if (walls.some(w => hit(w, band, 0.01))) continue
    cands.push({ side: along === "z" ? (dir > 0 ? "+x" : "-x") : dir > 0 ? "+z" : "-z", room: dir > 0 ? e1 - bc1 : bc0 - e0 })
  }
  return cands.sort((p, q) => q.room - p.room)[0]?.side ?? null
}

/** 入口の側の縁の線（階段の縁から 0.2m 以内・同じ向きの壁）を、上り口の正方形の範囲だけ切る */
function cutEdge<T extends WallRectLike>(walls: T[], b: Rect, along: "x" | "z", up: Side, entry: Side): T[] {
  const [s0, s1] = startSquare(b, along, up)
  const high = entry === "+x" || entry === "+z"
  const [bc0, bc1] = along === "z" ? [b.x, b.x + b.w] : [b.z, b.z + b.d]
  const out: T[] = []
  for (const w of walls) {
    const [c0, c1] = along === "z" ? [w.x, w.x + w.w] : [w.z, w.z + w.d]
    const [a0, a1] = along === "z" ? [w.z, w.z + w.d] : [w.x, w.x + w.w]
    const edge = w.kind === "wall" && (high ? c0 >= bc1 - 0.1 && c0 <= bc1 + 0.2 : c1 <= bc0 + 0.1 && c1 >= bc0 - 0.2) && a1 > s0 + 0.02 && a0 < s1 - 0.02
    if (!edge) {
      out.push(w)
      continue
    }
    for (const [p0, p1] of [[a0, s0], [s1, a1]] as const) {
      if (p1 - p0 < 0.05) continue
      out.push(along === "z" ? { ...w, z: r3(p0), d: r3(p1 - p0) } : { ...w, x: r3(p0), w: r3(p1 - p0) })
    }
  }
  return out
}

/** 上り口（下端から階段の幅ぶん）の横に開口（ドア）があれば、その向き */
function sideEntry(walls: WallRectLike[], b: Rect, along: "x" | "z", up: Side): Side | null {
  const span = along === "z" ? b.w : b.d
  const start = up === "+z" ? b.z : up === "-z" ? b.z + b.d : up === "+x" ? b.x : b.x + b.w
  const s0 = up === "+z" || up === "+x" ? start : start - span
  const s1 = s0 + span
  for (const w of walls) {
    if (w.kind !== "door") continue
    const [c0, c1] = along === "z" ? [w.x, w.x + w.w] : [w.z, w.z + w.d]
    const [a0, a1] = along === "z" ? [w.z, w.z + w.d] : [w.x, w.x + w.w]
    if (a1 - a0 <= c1 - c0 || a1 <= s0 + 0.05 || a0 >= s1 - 0.05) continue
    const [bc0, bc1] = along === "z" ? [b.x, b.x + b.w] : [b.z, b.z + b.d]
    if (Math.abs(c0 - bc1) <= 0.2) return along === "z" ? "+x" : "+z"
    if (Math.abs(c1 - bc0) <= 0.2) return along === "z" ? "-x" : "-z"
  }
  return null
}

/**
 * 下の階: 階段の脇の線（階段の縁）に沿って開口（ドア）が検出されていれば、そこは階段への入口。
 * 縁の線は壁として拾われるので、開口の範囲だけ切り取る（回り階段・横から上る階段の入口）
 */
function openStairSide<T extends WallRectLike>(walls: T[], b: Rect, along: "x" | "z"): T[] {
  const cross = (r: Rect): [number, number] => (along === "z" ? [r.x, r.x + r.w] : [r.z, r.z + r.d])
  const axial = (r: Rect): [number, number] => (along === "z" ? [r.z, r.z + r.d] : [r.x, r.x + r.w])
  const [bc0, bc1] = cross(b)
  const [ba0, ba1] = axial(b)
  const doors = walls.filter(w => {
    if (w.kind !== "door") return false
    const [c0, c1] = cross(w)
    const [a0, a1] = axial(w)
    const parallel = a1 - a0 > c1 - c0
    const nearSide = Math.abs(c0 - bc1) <= 0.2 || Math.abs(c1 - bc0) <= 0.2
    return parallel && nearSide && a1 > ba0 + 0.05 && a0 < ba1 - 0.05
  })
  if (!doors.length) return walls
  const out: T[] = []
  for (const w of walls) {
    const [c0, c1] = cross(w)
    const [a0, a1] = axial(w)
    // 階段の縁に沿う壁（縁から 0.15m 以内・向きが同じ）のうち、開口と同じ側のものだけ（反対側の外壁は切らない）
    const nearHigh = c0 >= bc1 - 0.1 && c0 <= bc1 + 0.15
    const nearLow = c1 <= bc0 + 0.1 && c1 >= bc0 - 0.15
    const edge = w.kind === "wall" && a1 - a0 > c1 - c0 && (nearHigh || nearLow)
    const d = edge
      ? doors.find(dd => {
          const [dc0, dc1] = cross(dd)
          const doorHigh = dc0 >= (bc0 + bc1) / 2
          return doorHigh === nearHigh && (doorHigh ? dc0 >= c0 - 0.05 : dc1 <= c1 + 0.05) && axial(dd)[1] > a0 && axial(dd)[0] < a1
        })
      : undefined
    if (!d) {
      out.push(w)
      continue
    }
    const [d0, d1] = axial(d)
    for (const [s0, s1] of [[a0, d0], [d1, a1]] as const) {
      if (s1 - s0 < 0.05) continue
      out.push(along === "z" ? { ...w, z: r3(s0), d: r3(s1 - s0) } : { ...w, x: r3(s0), w: r3(s1 - s0) })
    }
  }
  return out
}

/** 階段の外形と上り口・上がり口（家具を置かない範囲） */
export function stairKeepouts(spec: BuildingSpec, level: number): Box[] {
  const out: Box[] = []
  for (const s of stairsOf(spec)) {
    if (s.fromLevel !== level && s.fromLevel !== level - 1) continue
    const lay = stairLayout(spec, s)
    out.push(boxOf(s.fromLevel === level ? { x: s.x, z: s.z, w: s.w, d: s.d } : openingOf(s)))
    out.push(boxOf(s.fromLevel === level ? lay.approach : lay.exit))
    if (s.fromLevel === level - 1) out.push(...lay.guards.map(boxOf))
  }
  return out
}

export function sanitizeStairs(raw: unknown, spec: Pick<BuildingSpec, "floors">): StairSpec[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const sides: Side[] = ["+x", "-x", "+z", "-z"]
  const levels = new Set(spec.floors.map(f => f.level))
  return raw.filter(
    (s): s is StairSpec =>
      !!s &&
      typeof s === "object" &&
      [s.fromLevel, s.x, s.z, s.w, s.d].every(v => typeof v === "number" && Number.isFinite(v)) &&
      s.w > 0.5 &&
      s.d > 0.5 &&
      sides.includes(s.up) &&
      (s.shape === "straight" || s.shape === "L" || s.shape === "winder") &&
      (s.entry === undefined || sides.includes(s.entry)) &&
      (s.opening === undefined || (!!s.opening && [s.opening.x, s.opening.z, s.opening.w, s.opening.d].every(v => typeof v === "number" && Number.isFinite(v)) && s.opening.w > 0.3 && s.opening.d > 0.3)) &&
      levels.has(s.fromLevel) &&
      levels.has(s.fromLevel + 1) &&
      (s.risers === undefined || (Number.isInteger(s.risers) && s.risers >= 2 && s.risers <= 30)),
  )
}

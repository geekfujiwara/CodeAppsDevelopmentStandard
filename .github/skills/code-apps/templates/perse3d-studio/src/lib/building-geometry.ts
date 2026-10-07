import * as THREE from "three"
import type { BuildingSpec, FloorSpec, Rect, Side, WallRect } from "./building-spec"
import { FLOOR_LEVEL, floorBaseY, totalHeight } from "./building-spec.ts"
import type { StairSpec } from "./stairs"
import { openingOf, RAIL_H, slabsWithOpenings, stairLayout, stairsOf, subtractRect } from "./stairs.ts"

/**
 * BuildingSpec → 建築ディテール付きのジオメトリ。
 * - 面は材質キーごとにまとめて 1 メッシュにする（描画回数を抑え、影も安定させる）
 * - UV はワールド座標のメートル単位。部材が分かれていても目地・木目が連続する
 * Blender 側（blender/build_from_spec.py）も同じ寸法・同じ部材構成で組み立てる。
 */

export type V3 = [number, number, number]
type UvFn = (p: V3) => [number, number]
type Bucket = { pos: number[]; nor: number[]; uv: number[]; idx: number[] }
export type FaceKeys = Partial<Record<"px" | "nx" | "py" | "ny" | "pz" | "nz", string | null>>

export const SLAB = 0.15
export const FL = FLOOR_LEVEL

function defaultUv(n: V3): UvFn {
  const [ax, ay, az] = n.map(Math.abs)
  if (ay >= 0.7) return p => [p[0], p[2]]
  if (ax >= az) return p => [p[2], p[1]]
  return p => [p[0], p[1]]
}

export class Batch {
  private buckets = new Map<string, Bucket>()

  private bucket(key: string) {
    let b = this.buckets.get(key)
    if (!b) {
      b = { pos: [], nor: [], uv: [], idx: [] }
      this.buckets.set(key, b)
    }
    return b
  }

  /** 平面多角形（凸）。hint と逆向きなら頂点順を反転する */
  poly(key: string, pts: V3[], hint?: V3, uvFn?: UvFn) {
    const n = pts.length
    let nx = 0
    let ny = 0
    let nz = 0
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      nx += (a[1] - b[1]) * (a[2] + b[2])
      ny += (a[2] - b[2]) * (a[0] + b[0])
      nz += (a[0] - b[0]) * (a[1] + b[1])
    }
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) return
    let normal: V3 = [nx / len, ny / len, nz / len]
    let p = pts
    if (hint && normal[0] * hint[0] + normal[1] * hint[1] + normal[2] * hint[2] < 0) {
      p = [...pts].reverse()
      normal = [-normal[0], -normal[1], -normal[2]]
    }
    const uv = uvFn ?? defaultUv(normal)
    const b = this.bucket(key)
    const start = b.pos.length / 3
    for (const v of p) {
      b.pos.push(v[0], v[1], v[2])
      b.nor.push(normal[0], normal[1], normal[2])
      const [u, w] = uv(v)
      b.uv.push(u, w)
    }
    for (let i = 1; i < n - 1; i++) b.idx.push(start, start + i, start + i + 1)
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, keys: FaceKeys) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return
    const f = (k: keyof FaceKeys, pts: V3[], hint: V3) => {
      const key = keys[k]
      if (key) this.poly(key, pts, hint)
    }
    f("px", [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0])
    f("nx", [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0])
    f("py", [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0])
    f("ny", [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0])
    f("pz", [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1])
    f("nz", [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1])
  }

  /** 全面同じ材質の箱 */
  solid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, key: string) {
    this.box(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), { px: key, nx: key, py: key, ny: key, pz: key, nz: key })
  }

  build(materials: Record<string, THREE.Material>): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = []
    for (const [key, b] of this.buckets) {
      const mat = materials[key]
      if (!mat || b.idx.length === 0) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3))
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3))
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2))
      geo.setIndex(b.idx)
      geo.computeBoundingSphere()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = key
      const glass = key === "glass"
      mesh.castShadow = !glass
      mesh.receiveShadow = true
      mesh.userData.pickable = true
      mesh.userData.glass = glass
      if (glass) mesh.renderOrder = 2
      meshes.push(mesh)
    }
    this.buckets.clear()
    return meshes
  }
}

// ── 壁・開口部のディテール ─────────────────────────────

type Axis = {
  along: boolean
  a0: number
  a1: number
  d0: number
  d1: number
  /** 外部側の向き（+1 / -1 / 0=内部） */
  ext: number
}

function axisOf(w: WallRect): Axis {
  const along = w.w >= w.d
  const out = new Set<Side>(w.outside ?? [])
  const ext = along ? (out.has("+z") ? 1 : out.has("-z") ? -1 : 0) : out.has("+x") ? 1 : out.has("-x") ? -1 : 0
  return along
    ? { along, a0: w.x, a1: w.x + w.w, d0: w.z, d1: w.z + w.d, ext }
    : { along, a0: w.z, a1: w.z + w.d, d0: w.x, d1: w.x + w.w, ext }
}

/** 開口方向 a・高さ y・厚み方向 d の箱（全面同材） */
function boxAD(b: Batch, ax: Axis, a0: number, a1: number, y0: number, y1: number, d0: number, d1: number, key: string) {
  if (ax.along) b.solid(a0, y0, d0, a1, y1, d1, key)
  else b.solid(d0, y0, a0, d1, y1, a1, key)
}

function rectsOverlap(x0: number, z0: number, x1: number, z1: number, r: { x: number; z: number; w: number; d: number }) {
  return x0 < r.x + r.w - 0.005 && r.x + 0.005 < x1 && z0 < r.z + r.d - 0.005 && r.z + 0.005 < z1
}

function wallFaceKeys(w: WallRect) {
  const out = new Set<Side>(w.outside ?? [])
  const k = (s: Side) => (out.has(s) ? "exteriorWall" : "interiorWall")
  return { px: k("+x"), nx: k("-x"), pz: k("+z"), nz: k("-z") }
}

function addBaseboards(b: Batch, w: WallRect, base: number) {
  const out = new Set<Side>(w.outside ?? [])
  const h = 0.06
  const t = 0.012
  const x1 = w.x + w.w
  const z1 = w.z + w.d
  if (w.w >= w.d) {
    if (!out.has("+z")) b.solid(w.x, base, z1, x1, base + h, z1 + t, "baseboard")
    if (!out.has("-z")) b.solid(w.x, base, w.z - t, x1, base + h, w.z, "baseboard")
  } else {
    if (!out.has("+x")) b.solid(x1, base, w.z, x1 + t, base + h, z1, "baseboard")
    if (!out.has("-x")) b.solid(w.x - t, base, w.z, w.x, base + h, z1, "baseboard")
  }
}

function addSash(b: Batch, ax: Axis, yb: number, yt: number) {
  const f = 0.04
  const fd = 0.035
  const dExt = ax.ext > 0 ? ax.d1 : ax.d0
  const dc = ax.ext === 0 ? (ax.d0 + ax.d1) / 2 : dExt - ax.ext * 0.05
  const { a0, a1 } = ax
  boxAD(b, ax, a0, a0 + f, yb, yt, dc - fd, dc + fd, "sash")
  boxAD(b, ax, a1 - f, a1, yb, yt, dc - fd, dc + fd, "sash")
  boxAD(b, ax, a0, a1, yt - f, yt, dc - fd, dc + fd, "sash")
  boxAD(b, ax, a0, a1, yb, yb + f, dc - fd, dc + fd, "sash")
  if (a1 - a0 > 1.0) {
    // 引き違い窓の召合せ框
    const m = (a0 + a1) / 2
    boxAD(b, ax, m - 0.03, m + 0.03, yb, yt, dc - fd, dc + fd, "sash")
  }
  boxAD(b, ax, a0 + f, a1 - f, yb + f, yt - f, dc - 0.004, dc + 0.004, "glass")
  return dc
}

/** 室内側の額縁（開口の左右と上） */
function addCasing(b: Batch, ax: Axis, side: number, yb: number, yt: number, key: string) {
  const dF = side > 0 ? ax.d1 : ax.d0
  const d0 = Math.min(dF, dF + side * 0.012)
  const d1 = Math.max(dF, dF + side * 0.012)
  const cw = 0.05
  boxAD(b, ax, ax.a0 - cw, ax.a0, yb, yt + cw, d0, d1, key)
  boxAD(b, ax, ax.a1, ax.a1 + cw, yb, yt + cw, d0, d1, key)
  boxAD(b, ax, ax.a0 - cw, ax.a1 + cw, yt, yt + cw, d0, d1, key)
}

/** 全開状態の扉（壁に沿わせる）。他の壁と干渉しない位置を探す */
function addDoorLeaf(b: Batch, ax: Axis, base: number, yt: number, walls: WallRect[], host: WallRect, preferSide: number) {
  const L = ax.a1 - ax.a0 - 0.02
  const sides = preferSide === 0 ? [1, -1] : [preferSide, -preferSide]
  for (const s of sides) {
    const dF = s > 0 ? ax.d1 : ax.d0
    const dd0 = Math.min(dF + s * 0.015, dF + s * 0.05)
    const dd1 = Math.max(dF + s * 0.015, dF + s * 0.05)
    for (const [la0, la1] of [[ax.a1, ax.a1 + L], [ax.a0 - L, ax.a0]] as const) {
      const [x0, z0, x1, z1] = ax.along ? [la0, dd0, la1, dd1] : [dd0, la0, dd1, la1]
      if (walls.some(w => w !== host && rectsOverlap(x0, z0, x1, z1, w))) continue
      boxAD(b, ax, la0, la1, base + 0.005, yt - 0.01, dd0, dd1, "door")
      // レバーハンドル（吊元の反対側）
      const hx = la0 === ax.a1 ? la1 - 0.08 : la0 + 0.08
      const hd = s > 0 ? dd1 : dd0
      boxAD(b, ax, hx - 0.06, hx + 0.06, base + 0.93, base + 0.96, Math.min(hd, hd + s * 0.05), Math.max(hd, hd + s * 0.05), "sash")
      return
    }
  }
}

export function addWall(b: Batch, w: WallRect, base: number, height: number, spec: BuildingSpec, walls: WallRect[], level: number) {
  // 上に階があるときは、壁の天端を上の階の床スラブの下面で止める（天端の面が上の階の床と同じ高さに重なると、
  // 床のフローリングに白い筋がちらつく）。外壁はスラブの小口を外側の面だけの帯で覆う
  const hasUpper = spec.floors.some(f => f.level > level)
  const top = base + height - (hasUpper ? SLAB : 0)
  const { sill, head } = spec.openings
  const keys = { ...wallFaceKeys(w), py: "section" as string | null, ny: null as string | null }
  const x1 = w.x + w.w
  const z1 = w.z + w.d
  if (hasUpper && w.outside?.length) {
    const band: FaceKeys = {}
    for (const s of w.outside) band[({ "+x": "px", "-x": "nx", "+z": "pz", "-z": "nz" } as const)[s]] = "exteriorWall"
    b.box(w.x, top, w.z, x1, top + SLAB, z1, band)
  }
  if (w.kind === "wall") {
    b.box(w.x, base, w.z, x1, top, z1, keys)
    addBaseboards(b, w, base)
    return
  }
  const ax = axisOf(w)
  const yt = base + head
  const yb = w.kind === "window" ? base + sill : base
  b.box(w.x, yt, w.z, x1, top, z1, { ...keys, ny: "interiorWall" })
  const room = ax.ext === 0 ? 0 : -ax.ext

  if (w.kind === "window") {
    b.box(w.x, base, w.z, x1, yb, z1, { ...keys, py: "windowBoard" })
    addBaseboards(b, w, base)
  }
  if (w.kind === "window" || w.kind === "glassdoor") {
    const dc = addSash(b, ax, yb, yt)
    if (ax.ext !== 0) {
      const dExt = ax.ext > 0 ? ax.d1 : ax.d0
      const dInt = ax.ext > 0 ? ax.d0 : ax.d1
      if (w.kind === "window") {
        // 水切り（外）と窓台（内）
        boxAD(b, ax, ax.a0 - 0.03, ax.a1 + 0.03, yb - 0.025, yb, dExt, dExt + ax.ext * 0.06, "sash")
        boxAD(b, ax, ax.a0 - 0.02, ax.a1 + 0.02, yb, yb + 0.02, dc, dInt + room * 0.03, "windowBoard")
      }
      addCasing(b, ax, room, w.kind === "window" ? yb : base, yt, "casing")
    }
    return
  }
  // ドア: 両面の額縁 + 扉
  for (const s of [1, -1]) addCasing(b, ax, s, base, yt, s === ax.ext ? "sash" : "casing")
  addDoorLeaf(b, ax, base, yt, walls, w, ax.ext !== 0 ? ax.ext : 0)
  if (level === 0 && ax.ext !== 0) addPorch(b, ax)
}

/** 玄関ポーチと踏み段（基礎の高さ FL を上り下りする） */
function addPorch(b: Batch, ax: Axis) {
  const dExt = ax.ext > 0 ? ax.d1 : ax.d0
  const s = ax.ext
  boxAD(b, ax, ax.a0 - 0.45, ax.a1 + 0.45, -FL, -0.15, dExt, dExt + s * 1.2, "concrete")
  boxAD(b, ax, ax.a0 - 0.45, ax.a1 + 0.45, -FL, -0.3, dExt + s * 1.2, dExt + s * 1.5, "concrete")
}

/** 1F の外周壁の下に基礎（外面を 15mm ふかす）。掃き出し窓の前には沓脱ぎ石 */
export function addFoundation(b: Batch, walls: WallRect[]) {
  for (const w of walls) {
    if (!w.outside?.length) continue
    const out = new Set<Side>(w.outside)
    const e = 0.015
    const x0 = w.x - (out.has("-x") ? e : 0)
    const x1 = w.x + w.w + (out.has("+x") ? e : 0)
    const z0 = w.z - (out.has("-z") ? e : 0)
    const z1 = w.z + w.d + (out.has("+z") ? e : 0)
    const k = (s: Side) => (out.has(s) ? "foundation" : null)
    b.box(x0, -FL, z0, x1, 0, z1, { px: k("+x"), nx: k("-x"), pz: k("+z"), nz: k("-z"), py: null, ny: null })
    if (w.kind === "glassdoor") {
      const ax = axisOf(w)
      if (ax.ext === 0) continue
      const dExt = ax.ext > 0 ? ax.d1 : ax.d0
      const m = (ax.a0 + ax.a1) / 2
      boxAD(b, ax, m - 0.35, m + 0.35, -FL, -0.22, dExt + ax.ext * e, dExt + ax.ext * 0.5, "concrete")
    }
  }
}

export function addSlab(b: Batch, r: { x: number; z: number; w: number; d: number }, base: number) {
  // 側面は壁・基礎が覆うため作らない（同一平面のちらつき防止）
  b.box(r.x, base - SLAB, r.z, r.x + r.w, base, r.z + r.d, { py: "floor", ny: "ceiling" })
}

// ── 1 つの階（床・壁・階段・吹き抜け） ─────────────────────────

/** 1 つの階の部材。Three.js と Blender（geometry.py の add_floor）で同じ順に作る */
export function addFloor(b: Batch, spec: BuildingSpec, floor: FloorSpec) {
  const base = floorBaseY(spec, floor.level)
  for (const s of slabsWithOpenings(spec, floor)) addSlab(b, s, base)
  for (const w of floor.walls) addWall(b, w, base, floor.height, spec, floor.walls, floor.level)
  for (const s of stairsOf(spec)) {
    if (s.fromLevel === floor.level) addStair(b, spec, s)
    if (s.fromLevel === floor.level - 1) addStairWell(b, spec, s)
  }
}

const TREAD_T = 0.03
const NOSING = 0.02
const GUARD_H = 0.95
const NOSE: Record<Side, [number, number]> = { "+x": [NOSING, 0], "-x": [-NOSING, 0], "+z": [0, NOSING], "-z": [0, -NOSING] }

/** 段（下は箱で塞ぐ = 階段下収納の壁）・踏み板（段鼻 2cm）・手すり */
export function addStair(b: Batch, spec: BuildingSpec, s: StairSpec) {
  const lay = stairLayout(spec, s)
  const base = floorBaseY(spec, s.fromLevel)
  for (const st of lay.steps) {
    b.box(st.x0, base, st.z0, st.x1, base + st.top - TREAD_T, st.z1, { px: "interiorWall", nx: "interiorWall", pz: "interiorWall", nz: "interiorWall" })
    const [nx, nz] = NOSE[st.down]
    b.solid(st.x0 + Math.min(0, nx), base + st.top - TREAD_T, st.z0 + Math.min(0, nz), st.x1 + Math.max(0, nx), base + st.top, st.z1 + Math.max(0, nz), "floor")
  }
  const rail = lay.rail.map(([x, y, z]) => [x, base + y, z] as V3)
  for (let i = 0; i + 1 < rail.length; i++) bar(b, rail[i], rail[i + 1], 0.04, "casing")
  for (const [x, y, z] of [rail[0], rail[rail.length - 1]]) b.solid(x - 0.02, y - RAIL_H, z - 0.02, x + 0.02, y, z + 0.02, "casing")
}

/** 上の階: 開口の小口（床の厚み）と、上がり口以外の手すり壁 */
export function addStairWell(b: Batch, spec: BuildingSpec, s: StairSpec) {
  const base = floorBaseY(spec, s.fromLevel + 1)
  const y0 = base - SLAB
  const o = openingOf(s)
  const x0 = o.x
  const x1 = o.x + o.w
  const z0 = o.z
  const z1 = o.z + o.d
  b.poly("interiorWall", [[x0, y0, z0], [x0, base, z0], [x0, base, z1], [x0, y0, z1]], [1, 0, 0])
  b.poly("interiorWall", [[x1, y0, z0], [x1, base, z0], [x1, base, z1], [x1, y0, z1]], [-1, 0, 0])
  b.poly("interiorWall", [[x0, y0, z0], [x1, y0, z0], [x1, base, z0], [x0, base, z0]], [0, 0, 1])
  b.poly("interiorWall", [[x0, y0, z1], [x1, y0, z1], [x1, base, z1], [x0, base, z1]], [0, 0, -1])
  for (const g of stairLayout(spec, s).guards) {
    b.box(g.x, base, g.z, g.x + g.w, base + GUARD_H, g.z + g.d, { px: "interiorWall", nx: "interiorWall", pz: "interiorWall", nz: "interiorWall", py: "casing" })
  }
}

/** 断面 size 角の棒（手すり）。p0 → p1 の任意の向き */
function bar(b: Batch, p0: V3, p1: V3, size: number, key: string) {
  const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const len = Math.hypot(...d)
  if (len < 1e-6) return
  const dir: V3 = [d[0] / len, d[1] / len, d[2] / len]
  const hl = Math.hypot(dir[0], dir[2])
  const e1: V3 = hl < 1e-6 ? [1, 0, 0] : [-dir[2] / hl, 0, dir[0] / hl]
  const e2: V3 = [dir[1] * e1[2] - dir[2] * e1[1], dir[2] * e1[0] - dir[0] * e1[2], dir[0] * e1[1] - dir[1] * e1[0]]
  const h = size / 2
  const corner = (p: V3, a: number, c: number): V3 => [p[0] + (e1[0] * a + e2[0] * c) * h, p[1] + (e1[1] * a + e2[1] * c) * h, p[2] + (e1[2] * a + e2[2] * c) * h]
  const ring: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
  for (let i = 0; i < 4; i++) {
    const [a0, c0] = ring[i]
    const [a1, c1] = ring[(i + 1) % 4]
    const out: V3 = [e1[0] * (a0 + a1) + e2[0] * (c0 + c1), e1[1] * (a0 + a1) + e2[1] * (c0 + c1), e1[2] * (a0 + a1) + e2[2] * (c0 + c1)]
    b.poly(key, [corner(p0, a0, c0), corner(p0, a1, c1), corner(p1, a1, c1), corner(p1, a0, c0)], out)
  }
}

// ── 屋根（厚み・軒天・破風・雨樋） ─────────────────────────

function slopeUv(n: V3): UvFn | undefined {
  const s = Math.hypot(n[0], n[2])
  if (s < 0.05) return undefined
  const hx = n[0] / s
  const hz = n[2] / s
  return p => [p[0] * -hz + p[2] * hx, p[1] / s]
}

function newellNormal(pts: V3[]): V3 {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const c = pts[(i + 1) % pts.length]
    nx += (a[1] - c[1]) * (a[2] + c[2])
    ny += (a[2] - c[2]) * (a[0] + c[0])
    nz += (a[0] - c[0]) * (a[1] + c[1])
  }
  const l = Math.hypot(nx, ny, nz) || 1
  const n: V3 = [nx / l, ny / l, nz / l]
  return n[1] < 0 ? [-n[0], -n[1], -n[2]] : n
}

function roofPlane(b: Batch, pts: V3[], thick = 0.15) {
  const n = newellNormal(pts)
  b.poly("roof", pts, [0, 1, 0], slopeUv(n))
  const bottom = pts.map(p => [p[0], p[1] - thick, p[2]] as V3)
  b.poly("soffit", bottom, [0, -1, 0])
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cz = pts.reduce((s, p) => s + p[2], 0) / pts.length
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const c = pts[(i + 1) % pts.length]
    const mx = (a[0] + c[0]) / 2 - cx
    const mz = (a[2] + c[2]) / 2 - cz
    b.poly("fascia", [a, c, bottom[(i + 1) % pts.length], bottom[i]], [mx, 0, mz])
  }
}

function twoSided(b: Batch, pts: V3[], outward: V3) {
  b.poly("exteriorWall", pts, outward)
  b.poly("interiorWall", pts, [-outward[0], -outward[1], -outward[2]])
}

export function addRoof(b: Batch, spec: BuildingSpec) {
  const H = totalHeight(spec)
  const { width: W, depth: D } = spec.footprint
  const { type, overhang: o } = spec.roof
  const t = Math.tan((spec.roof.pitch * Math.PI) / 180)
  const alongX = W >= D
  const U = alongX ? W : D
  const V = alongX ? D : W
  const P = (u: number, y: number, v: number): V3 => (alongX ? [u, y, v] : [v, y, u])
  const out = (u: number, v: number): V3 => (alongX ? [u, 0, v] : [v, 0, u])
  const eaveY = H - o * t

  if (type === "flat") {
    b.box(-0.15, H, -0.15, W + 0.15, H + 0.2, D + 0.15, { px: "exteriorWall", nx: "exteriorWall", pz: "exteriorWall", nz: "exteriorWall", py: "flatRoof", ny: "soffit" })
    const p = 0.15
    for (const [x0, z0, x1, z1] of [[-p, -p, W + p, 0], [-p, D, W + p, D + p], [-p, 0, 0, D], [W, 0, W + p, D]]) {
      b.box(x0, H + 0.2, z0, x1, H + 0.75, z1, { px: "exteriorWall", nx: "exteriorWall", pz: "exteriorWall", nz: "exteriorWall", py: "fascia", ny: null })
    }
    addDownspouts(b, spec, H + 0.2, [[0.12, -0.1], [W - 0.12, -0.1], [0.12, D + 0.1], [W - 0.12, D + 0.1]])
    return
  }
  const eaves: { u0: number; u1: number; v: number; dir: number }[] = []
  if (type === "gable") {
    const ridge = H + (V / 2) * t
    roofPlane(b, [P(-o, eaveY, -o), P(U + o, eaveY, -o), P(U + o, ridge, V / 2), P(-o, ridge, V / 2)])
    roofPlane(b, [P(-o, ridge, V / 2), P(U + o, ridge, V / 2), P(U + o, eaveY, V + o), P(-o, eaveY, V + o)])
    twoSided(b, [P(0, H, 0), P(0, H, V), P(0, ridge, V / 2)], out(-1, 0))
    twoSided(b, [P(U, H, 0), P(U, ridge, V / 2), P(U, H, V)], out(1, 0))
    eaves.push({ u0: -o, u1: U + o, v: -o, dir: -1 }, { u0: -o, u1: U + o, v: V + o, dir: 1 })
  } else if (type === "hip") {
    const ridge = H + (V / 2) * t
    const r0 = Math.min(V / 2, U / 2)
    const r1 = Math.max(U - V / 2, U / 2)
    roofPlane(b, [P(-o, eaveY, -o), P(U + o, eaveY, -o), P(r1, ridge, V / 2), P(r0, ridge, V / 2)])
    roofPlane(b, [P(r0, ridge, V / 2), P(r1, ridge, V / 2), P(U + o, eaveY, V + o), P(-o, eaveY, V + o)])
    roofPlane(b, [P(-o, eaveY, -o), P(r0, ridge, V / 2), P(-o, eaveY, V + o)])
    roofPlane(b, [P(U + o, eaveY, -o), P(U + o, eaveY, V + o), P(r1, ridge, V / 2)])
    eaves.push({ u0: -o, u1: U + o, v: -o, dir: -1 }, { u0: -o, u1: U + o, v: V + o, dir: 1 })
  } else {
    const high = H + V * t
    roofPlane(b, [P(-o, high + o * t, -o), P(U + o, high + o * t, -o), P(U + o, eaveY, V + o), P(-o, eaveY, V + o)])
    twoSided(b, [P(0, H, 0), P(0, H, V), P(0, high, 0)], out(-1, 0))
    twoSided(b, [P(U, H, 0), P(U, high, 0), P(U, H, V)], out(1, 0))
    twoSided(b, [P(0, H, 0), P(0, high, 0), P(U, high, 0), P(U, H, 0)], out(0, -1))
    eaves.push({ u0: -o, u1: U + o, v: V + o, dir: 1 })
  }
  // 軒樋（破風の外側）と竪樋（建物の角）
  const gy0 = eaveY - 0.17
  const gy1 = eaveY - 0.07
  const spouts: [number, number][] = []
  for (const e of eaves) {
    const v0 = e.dir > 0 ? e.v : e.v - 0.11
    const v1 = e.dir > 0 ? e.v + 0.11 : e.v
    const [a, c] = [P(e.u0, gy0, v0), P(e.u1, gy1, v1)]
    b.solid(a[0], a[1], a[2], c[0], c[1], c[2], "fascia")
    const vw = e.dir > 0 ? V + 0.05 : -0.05
    for (const u of [0.15, U - 0.15]) {
      const p = P(u, 0, vw)
      spouts.push([p[0], p[2]])
      // 軒樋から外壁沿いへの呼び樋
      const q0 = P(u - 0.03, gy0 - 0.05, Math.min(e.v, vw))
      const q1 = P(u + 0.03, gy0, Math.max(e.v, vw))
      b.solid(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], "fascia")
    }
  }
  addDownspouts(b, spec, gy0, spouts)
}

function addDownspouts(b: Batch, _spec: BuildingSpec, topY: number, points: [number, number][]) {
  for (const [x, z] of points) b.solid(x - 0.03, -FL, z - 0.03, x + 0.03, topY, z + 0.03, "fascia")
}

/** 最上階の天井面 */
export function addTopCeiling(b: Batch, spec: BuildingSpec) {
  const top = spec.floors[spec.floors.length - 1]
  const y = floorBaseY(spec, top.level) + top.height - 0.005
  for (const s of top.slabs) b.poly("ceiling", [[s.x, y, s.z], [s.x + s.w, y, s.z], [s.x + s.w, y, s.z + s.d], [s.x, y, s.z + s.d]], [0, -1, 0])
}

/**
 * 下の階だけの部分（上の階の床に覆われない範囲。バルコニーの下・1F だけの張り出し）の陸屋根。
 * 上の階の床スラブと同じ高さ・厚みで、上面を屋根、下面を天井にする（無いと天井が抜け、外から室内が見える）。
 * 側面は作らない（外周は下の階の壁がスラブの小口を覆う帯を持つ。同じ面を 2 枚重ねない）
 */
export function lowerRoofRects(spec: BuildingSpec): { level: number; rects: Rect[] }[] {
  const out: { level: number; rects: Rect[] }[] = []
  for (const floor of spec.floors) {
    const upper = spec.floors.find(f => f.level === floor.level + 1)
    if (!upper) continue
    let rects: Rect[] = floor.slabs
    for (const u of upper.slabs) rects = rects.flatMap(r => subtractRect(r, u))
    rects = rects.filter(r => r.w >= 0.04 && r.d >= 0.04)
    if (rects.length) out.push({ level: floor.level, rects })
  }
  return out
}

export function addLowerRoofs(b: Batch, spec: BuildingSpec) {
  for (const { level, rects } of lowerRoofRects(spec)) {
    const top = floorBaseY(spec, level + 1)
    for (const r of rects) b.box(r.x, top - SLAB, r.z, r.x + r.w, top, r.z + r.d, { py: "flatRoof", ny: "ceiling" })
  }
}

/** 玄関（1F の外周ドア）の位置。アプローチ・内見の開始位置に使う */
export function findEntrance(spec: BuildingSpec) {
  const door = spec.floors[0]?.walls.find(w => w.kind === "door" && w.outside?.length)
  if (!door) return null
  const ax = axisOf(door)
  return { door, ax, side: door.outside![0] }
}

export type SiteLayout = {
  /** 道路（z 方向の範囲。正面 = +z 側） */
  roadZ0: number
  roadZ1: number
  curbZ0: number
  approach: { x0: number; x1: number; z0: number; z1: number }
  /** 駐車場（車 1 台・前向き駐車）。間口が足りない場合は null */
  parking: { x0: number; x1: number; z0: number; z1: number } | null
}

/** 外構の配置（建物前面から道路まで 6m のセットバック）。blender/geometry.py の site_layout と同じ */
export function siteLayout(spec: BuildingSpec): SiteLayout {
  const { width: W, depth: D } = spec.footprint
  const curbZ0 = D + 5.85
  let ax0 = Math.min(1.3, W * 0.15) - 0.7
  let ax1 = ax0 + 1.4
  const ent = findEntrance(spec)
  if (ent && ent.side === "+z") {
    ax0 = ent.ax.a0 - 0.3
    ax1 = ent.ax.a1 + 0.3
  }
  const px0 = Math.max(ax1 + 0.8, W - 3.2)
  const parking = px0 + 2.8 <= W + 2 ? { x0: px0, x1: px0 + 2.8, z0: D + 0.3, z1: curbZ0 } : null
  return { roadZ0: D + 6, roadZ1: D + 12, curbZ0, approach: { x0: ax0, x1: ax1, z0: D + 1.5, z1: curbZ0 }, parking }
}

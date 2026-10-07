import * as THREE from "three"
import type { FloorFinish, RoofFinish, WallFinish } from "@/lib/building-spec"

/**
 * 建材の PBR テクスチャ（色・法線・粗さ）を Canvas で手続き生成する。
 * 外部画像を読み込まないため Code Apps の CSP（connect-src 'none'）でも動く。
 * UV はメートル単位（building-scene.ts のワールド UV）なので、repeat = 1 / tile（m）で実寸になる。
 */

export type PbrSet = {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  normalScale: number
  metalness: number
  tile: number
}

type Sample = { c: [number, number, number]; h: number; r: number }
type Generator = (x: number, y: number, base: [number, number, number]) => Sample

// ── 乱数・ノイズ（タイル境界で連続するよう周期付き） ───────────────
function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number, period: number, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const w = (i: number) => ((i % period) + period) % period
  const a = hash(w(xi), w(yi), seed)
  const b = hash(w(xi + 1), w(yi), seed)
  const c = hash(w(xi), w(yi + 1), seed)
  const d = hash(w(xi + 1), w(yi + 1), seed)
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** タイル（tile m）内で周期的な fbm。freq は 1 タイルあたりの周期数（整数） */
function fbm(x: number, y: number, tile: number, freq: number, seed = 0, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let f = freq
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise((x / tile) * f, (y / tile) * f, f, seed + o * 17)
    amp *= 0.5
    f *= 2
  }
  return sum / (1 - Math.pow(0.5, octaves))
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mul = (c: [number, number, number], k: number): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k]
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
}

function canvasTexture(canvas: HTMLCanvasElement, tile: number, srgb: boolean) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / tile, 1 / tile)
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return t
}

function bake(gen: Generator, base: string, tile: number, opts: { size?: number; normalScale?: number; metalness?: number }): PbrSet {
  const size = opts.size ?? 512
  const rgb = hexToRgb(base)
  const height = new Float32Array(size * size)
  const albedo = document.createElement("canvas")
  const rough = document.createElement("canvas")
  const normal = document.createElement("canvas")
  for (const c of [albedo, rough, normal]) c.width = c.height = size
  const aCtx = albedo.getContext("2d")!
  const rCtx = rough.getContext("2d")!
  const nCtx = normal.getContext("2d")!
  const aImg = aCtx.createImageData(size, size)
  const rImg = rCtx.createImageData(size, size)
  const nImg = nCtx.createImageData(size, size)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const s = gen(((px + 0.5) / size) * tile, ((py + 0.5) / size) * tile, rgb)
      const i = py * size + px
      height[i] = s.h
      aImg.data[i * 4] = clamp01(s.c[0]) * 255
      aImg.data[i * 4 + 1] = clamp01(s.c[1]) * 255
      aImg.data[i * 4 + 2] = clamp01(s.c[2]) * 255
      aImg.data[i * 4 + 3] = 255
      const r = clamp01(s.r) * 255
      // roughnessMap は G チャンネルを読む
      rImg.data[i * 4] = r
      rImg.data[i * 4 + 1] = r
      rImg.data[i * 4 + 2] = r
      rImg.data[i * 4 + 3] = 255
    }
  }
  // 高さ → 法線（周期境界の Sobel）。高さ 1.0 = 実寸で約 4mm の凹凸として勾配を求める
  const depth = 0.004
  const strength = (depth * size) / (8 * tile)
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (at(px + 1, py - 1) + 2 * at(px + 1, py) + at(px + 1, py + 1) - at(px - 1, py - 1) - 2 * at(px - 1, py) - at(px - 1, py + 1)) * strength
      const dy = (at(px - 1, py + 1) + 2 * at(px, py + 1) + at(px + 1, py + 1) - at(px - 1, py - 1) - 2 * at(px, py - 1) - at(px + 1, py - 1)) * strength
      // Canvas は下向きが +y、テクスチャは flipY で上向きが +v になるため dy の符号を反転する
      const nx = -dx
      const ny = dy
      const len = Math.hypot(nx, ny, 1)
      const i = (py * size + px) * 4
      nImg.data[i] = (nx / len * 0.5 + 0.5) * 255
      nImg.data[i + 1] = (ny / len * 0.5 + 0.5) * 255
      nImg.data[i + 2] = (1 / len * 0.5 + 0.5) * 255
      nImg.data[i + 3] = 255
    }
  }
  aCtx.putImageData(aImg, 0, 0)
  rCtx.putImageData(rImg, 0, 0)
  nCtx.putImageData(nImg, 0, 0)
  return {
    map: canvasTexture(albedo, tile, true),
    normalMap: canvasTexture(normal, tile, false),
    roughnessMap: canvasTexture(rough, tile, false),
    normalScale: opts.normalScale ?? 1,
    metalness: opts.metalness ?? 0,
    tile,
  }
}

// ── 外壁 ─────────────────────────────────────────────

const siding: Generator = (x, y, base) => {
  const board = 0.2
  const t = (y % board) / board
  const groove = t < 0.05
  const n = fbm(x, y, 1.8, 6, 1)
  const fine = fbm(x, y, 1.8, 48, 2, 2)
  // 下端が出て上端が奥に入る羽目板（影の線が水平に出る）
  const h = groove ? 0 : 0.25 + 0.75 * (1 - t) + fine * 0.05
  // 目地（縦）は 3.6m ごと。タイル 1.8m の端
  const joint = x % 1.8 < 0.008
  const k = groove ? 0.62 : joint ? 0.7 : 0.9 + 0.1 * n - 0.04 * fine
  return { c: mul(base, k), h: joint ? 0 : h, r: 0.78 + 0.1 * fine }
}

const plaster: Generator = (x, y, base) => {
  const a = fbm(x, y, 2, 8, 3)
  const b = fbm(x, y, 2, 64, 4, 3)
  const trowel = fbm(x, y, 2, 3, 5)
  return { c: mul(base, 0.9 + 0.08 * trowel + 0.04 * (b - 0.5)), h: a * 0.5 + b * 0.5, r: 0.93 }
}

const brick: Generator = (x, y, base) => {
  const bw = 0.225
  const bh = 0.075
  const mortar = 0.01
  const row = Math.floor(y / bh)
  const off = (row % 2) * (bw / 2)
  const xx = (x + off) % 0.9
  const col = Math.floor(xx / bw)
  const lx = xx - col * bw
  const ly = y - row * bh
  const isMortar = lx < mortar || ly < mortar
  const fine = fbm(x, y, 0.9, 64, 7, 3)
  if (isMortar) return { c: mix([0.74, 0.72, 0.68], mul(base, 1.1), 0.15), h: 0.1 + fine * 0.05, r: 0.95 }
  const v = hash(col % 4, row % 12, 9)
  const burnt = hash(col % 4, row % 12, 10) > 0.85
  const c = mul(base, 0.78 + 0.3 * v)
  return { c: burnt ? mul(c, 0.7) : [c[0] * 1.02, c[1], c[2] * 0.97], h: 0.75 + 0.2 * fine, r: 0.86 }
}

const woodBoards: Generator = (x, y, base) => {
  const bw = 0.12
  const col = Math.floor(x / bw)
  const lx = (x - col * bw) / bw
  const groove = lx < 0.05
  const tone = hash(col % 10, 0, 11)
  const warp = fbm(x, y, 1.2, 4, 12)
  const grain = 0.5 + 0.5 * Math.sin((lx * 9 + warp * 6 + tone * 20 + fbm(x, y, 1.2, 24, 13, 2) * 1.5) * Math.PI * 2)
  const k = groove ? 0.45 : (0.78 + 0.25 * tone) * (0.82 + 0.18 * grain)
  return { c: mul(base, k), h: groove ? 0 : 0.7 + 0.15 * grain, r: 0.82 - 0.1 * grain }
}

const metalSiding: Generator = (x, y, base) => {
  const p = (x % 0.2) / 0.2
  // 角波の台形断面
  const h = p < 0.12 ? p / 0.12 : p < 0.38 ? 1 : p < 0.5 ? 1 - (p - 0.38) / 0.12 : 0
  const smudge = fbm(x, y, 0.8, 4, 14)
  return { c: mul(base, 0.92 + 0.12 * h + 0.05 * (smudge - 0.5)), h, r: 0.38 + 0.12 * smudge }
}

// ── 屋根 ─────────────────────────────────────────────

const slate: Generator = (x, y, base) => {
  const rh = 0.18
  const row = Math.floor(y / rh)
  const ly = (y - row * rh) / rh
  const off = (row % 2) * 0.15
  const xx = (x + off) % 0.9
  const col = Math.floor(xx / 0.3)
  const lx = xx - col * 0.3
  const gap = lx < 0.006
  const v = hash(col % 3, row % 5, 21)
  const fine = fbm(x, y, 0.9, 64, 22, 2)
  // 段の下端（ly=0）が厚く、上に行くほど次の段の下に潜る
  const h = gap ? 0.05 : 0.3 + 0.7 * (1 - ly) + fine * 0.05
  const shadow = ly > 0.9 ? 0.75 : 1
  return { c: mul(base, (gap ? 0.5 : 0.85 + 0.25 * v) * shadow * (0.95 + 0.05 * fine)), h, r: 0.72 }
}

const kawara: Generator = (x, y, base) => {
  const p = (x % 0.3) / 0.3
  const row = Math.floor(y / 0.3)
  const ly = (y - row * 0.3) / 0.3
  const wave = 0.5 + 0.5 * Math.cos(p * Math.PI * 2)
  const h = wave * 0.7 + (1 - ly) * 0.3
  const glaze = fbm(x, y, 0.9, 6, 23)
  const k = (0.7 + 0.35 * wave) * (ly > 0.92 ? 0.7 : 1) * (0.94 + 0.08 * glaze)
  return { c: mul(base, k), h, r: 0.35 + 0.15 * glaze }
}

const metalRoof: Generator = (x, y, base) => {
  const lx = x % 0.45
  const seam = lx < 0.025
  const ripple = 0.5 + 0.5 * Math.sin((lx / 0.45) * Math.PI * 6)
  const smudge = fbm(x, y, 0.9, 3, 24)
  return { c: mul(base, seam ? 1.1 : 0.95 + 0.05 * smudge), h: seam ? 1 : 0.15 + 0.03 * ripple, r: 0.32 + 0.1 * smudge }
}

// ── 床・内装 ──────────────────────────────────────────

const oakFloor: Generator = (x, y, base) => {
  const pw = 0.15
  const len = 0.9
  const row = Math.floor(y / pw)
  const off = hash(row % 12, 0, 31) * len
  const xx = (x + off) % 1.8
  const col = Math.floor(xx / len)
  const lx = xx - col * len
  const ly = (y - row * pw) / pw
  const seam = ly < 0.03 || lx < 0.004
  const tone = hash((col + row * 3) % 24, row % 12, 32)
  const warp = fbm(x, y, 1.8, 3, 33)
  const grain = 0.5 + 0.5 * Math.sin((ly * 7 + warp * 4 + tone * 13 + fbm(x, y, 1.8, 36, 34, 2)) * Math.PI * 2)
  const knot = fbm(x, y, 1.8, 12, 35) > 0.78 ? 0.85 : 1
  const k = seam ? 0.55 : (0.8 + 0.28 * tone) * (0.86 + 0.14 * grain) * knot
  return { c: mul(base, k), h: seam ? 0 : 0.8 + 0.05 * grain, r: seam ? 0.8 : 0.32 + 0.12 * (1 - grain) }
}

const tileFloor: Generator = (x, y, base) => {
  const t = 0.6
  const lx = x % t
  const ly = y % t
  const grout = lx < 0.004 || ly < 0.004
  const vein = fbm(x, y, 1.2, 4, 41)
  const ti = hash(Math.floor(x / t) % 2, Math.floor(y / t) % 2, 42)
  if (grout) return { c: [0.62, 0.61, 0.59], h: 0, r: 0.9 }
  return { c: mul(base, 0.92 + 0.08 * vein + 0.04 * ti), h: 0.9, r: 0.18 + 0.1 * vein }
}

const cloth: Generator = (x, y, base) => {
  const a = fbm(x, y, 0.5, 64, 51, 3)
  const b = fbm(x, y, 0.5, 8, 52)
  return { c: mul(base, 0.96 + 0.04 * b), h: a, r: 0.9 }
}

const grass: Generator = (x, y, base) => {
  const patch = fbm(x, y, 4, 4, 61)
  const blades = fbm(x, y, 4, 96, 62, 2)
  const dry: [number, number, number] = [0.62, 0.6, 0.38]
  const c = mix(mul(base, 0.75 + 0.45 * blades), dry, Math.max(0, patch - 0.6) * 0.9)
  return { c, h: blades, r: 0.95 }
}

const concrete: Generator = (x, y, base) => {
  const a = fbm(x, y, 3, 6, 71)
  const b = fbm(x, y, 3, 80, 72, 2)
  const joint = x % 3 < 0.01 || y % 3 < 0.01
  const pit = b > 0.82 ? 0.85 : 1
  return { c: mul(base, (joint ? 0.7 : 0.88 + 0.12 * a) * pit), h: joint ? 0 : 0.6 + 0.3 * b, r: 0.88 }
}

// ── 公開 API（キャッシュ付き） ──────────────────────────

export type SurfaceKind =
  | { type: "wall"; finish: WallFinish }
  | { type: "roof"; finish: RoofFinish }
  | { type: "floor"; finish: FloorFinish }
  | { type: "interior" }
  | { type: "grass" }
  | { type: "concrete" }

const RECIPES = {
  "wall:siding": { gen: siding, tile: 1.8, normalScale: 1.2 },
  "wall:plaster": { gen: plaster, tile: 2, normalScale: 0.9 },
  "wall:brick": { gen: brick, tile: 0.9, normalScale: 1.6 },
  "wall:wood": { gen: woodBoards, tile: 1.2, normalScale: 1.2 },
  "wall:metal": { gen: metalSiding, tile: 0.8, normalScale: 1.5, metalness: 0.55 },
  "roof:slate": { gen: slate, tile: 0.9, normalScale: 1.6 },
  "roof:kawara": { gen: kawara, tile: 0.9, normalScale: 2.2 },
  "roof:metal": { gen: metalRoof, tile: 0.9, normalScale: 1.4, metalness: 0.6 },
  "floor:oak": { gen: oakFloor, tile: 1.8, normalScale: 0.8 },
  "floor:tile": { gen: tileFloor, tile: 1.2, normalScale: 0.6 },
  interior: { gen: cloth, tile: 0.5, normalScale: 0.25 },
  grass: { gen: grass, tile: 4, normalScale: 1.5 },
  concrete: { gen: concrete, tile: 3, normalScale: 0.8 },
} as const

const cache = new Map<string, PbrSet>()
const slots = new Map<string, string>()

function disposeSet(v: PbrSet) {
  v.map.dispose()
  v.normalMap.dispose()
  v.roughnessMap.dispose()
}

/**
 * slot（"exteriorWall" など、テクスチャを貼る部位）ごとに 1 つだけ保持する。
 * 色・仕上げが変わったら、どの部位からも使われなくなった古いテクスチャを破棄する。
 */
export function getPbr(kind: SurfaceKind, color: string, slot: string): PbrSet {
  const recipeKey = (kind.type === "wall" || kind.type === "roof" || kind.type === "floor" ? `${kind.type}:${kind.finish}` : kind.type) as keyof typeof RECIPES
  const key = `${recipeKey}|${color.toLowerCase()}`
  let set = cache.get(key)
  if (!set) {
    const r = RECIPES[recipeKey]
    set = bake(r.gen, color, r.tile, { normalScale: r.normalScale, metalness: "metalness" in r ? r.metalness : 0 })
    cache.set(key, set)
  }
  const prev = slots.get(slot)
  slots.set(slot, key)
  if (prev && prev !== key && ![...slots.values()].includes(prev)) {
    const old = cache.get(prev)
    if (old) disposeSet(old)
    cache.delete(prev)
  }
  return set
}

export function applyPbr(mat: THREE.MeshStandardMaterial, set: PbrSet) {
  mat.map = set.map
  mat.normalMap = set.normalMap
  mat.roughnessMap = set.roughnessMap
  mat.normalScale.set(set.normalScale, set.normalScale)
  mat.roughness = 1
  mat.metalness = set.metalness
  mat.color.set("#ffffff")
  mat.needsUpdate = true
}

export function releasePbrSlots() {
  for (const v of cache.values()) disposeSet(v)
  cache.clear()
  slots.clear()
}

import type { BuildingSpec, FloorSpec, Materials, Rect, RoofType, RoomLabel, Side, WallKind, WallRect } from "@/lib/building-spec"
import { DEFAULT_MATERIALS, faceEntranceToRoad } from "./building-spec.ts"
import { roomBox, type FurnitureItem } from "./furniture.ts"
import { placePlanFixtures } from "./plan-fixtures.ts"
import { autoStairs, forceStair, stairFromHints, type StairSpec } from "./stairs.ts"

/**
 * 間取り図（2D 平面図画像）から壁・開口部・部屋を抽出する。ブラウザ内で完結（外部送信なし）。
 *
 * 1. 暗く彩度の低い画素を壁候補として二値化（auto: しきい値を大津の方法で決める。色付きの部屋の塗りは壁にしない）
 * 2. モルフォロジー開処理で文字・寸法線・建具記号などの細線を除去（auto: 壁の太さを測り、それより細い線だけを消す）
 * 3. 小さな連結成分（家具アイコン等）と、建物の外形の外にある線（敷地の破線・階の表記）を除去
 * 4. 5cm グリッドに量子化し、壁の途切れ（0.5〜2.8m）を開口部として検出
 * 5. 外部領域を塗りつぶし、外周の開口を窓・掃き出し窓・玄関、内部の開口をドアに分類
 * 6. 同種セルを矩形に統合して FloorSpec を返す
 */

export type FloorplanOptions = {
  /** true = しきい値・細線の除去を画像から自動で決める（threshold / cleanRadius は無視） */
  auto?: boolean
  threshold: number
  cleanRadius: number
  widthMeters: number
  floorHeight: number
  level: number
}

export const DEFAULT_FLOORPLAN_OPTIONS: FloorplanOptions = {
  auto: true,
  threshold: 110,
  cleanRadius: 2,
  widthMeters: 9.1,
  floorHeight: 2.8,
  level: 0,
}

export type FloorplanResult = {
  floor: FloorSpec
  footprint: { width: number; depth: number }
  bboxPx: { x: number; y: number; w: number; h: number }
  pxPerMeter: number
  stats: { walls: number; windows: number; doors: number; rooms: number; cellMeters: number }
  /** 実際に使った値（auto のときは画像から推定した値） */
  applied: { threshold: number; cleanRadius: number; wallPx: number }
  /**
   * 縮尺の確かめ: 壁の厚み（m）が住宅の一般的な 0.12〜0.18m から大きく外れていれば、図面の横幅の入力が違う可能性が高い。
   * suggestedWidth は壁の厚みを 0.15m とみなしたときの横幅（外れていないときは null）
   */
  scaleCheck: { wallMeters: number; suggestedWidth: number | null }
  /** 階段の記号（等間隔の平行な細線）が描かれた範囲。axis = 段の線に直交する向き（上り下りの向き）。auto のときだけ */
  stairHints: StairHint[]
  /** 設備の記号（auto のときだけ） */
  fixtures: FixtureHint[]
  /**
   * 床面積（m²、壁の中心線で囲んだ面積の近似 = 外形の面積 − 外周 × 壁厚の半分。バルコニー・出窓は含まない）。
   * 物件情報の建物面積（延床面積）と比べて縮尺を決めるのに使う
   */
  floorArea: number
  /** 部屋が色で塗り分けられた図面か（不動産サイトの図面）。色付きの図面だけの判定を切り替える */
  colored?: boolean
}

/** strong = 等間隔の平行線 4 本以上（階段で確定）、weak = 2 本以上（回り階段の一部など。上の階の確定した記号の向きを決めるのに使う） */
export type StairHint = Rect & { axis: "x" | "z"; lines: number; strong: boolean }

/** 設備の記号（壁より細い線で描かれた箱）。kind は部屋と並びから推定（推定できなければ null） */
export type FixtureHint = Rect & {
  kind: "kitchen" | "fridge" | "washbasin" | "washer" | "toilet" | "bathtub" | null
  /** 各辺（北 -z・南 +z・西 -x・東 +x）に線が乗っている割合。破線（冷蔵庫の置き場）の端を見分ける */
  lines: [number, number, number, number]
}

/**
 * 細線の連結成分のうち、箱の形（外接矩形の 4 辺に線が乗る）で、家具・設備の大きさのもの。戻り値は画素座標
 * - 破線（冷蔵庫の置き場など）も拾えるよう、細線を 1px 太らせてからつなぐ
 */
export function findFixtureBoxes(thin: Uint8Array, solid: Uint8Array | null, w: number, h: number, ppm: number): { x0: number; y0: number; x1: number; y1: number; lines: [number, number, number, number] }[] {
  const grown = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    if (thin[i] || thin[i - 1] || thin[i + 1] || thin[i - w] || thin[i + w]) grown[i] = 1
  }
  const seen = new Uint8Array(w * h)
  const out: { x0: number; y0: number; x1: number; y1: number; lines: [number, number, number, number] }[] = []
  const st: number[] = []
  for (let p = 0; p < w * h; p++) {
    if (!grown[p] || seen[p]) continue
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    const pix: number[] = []
    st.push(p)
    seen[p] = 1
    while (st.length) {
      const q = st.pop()!
      pix.push(q)
      const x = q % w
      const y = (q - x) / w
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const n = ny * w + nx
        if (grown[n] && !seen[n]) { seen[n] = 1; st.push(n) }
      }
    }
    const bw = (x1 - x0 + 1) / ppm
    const bh = (y1 - y0 + 1) / ppm
    const long = Math.max(bw, bh)
    const short = Math.min(bw, bh)
    if (long < 0.4 || long > 3.0 || short < 0.3 || short > 1.1) continue
    // 4 辺それぞれに線が半分以上乗っている（箱）
    const band = Math.max(2, Math.round(ppm * 0.04))
    const cover = (horizontal: boolean, at: number) => {
      const n = horizontal ? x1 - x0 + 1 : y1 - y0 + 1
      let hit = 0
      for (let k = 0; k < n; k++) {
        let any = false
        for (let d = 0; d < band && !any; d++) {
          const x = horizontal ? x0 + k : at + (at === x0 ? d : -d)
          const y = horizontal ? at + (at === y0 ? d : -d) : y0 + k
          if (grown[y * w + x]) any = true
        }
        if (any) hit++
      }
      return hit / n
    }
    // 壁際に置かれた設備は、壁側の辺が壁と一体になって細線に残らない。辺の外側 0.1m 以内に壁があればその辺も閉じているとみなす
    const wallAlong = (horizontal: boolean, at: number, dir: number) => {
      if (!solid) return 0
      const n = horizontal ? x1 - x0 + 1 : y1 - y0 + 1
      const reach = Math.max(2, Math.round(ppm * 0.1))
      let hit = 0
      for (let k = 0; k < n; k++) {
        let any = false
        for (let d = 0; d <= reach && !any; d++) {
          const x = horizontal ? x0 + k : at + dir * d
          const y = horizontal ? at + dir * d : y0 + k
          if (x >= 0 && y >= 0 && x < w && y < h && solid[y * w + x]) any = true
        }
        if (any) hit++
      }
      return hit / n
    }
    const sides = [
      Math.max(cover(true, y0), wallAlong(true, y0, -1)),
      Math.max(cover(true, y1), wallAlong(true, y1, 1)),
      Math.max(cover(false, x0), wallAlong(false, x0, -1)),
      Math.max(cover(false, x1), wallAlong(false, x1, 1)),
    ]
    const lines: [number, number, number, number] = [cover(true, y0), cover(true, y1), cover(false, x0), cover(false, x1)]
    const lineSides = lines.filter(c => c >= 0.5).length
    // 線で 2 辺以上（L 字以上）あり、3 辺以上が線か壁で閉じている（水栓など記号の一部が外へはみ出す辺は 1 つまで許す）
    if (lineSides < 2 || sides.filter(c => c >= 0.5).length < 3) continue
    out.push({ x0, y0, x1, y1, lines: lines.map(v => Math.round(v * 100) / 100) as [number, number, number, number] })
  }
  return out
}

/**
 * 階段の記号を探す: 壁より細い線（開処理で消えた画素）のうち、長さ 0.55〜1.2m の平行な線分が
 * 0.12〜0.4m の等間隔で 4 本以上並ぶ範囲。戻り値は画像の画素座標
 */
export function findStairSymbols(thin: Uint8Array, w: number, h: number, ppm: number, allowThree = false): { x0: number; y0: number; x1: number; y1: number; axis: "x" | "z"; lines: number; strong: boolean }[] {
  const out: { x0: number; y0: number; x1: number; y1: number; axis: "x" | "z"; lines: number; strong: boolean }[] = []
  const minL = 0.55 * ppm
  const maxL = 1.2 * ppm
  for (const horizontal of [true, false]) {
    // 線分を集める（横線なら各行の連続、縦線なら各列の連続）
    const segs: { a0: number; a1: number; p: number }[] = []
    const outer = horizontal ? h : w
    const inner = horizontal ? w : h
    for (let o = 0; o < outer; o++) {
      let start = -1
      for (let i = 0; i <= inner; i++) {
        const v = i < inner && thin[horizontal ? o * w + i : i * w + o]
        if (v && start < 0) start = i
        if (!v && start >= 0) {
          if (i - start >= minL && i - start <= maxL) segs.push({ a0: start, a1: i, p: o })
          start = -1
        }
      }
    }
    // 端がそろった線分をまとめ、隣り合う行（線の太さ）を 1 本の線にする
    const tol = 0.12 * ppm
    const used = new Uint8Array(segs.length)
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue
      const group = [segs[i]]
      used[i] = 1
      for (let j = i + 1; j < segs.length; j++) {
        if (used[j]) continue
        if (Math.abs(segs[j].a0 - segs[i].a0) <= tol && Math.abs(segs[j].a1 - segs[i].a1) <= tol) {
          group.push(segs[j])
          used[j] = 1
        }
      }
      const ps = [...new Set(group.map(g => g.p))].sort((a, b) => a - b)
      const all: number[] = []
      for (const p of ps) if (!all.length || p - all[all.length - 1] > 2) all.push(p)
      else all[all.length - 1] = p
      // 間隔が大きく跳ぶところで分ける（離れた建具の線・窓枠が、段の線と同じ端の位置でまとまるのを防ぐ）
      const clusters: number[][] = [[]]
      for (const p of all) {
        const cur = clusters[clusters.length - 1]
        if (cur.length && p - cur[cur.length - 1] > 0.45 * ppm) clusters.push([p])
        else cur.push(p)
      }
      for (const lines of clusters) {
      if (lines.length < 2) continue
      const gaps = lines.slice(1).map((p, k) => p - lines[k]).sort((a, b) => a - b)
      const med = gaps[Math.floor(gaps.length / 2)]
      // 等間隔でない（間隔のばらつきが大きい）ものは家具や文字の並び
      const regular = gaps.filter(g => Math.abs(g - med) <= Math.max(2, med * 0.35)).length >= gaps.length * 0.6
      // 段の線は 4 本以上。矢印や回り段で途切れて 3 本しか取れない図面もあるので、蹴上げらしい間隔（0.15〜0.35m）でそろっていれば 3 本でもよい
      const strong = regular && ((lines.length >= 4 && med >= 0.12 * ppm && med <= 0.4 * ppm) || (allowThree && lines.length === 3 && med >= 0.15 * ppm && med <= 0.35 * ppm && gaps[gaps.length - 1] - gaps[0] <= 0.06 * ppm))
      if (!strong && (gaps[gaps.length - 1] > 0.7 * ppm || gaps[0] < 0.08 * ppm)) continue
      const a0 = Math.min(...group.map(g => g.a0))
      const a1 = Math.max(...group.map(g => g.a1))
      const p0 = lines[0]
      const p1 = lines[lines.length - 1]
      out.push(horizontal ? { x0: a0, x1: a1, y0: p0, y1: p1, axis: "z", lines: lines.length, strong } : { x0: p0, x1: p1, y0: a0, y1: a1, axis: "x", lines: lines.length, strong })
      }
    }
  }
  return out
}

/** 彩度（max - min）がこれ以上の画素は壁にしない（部屋の色塗り・色付きの文字） */
const MAX_WALL_SATURATION = 60

/** 大津の方法: 輝度ヒストグラムを 2 群に分けるしきい値 */
export function otsuThreshold(hist: ArrayLike<number>): number {
  let total = 0
  let sum = 0
  for (let i = 0; i < 256; i++) {
    total += hist[i]
    sum += i * hist[i]
  }
  let wB = 0
  let sumB = 0
  let best = 0
  let bestT = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) {
      best = between
      bestT = t
    }
  }
  return bestT + 1
}

/**
 * 壁の太さ（px）の推定: 各画素の横・縦の連続長のうち短い方を太さとみなし、細長い部分（長い方が短い方の 3 倍以上）の中央値をとる。
 * 文字・記号は細長くないので数に入りにくく、壁が支配的になる
 */
export function estimateWallPx(mask: Uint8Array, w: number, h: number): number {
  const hr = new Uint16Array(w * h)
  const vr = new Uint16Array(w * h)
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      if (!mask[y * w + x]) { x++; continue }
      let e = x
      while (e < w && mask[y * w + e]) e++
      for (let k = x; k < e; k++) hr[y * w + k] = e - x
      x = e
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0
    while (y < h) {
      if (!mask[y * w + x]) { y++; continue }
      let e = y
      while (e < h && mask[e * w + x]) e++
      for (let k = y; k < e; k++) vr[k * w + x] = e - y
      y = e
    }
  }
  const counts = new Uint32Array(64)
  let n = 0
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue
    const t = Math.min(hr[i], vr[i])
    const l = Math.max(hr[i], vr[i])
    if (t >= 2 && l >= 3 * t && t < 64) {
      counts[t]++
      n++
    }
  }
  if (!n) return 0
  // 窓の二重線・階段の段の線も細長いので、中央値ではなく 70 パーセンタイル（太い側）をとる
  let acc = 0
  for (let t = 0; t < 64; t++) {
    acc += counts[t]
    if (acc >= n * 0.7) return t
  }
  return 0
}

const EMPTY = 0
const WALL = 1
const GAP_H = 2
const GAP_V = 3
const WINDOW = 4
const DOOR = 5
const GLASSDOOR = 6

const KIND_OF: Record<number, WallKind> = { [WALL]: "wall", [WINDOW]: "window", [DOOR]: "door", [GLASSDOOR]: "glassdoor" }

function boxFilter(src: Uint8Array, w: number, h: number, r: number, mode: "erode" | "dilate"): Uint8Array {
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  const size = 2 * r + 1
  const test = (count: number, n: number) => (mode === "erode" ? count === n : count > 0)
  for (let y = 0; y < h; y++) {
    let count = 0
    const row = y * w
    for (let x = -r; x < w + r; x++) {
      const add = x + r
      if (add >= 0 && add < w) count += src[row + add]
      const rem = x - r - 1
      if (rem >= 0 && rem < w) count -= src[row + rem]
      if (x >= 0 && x < w) {
        const n = Math.min(w - 1, x + r) - Math.max(0, x - r) + 1
        tmp[row + x] = test(count, mode === "erode" ? Math.min(n, size) : n) ? 1 : 0
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0
    for (let y = -r; y < h + r; y++) {
      const add = y + r
      if (add >= 0 && add < h) count += tmp[add * w + x]
      const rem = y - r - 1
      if (rem >= 0 && rem < h) count -= tmp[rem * w + x]
      if (y >= 0 && y < h) {
        const n = Math.min(h - 1, y + r) - Math.max(0, y - r) + 1
        out[y * w + x] = test(count, n) ? 1 : 0
      }
    }
  }
  return out
}

function keepLargeComponents(mask: Uint8Array, w: number, h: number, margin = 0, minLongPx = 0, wallPx = 0): Uint8Array {
  const labels = new Int32Array(w * h).fill(-1)
  const areas: number[] = []
  const boxes: [number, number, number, number][] = []
  const stack: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i] !== -1) continue
    const id = areas.length
    let area = 0
    const box: [number, number, number, number] = [w, h, -1, -1]
    stack.push(i)
    labels[i] = id
    while (stack.length) {
      const p = stack.pop()!
      area++
      const x = p % w
      const y = (p - x) / w
      if (x < box[0]) box[0] = x
      if (y < box[1]) box[1] = y
      if (x > box[2]) box[2] = x
      if (y > box[3]) box[3] = y
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of nb) {
        if (q >= 0 && mask[q] && labels[q] === -1) {
          labels[q] = id
          stack.push(q)
        }
      }
    }
    areas.push(area)
    boxes.push(box)
  }
  const max = Math.max(0, ...areas)
  // 建物の外形 = 大きな成分（最大の 15% 以上）を合わせた範囲。白黒の図面は窓・扉で外壁が切れて複数の成分になる。
  // その外にあるもの（敷地の破線・方位記号・「1F」などの表記）は捨てる
  const main: [number, number, number, number] = [w, h, -1, -1]
  areas.forEach((a, k) => {
    if (a < max * 0.15) return
    const b = boxes[k]
    main[0] = Math.min(main[0], b[0])
    main[1] = Math.min(main[1], b[1])
    main[2] = Math.max(main[2], b[2])
    main[3] = Math.max(main[3], b[3])
  })
  const inMain = (b: [number, number, number, number]) => b[0] >= main[0] - margin && b[1] >= main[1] - margin && b[2] <= main[2] + margin && b[3] <= main[3] + margin
  // 壁の網から離れた塊は、壁らしい（長さ minLongPx 以上で、面積が「長さ × 壁の太さ × 2.5」以下の細長いもの）ときだけ残す。
  // 文字の塊・家具や設備の記号・エアコンの表記は落ちる
  const wallLike = (k: number) => {
    if (minLongPx <= 0) return true
    const b = boxes[k]
    const long = Math.max(b[2] - b[0], b[3] - b[1]) + 1
    return long >= minLongPx && areas[k] <= long * Math.max(2, wallPx) * 2.5
  }
  const keep = areas.map((a, k) => a >= Math.max(30, max * 0.02) && (margin <= 0 || inMain(boxes[k])) && (a >= max * 0.15 || wallLike(k)))
  const out = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) if (labels[i] >= 0 && keep[labels[i]]) out[i] = 1
  return out
}

type Grid = { cols: number; rows: number; cells: Uint8Array }

/** 同じキーのセルを貪欲法で矩形に統合する */
function greedyRects(grid: Grid, keyOf: (i: number) => number): { c: number; r: number; w: number; h: number; key: number }[] {
  const { cols, rows } = grid
  const used = new Uint8Array(cols * rows)
  const rects: { c: number; r: number; w: number; h: number; key: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const key = keyOf(i)
      if (key < 0 || used[i]) continue
      let w = 1
      while (c + w < cols && !used[i + w] && keyOf(i + w) === key) w++
      let h = 1
      outer: while (r + h < rows) {
        for (let k = 0; k < w; k++) {
          const j = (r + h) * cols + c + k
          if (used[j] || keyOf(j) !== key) break outer
        }
        h++
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) used[(r + y) * cols + c + x] = 1
      rects.push({ c, r, w, h, key })
    }
  }
  return rects
}

export function analyzeFloorplan(image: ImageData, opts: FloorplanOptions): FloorplanResult {
  const { width: w, height: h, data } = image
  const lum = new Uint8Array(w * h)
  const gray = new Uint8Array(w * h)
  const hist = new Uint32Array(256)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const a = data[i * 4 + 3]
    lum[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    gray[i] = a > 40 && Math.max(r, g, b) - Math.min(r, g, b) < MAX_WALL_SATURATION ? 1 : 0
    if (a > 40) hist[lum[i]]++
  }
  // 白黒の図面は黒線と白地、色付きの図面（不動産サイト等）は灰色の壁と明るい色の塗りに分かれる
  const threshold = opts.auto ? Math.min(215, Math.max(80, otsuThreshold(hist))) : opts.threshold
  const raw = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) raw[i] = gray[i] && lum[i] < threshold ? 1 : 0
  const wallPx = estimateWallPx(raw, w, h)
  // 壁より細い線（建具・家具の記号・寸法線）だけを消す。開処理の窓 2r+1 は壁の太さの半分程度に抑える
  // （壁の芯は縁のにじみより細く、窓を太くすると壁が途切れる。文字の塊は後段の成分の選別で落とす）
  const cleanRadius = opts.auto ? Math.max(1, Math.min(8, Math.floor((wallPx * 0.55 - 1) / 2))) : opts.cleanRadius
  let mask: Uint8Array = raw
  if (cleanRadius > 0) {
    mask = boxFilter(boxFilter(raw, w, h, cleanRadius, "erode"), w, h, cleanRadius, "dilate")
  }
  // 壁より細い線（階段の段・建具・文字）。壁の太さの 6 割の窓で開処理した残りを壁とみなし、それ以外を細線とする（壁の際は除く）
  let thin: Uint8Array | null = null
  let solidForFixtures: Uint8Array | null = null
  if (opts.auto) {
    const r2 = Math.max(cleanRadius + 1, Math.floor((wallPx * 0.6 - 1) / 2))
    const solid = boxFilter(boxFilter(raw, w, h, r2, "erode"), w, h, r2, "dilate")
    solidForFixtures = solid
    const near = boxFilter(solid, w, h, 2, "dilate")
    thin = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) thin[i] = raw[i] && !near[i] ? 1 : 0
  }
  if (opts.auto) {
    // 壁より格段に太い塗りつぶしの塊（階の表記の丸いバッジ・方位の塗り）は壁ではない。壁の網に接していると成分の選別で落ちず、
    // 3D に黒い塊ができる。中の白抜きの文字の穴を埋めてから、壁の太さの 3.2 倍（二重の壁より太い）を超える太さが残る芯を求め、その周りごと外す
    const rb = Math.max(3, Math.round(wallPx * 1.6))
    const closedMask = boxFilter(boxFilter(mask, w, h, 3, "dilate"), w, h, 3, "erode")
    const core = boxFilter(closedMask, w, h, rb, "erode")
    // 芯のうち、丸く詰まった小さな塊（縦横比 1.4 以下・外接矩形の 55% 以上が埋まる・画像の 15% 以下）で、中に白抜きの文字があるものだけ。
    // 太い壁（細長い）・塗りつぶした範囲（大きい・文字が無い）は残す
    {
      const seen = new Uint8Array(w * h)
      const st: number[] = []
      for (let i = 0; i < core.length; i++) {
        if (!core[i] || seen[i]) continue
        const comp: number[] = []
        let x0 = w, y0 = h, x1 = -1, y1 = -1
        st.push(i)
        seen[i] = 1
        while (st.length) {
          const p = st.pop()!
          comp.push(p)
          const x = p % w, y = (p - x) / w
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && core[q] && !seen[q]) { seen[q] = 1; st.push(q) }
        }
        const bw0 = x1 - x0 + 1 + 2 * rb, bh0 = y1 - y0 + 1 + 2 * rb
        const round = Math.max(bw0, bh0) / Math.min(bw0, bh0) <= 1.4 && comp.length >= (x1 - x0 + 1) * (y1 - y0 + 1) * 0.55 && Math.max(bw0, bh0) <= Math.max(w, h) * 0.15
        // 表記のバッジは中に白抜きの文字がある。文字の無い塗りつぶし（バルコニー・吹き抜けの灰色の四角）は消さない
        let holes = 0
        for (const p of comp) if (!mask[p]) holes++
        if (!round || holes < comp.length * 0.08) for (const p of comp) core[p] = 0
      }
    }
    let any = false
    for (let i = 0; i < core.length && !any; i++) if (core[i]) any = true
    if (any) {
      const blob = boxFilter(core, w, h, rb + 2, "dilate")
      const trimmed = new Uint8Array(w * h)
      for (let i = 0; i < mask.length; i++) trimmed[i] = mask[i] && !blob[i] ? 1 : 0
      mask = trimmed
    }
    // 長さの基準（0.9m）に要る縮尺は、いったん最大成分の幅から求める
    const pre = keepLargeComponents(mask, w, h, Math.max(4, wallPx))
    let x0 = w, x1 = -1
    for (let i = 0; i < pre.length; i++) if (pre[i]) { const x = i % w; if (x < x0) x0 = x; if (x > x1) x1 = x }
    const ppmGuess = x1 > x0 ? (x1 - x0 + 1) / Math.max(1, opts.widthMeters) : 0
    mask = keepLargeComponents(mask, w, h, Math.max(4, wallPx), ppmGuess * 0.9, wallPx)
  } else {
    mask = keepLargeComponents(mask, w, h)
  }

  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (maxX < 0) throw new Error("壁を検出できませんでした。しきい値を上げるか、線の除去強度を下げてください。")
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const ppm = bw / Math.max(1, opts.widthMeters)
  const cellPx = Math.max(1, ppm * 0.05)
  const cellM = cellPx / ppm
  // 色付きの図面か（部屋が色で塗られている）。玄関は灰色の土間で描かれることが多い
  let tinted = 0
  let light = 0
  for (let i = 0; i < w * h; i += 7) {
    if (lum[i] < 200 || lum[i] > 245) continue
    light++
    const sat = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    if (sat >= 18) tinted++
  }
  const colored = light > 0 && tinted / light > 0.3
  // 格子の原点（画素）
  const gx = minX
  const gy = minY
  // 外周の余白（セル）。auto は外形を閉じる半径（0.5m）より広くとる（端で閉じると外部の塗りつぶしの起点が消える）
  const P = opts.auto ? Math.round(0.5 / cellM) + 3 : 3
  const cols = Math.ceil(bw / cellPx) + 2 * P
  const rows = Math.ceil(bh / cellPx) + 2 * P
  const hit = new Float32Array(cols * rows)
  const tot = new Float32Array(cols * rows)
  // 部屋の塗り（淡い色）の画素数。色付きの図面では、塗られた範囲が建物の内側になる
  const tint = new Float32Array(cols * rows)
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const c = Math.floor((x - gx) / cellPx) + P
    const r = Math.floor((y - gy) / cellPx) + P
    const k = r * cols + c
    const i = y * w + x
    tot[k]++
    if (mask[i]) hit[k]++
    else if (lum[i] >= 150 && Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= 12) tint[k]++
  }
  const cells = new Uint8Array(cols * rows)
  for (let k = 0; k < cells.length; k++) cells[k] = tot[k] > 0 && hit[k] / tot[k] >= 0.4 ? WALL : EMPTY
  if (opts.auto && wallPx / cellPx >= 1.8) {
    // 壁は 2 セル以上の厚みがある。どの 2×2 の塊にも入らない 1 セル幅の線（階段の段・建具の線の残り）は壁にしない
    const keep = new Uint8Array(cells.length)
    for (let r = 0; r + 1 < rows; r++) for (let c = 0; c + 1 < cols; c++) {
      const k = r * cols + c
      if (cells[k] && cells[k + 1] && cells[k + cols] && cells[k + cols + 1]) keep[k] = keep[k + 1] = keep[k + cols] = keep[k + cols + 1] = 1
    }
    for (let k = 0; k < cells.length; k++) if (!keep[k]) cells[k] = EMPTY
    // 線を落としたことで壁の網から離れた小さな塊（文字「DN」・設備の記号の残り）は壁にしない。
    // 長辺 0.6m 未満の孤立した塊だけを落とす（壁につながった短い袖壁は残る）
    const label = new Int32Array(cells.length).fill(-1)
    const st: number[] = []
    for (let k = 0; k < cells.length; k++) {
      if (!cells[k] || label[k] >= 0) continue
      const comp: number[] = []
      let c0 = cols, c1 = -1, r0 = rows, r1 = -1
      st.push(k)
      label[k] = k
      while (st.length) {
        const q = st.pop()!
        comp.push(q)
        const c = q % cols
        const r = (q - c) / cols
        if (c < c0) c0 = c
        if (c > c1) c1 = c
        if (r < r0) r0 = r
        if (r > r1) r1 = r
        for (const n of [c > 0 ? q - 1 : -1, c < cols - 1 ? q + 1 : -1, r > 0 ? q - cols : -1, r < rows - 1 ? q + cols : -1]) {
          if (n >= 0 && cells[n] && label[n] < 0) {
            label[n] = k
            st.push(n)
          }
        }
      }
      if (Math.max(c1 - c0 + 1, r1 - r0 + 1) * cellM < 0.6) for (const q of comp) cells[q] = EMPTY
    }
  }
  const at = (c: number, r: number) => cells[r * cols + c]

  // 壁の途切れを開口部候補としてマーク
  const minGap = Math.round(0.5 / cellM)
  const maxGap = Math.round(2.8 / cellM)
  // 開口の両側に要る壁の長さ（0.12m まで下げると部屋の中の線の切れ端まで開口になる。撮影した間取り・サンプルで確認済み）
  const minRun = Math.max(2, Math.round(0.25 / cellM))
  /** 横の行 o・位置 i（縦なら列 o・位置 i）の壁が、直交方向に minRun 以上続いているか */
  // T 字に通り抜ける壁だけ（L 字の隅の折り返しは、部屋の中の線の切れ端と区別できないので使わない）
  const anchored = (horizontal: boolean, o: number, i: number) => {
    const len: number[] = []
    for (const d of [-1, 1]) {
      let n = 0
      for (let s = 1; s <= minRun * 2; s++) {
        const v = horizontal ? (o + d * s >= 0 && o + d * s < rows ? at(i, o + d * s) : EMPTY) : (o + d * s >= 0 && o + d * s < cols ? at(o + d * s, i) : EMPTY)
        if (v !== WALL) break
        n++
      }
      len.push(n)
    }
    return Math.min(...len) >= 2 && len[0] + len[1] + 1 >= minRun + 2
  }
  // 隅のすぐ横のドア（片側が直交する壁の厚みだけ）は、外壁の網が閉じていない図面（塗りの縁を外形にする図面）だけで拾う
  let anchorOn = false
  const markGaps = (horizontal: boolean) => {
    const outerN = horizontal ? rows : cols
    const innerN = horizontal ? cols : rows
    for (let o = 0; o < outerN; o++) {
      const runs: [number, number][] = []
      let start = -1
      for (let i = 0; i <= innerN; i++) {
        const v = i < innerN ? (horizontal ? at(i, o) : at(o, i)) : EMPTY
        if (v === WALL && start < 0) start = i
        if (v !== WALL && start >= 0) {
          runs.push([start, i])
          start = -1
        }
      }
      for (let k = 0; k + 1 < runs.length; k++) {
        const [a0, a1] = runs[k]
        const [b0, b1] = runs[k + 1]
        const gap = b0 - a1
        if (gap < minGap || gap > maxGap) continue
        // 開口の脇の壁が、直交する壁の厚みだけのこと（隅のすぐ横のドア）。その壁が直交方向に続いていれば脇の壁とみなす
        // （片側は通常の長さの壁が要る。両側とも直交する壁の厚みだけなら、部屋の中を横切る行なので開口にしない）
        const okA = a1 - a0 >= minRun
        const okB = b1 - b0 >= minRun
        const anchoredRun = (r0: number, r1: number) => { for (let i = r0; i < r1; i++) if (anchored(horizontal, o, i)) return true; return false }
        const longA = a1 - a0 >= minRun * 2
        const longB = b1 - b0 >= minRun * 2
        if (!(okA && okB) && !(anchorOn && gap * cellM <= 1.0 && ((longA && anchoredRun(b0, b1)) || (longB && anchoredRun(a0, a1))))) continue
        for (let i = a1; i < b0; i++) {
          const idx = horizontal ? o * cols + i : i * cols + o
          if (cells[idx] === EMPTY) cells[idx] = horizontal ? GAP_H : GAP_V
        }
      }
    }
  }
  markGaps(true)
  markGaps(false)

  // 外部領域（開口を閉じた状態で外周から塗りつぶし）
  // auto のときは壁の網を 0.5m 閉じた外形を壁とみなす。窓まわりの枠の切れ端で外壁に小さな穴が残っても、部屋が外部につながらない
  // 塗られたセル（色付きの図面だけ）。外壁が淡い灰色の柱・窓・バルコニーの線で描かれ、壁の網が閉じていなくても、塗りの縁を建物の外形にする
  const filled = new Uint8Array(cells.length)
  if (opts.auto && colored) for (let k = 0; k < cells.length; k++) filled[k] = cells[k] === EMPTY && tot[k] > 0 && tint[k] / tot[k] >= 0.5 ? 1 : 0
  const floodOutside = (useFill: boolean) => {
    let barrier = cells
    if (opts.auto) {
      const R = Math.max(2, Math.round(0.5 / cellM))
      const solid = new Uint8Array(cells.length)
      for (let k = 0; k < cells.length; k++) solid[k] = cells[k] !== EMPTY || (useFill && filled[k]) ? 1 : 0
      const closed = boxFilter(boxFilter(solid, cols, rows, R, "dilate"), cols, rows, R, "erode")
      barrier = new Uint8Array(cells.length)
      for (let k = 0; k < cells.length; k++) barrier[k] = cells[k] !== EMPTY || closed[k] ? WALL : EMPTY
    }
    const out = new Uint8Array(cols * rows)
    const st: number[] = []
    for (let c = 0; c < cols; c++) { st.push(c, (rows - 1) * cols + c) }
    for (let r = 0; r < rows; r++) { st.push(r * cols, r * cols + cols - 1) }
    while (st.length) {
      const p = st.pop()!
      if (out[p] || barrier[p] !== EMPTY) continue
      out[p] = 1
      const c = p % cols
      const r = (p - c) / cols
      if (c > 0) st.push(p - 1)
      if (c < cols - 1) st.push(p + 1)
      if (r > 0) st.push(p - cols)
      if (r < rows - 1) st.push(p + cols)
    }
    return out
  }
  let outside = floodOutside(false)
  // 塗られた部屋が外につながってしまう（外壁の網が閉じていない）ときだけ、塗りの縁を外形にする。
  // 外壁が閉じている図面（窓のガラスの帯が淡く塗られているものも）は変えない
  let leakedFill = 0
  for (let k = 0; k < cells.length; k++) if (filled[k] && outside[k]) leakedFill++
  const useFill = leakedFill * cellM * cellM >= 1.0
  if (useFill) {
    anchorOn = true
    markGaps(true)
    markGaps(false)
    outside = floodOutside(true)
  }
  const stack: number[] = []

  // 塗りの縁が壁なしで外に面しているところは、外壁の窓（淡い線で描かれた窓・掃き出し窓・出窓の付け根）
  if (useFill) {
    for (let k = 0; k < cells.length; k++) {
      if (!filled[k] || cells[k] !== EMPTY || outside[k]) continue
      const c = k % cols
      if ((c > 0 && outside[k - 1]) || (c < cols - 1 && outside[k + 1])) cells[k] = GAP_V
      else if ((k >= cols && outside[k - cols]) || (k + cols < cells.length && outside[k + cols])) cells[k] = GAP_H
    }
  }

  // 開口部の連結成分ごとに外部/内部を判定して種類を決める
  const seen = new Uint8Array(cols * rows)
  type Gap = { idx: number[]; length: number; exterior: boolean; cz: number; cc: number; horizontal: boolean; a0: number; a1: number }
  const gaps: Gap[] = []
  for (let p = 0; p < cells.length; p++) {
    const v = cells[p]
    if ((v !== GAP_H && v !== GAP_V) || seen[p]) continue
    const idx: number[] = []
    let exterior = false
    let minA = Infinity, maxA = -Infinity, sumR = 0
    stack.push(p)
    seen[p] = 1
    while (stack.length) {
      const q = stack.pop()!
      idx.push(q)
      const c = q % cols
      const r = (q - c) / cols
      sumR += r
      const along = v === GAP_H ? c : r
      minA = Math.min(minA, along)
      maxA = Math.max(maxA, along)
      // 壁の厚み方向に 0.6m まで走査し、外部に抜けるか確認
      const steps = Math.round(0.6 / cellM)
      for (const dir of [-1, 1]) {
        for (let s = 1; s <= steps; s++) {
          const cc = v === GAP_H ? c : c + dir * s
          const rr = v === GAP_H ? r + dir * s : r
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) { exterior = true; break }
          const k = rr * cols + cc
          if (outside[k]) { exterior = true; break }
          if (cells[k] === EMPTY) break
        }
      }
      for (const n of [c > 0 ? q - 1 : -1, c < cols - 1 ? q + 1 : -1, r > 0 ? q - cols : -1, r < rows - 1 ? q + cols : -1]) {
        if (n >= 0 && !seen[n] && cells[n] === v) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    let sumC = 0
    for (const q of idx) sumC += q % cols
    gaps.push({ idx, length: (maxA - minA + 1) * cellM, exterior, cz: sumR / idx.length, cc: sumC / idx.length, horizontal: v === GAP_H, a0: minA, a1: maxA })
  }
  /** 開口の内側 0.35m の床の色（色付きの図面で、灰色の土間 = 玄関かを見る） */
  const insideIsGrayFloor = (g: Gap) => {
    const steps = Math.round(0.35 / cellM) + 2
    for (const dir of [-1, 1]) {
      const c = Math.round(g.horizontal ? g.cc : g.cc + dir * steps)
      const r = Math.round(g.horizontal ? g.cz + dir * steps : g.cz)
      if (c < 0 || r < 0 || c >= cols || r >= rows || outside[r * cols + c]) continue
      let sr = 0, sg = 0, sb = 0, n = 0
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const px = Math.floor(gx + (c - P + 0.5) * cellPx) + dx
        const py = Math.floor(gy + (r - P + 0.5) * cellPx) + dy
        if (px < 0 || py < 0 || px >= w || py >= h) continue
        const i = py * w + px
        if (raw[i] || lum[i] < 150) continue
        sr += data[i * 4]; sg += data[i * 4 + 1]; sb += data[i * 4 + 2]; n++
      }
      if (n >= 5 && roomTone(sr / n, sg / n, sb / n) === "neutral" && (sr + sg + sb) / (3 * n) < 245) return true
    }
    return false
  }
  /** 同じ壁の線上で、すぐ隣に別の外部開口がある（文字・記号で分断された 1 つの窓） */
  const splitWindow = (g: Gap) =>
    gaps.some(o => o !== g && o.exterior && o.horizontal === g.horizontal &&
      Math.abs((g.horizontal ? o.cz - g.cz : o.cc - g.cc)) < 2 &&
      Math.min(Math.abs(o.a0 - g.a1), Math.abs(g.a0 - o.a1)) <= Math.round(0.4 / cellM))
  // 玄関: 外周の 0.7〜1.05m 開口。色付きの図面では内側が灰色の土間のものを優先し、無ければ最も手前（画像下側 = 道路側）
  const doorSized = gaps.filter(g => g.exterior && g.length >= 0.7 && g.length <= 1.1 && !splitWindow(g))
  // 2F 以上に玄関は無い（外向きのドアにすると、バルコニーの無い壁に外へ出る扉ができてしまう）
  const entrance = opts.level ? undefined : (colored ? doorSized.find(insideIsGrayFloor) : undefined) ?? doorSized.sort((a, b) => b.cz - a.cz)[0]
  let windows = 0, doors = 0
  for (const g of gaps) {
    let kind = DOOR
    // 1F の幅広い外部開口（1.75m 以上）は掃き出し窓（1.6m 程度は腰窓）、2F 以上はバルコニー出入口相当の幅（2.2m 以上）のみ掃き出し窓とする
    const glassMin = opts.level === 0 ? 1.75 : 2.2
    if (g.exterior && g !== entrance) kind = g.length >= glassMin ? GLASSDOOR : WINDOW
    // 内部の幅広い途切れは廊下・吹き抜けなどの通り抜けとみなし、開口部にしない。
    // ただし色付きの図面で途切れに沿って線が描かれていれば仕切り: 両側が同じ塗りなら細い間仕切り（壁）、違う塗りなら収納の扉（折れ戸・引き戸）
    if (kind === DOOR && !g.exterior && g.length > 1.1) {
      const partition = opts.auto && colored ? drawnPartition(g) : null
      if (partition === "wall") {
        for (const q of g.idx) cells[q] = WALL
        continue
      }
      if (partition !== "door") {
        for (const q of g.idx) cells[q] = EMPTY
        continue
      }
    }
    if (kind === DOOR) doors++
    else windows++
    for (const q of g.idx) cells[q] = kind
  }
  if (opts.auto) {
    windows += fillShortExteriorGaps()
    doors += removeOpenDoorLeaves()
    sealEnvelope()
  }
  const entranceCells = new Set(entrance && entrance.exterior ? entrance.idx : [])

  /**
   * 外壁の隅の食い違い（2 本の壁の端が 1〜2 セルずれて接していない）など、行・列に沿わない隙間。
   * 閉処理なしで外から塗ると部屋（2m² 以上）まで届くなら、外に接する入口のセルを壁にして塞ぐ（3D の隅に縦の隙間が開く）
   */
  function sealEnvelope(): void {
    const reach = new Uint8Array(cells.length)
    const st: number[] = []
    for (let c = 0; c < cols; c++) st.push(c, (rows - 1) * cols + c)
    for (let r = 0; r < rows; r++) st.push(r * cols, r * cols + cols - 1)
    while (st.length) {
      const p = st.pop()!
      if (reach[p] || cells[p] !== EMPTY) continue
      reach[p] = 1
      const c = p % cols
      if (c > 0) st.push(p - 1)
      if (c < cols - 1) st.push(p + 1)
      if (p >= cols) st.push(p - cols)
      if (p + cols < cells.length) st.push(p + cols)
    }
    const seen = new Uint8Array(cells.length)
    const minCells = Math.round(2 / (cellM * cellM))
    for (let p0 = 0; p0 < cells.length; p0++) {
      if (cells[p0] !== EMPTY || outside[p0] || seen[p0]) continue
      const comp: number[] = []
      const s2 = [p0]
      seen[p0] = 1
      while (s2.length) {
        const q = s2.pop()!
        comp.push(q)
        const c = q % cols
        for (const n of [c > 0 ? q - 1 : -1, c < cols - 1 ? q + 1 : -1, q - cols, q + cols]) if (n >= 0 && n < cells.length && cells[n] === EMPTY && !outside[n] && !seen[n]) { seen[n] = 1; s2.push(n) }
      }
      if (comp.length < minCells || !comp.some(q => reach[q])) continue
      for (const q of comp) {
        const c = q % cols
        if ((c > 0 && outside[q - 1]) || (c < cols - 1 && outside[q + 1]) || (q >= cols && outside[q - cols]) || (q + cols < cells.length && outside[q + cols])) cells[q] = WALL
      }
    }
  }
  /**
   * 外壁の途切れのうち、開口として拾えなかったもの（0.5m 未満の小窓・記号で途切れた壁・隅の際の窓）。
   * 空きのまま残すと 3D の外壁に床から天井までの縦の隙間が開く。0.25m 以上は窓、それ未満は壁で埋める。
   * 両端とも内側へ長く続く壁（建物の凹みの口）は埋めない。戻り値は足した窓の数
   */
  function fillShortExteriorGaps(): number {
    const reach = Math.round(0.4 / cellM)
    const maxLen = Math.round(1.0 / cellM)
    const winMin = Math.round(0.25 / cellM)
    const plainEnd = Math.round(0.35 / cellM)
    const solidAt = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && cells[r * cols + c] !== EMPTY && !outside[r * cols + c]
    let added = 0
    for (const horizontal of [true, false]) {
      const outerN = horizontal ? rows : cols
      const innerN = horizontal ? cols : rows
      const idxOf = (o: number, i: number) => (horizontal ? o * cols + i : i * cols + o)
      for (let o = 0; o < outerN; o++) {
        let i = 0
        while (i < innerN) {
          const k = idxOf(o, i)
          if (cells[k] !== EMPTY || outside[k]) { i++; continue }
          let j = i
          while (j < innerN && cells[idxOf(o, j)] === EMPTY && !outside[idxOf(o, j)]) j++
          const len = j - i
          const start = i
          i = j
          if (len > maxLen || start === 0 || j >= innerN) continue
          const a = idxOf(o, start - 1), b = idxOf(o, j)
          if (cells[a] === EMPTY || outside[a] || cells[b] === EMPTY || outside[b]) continue
          // 途切れの中の空きが、壁の厚み方向にまっすぐ外へ抜ける（部屋の中の行は外壁にぶつかって止まる）
          let exterior = false
          for (let s0 = start; s0 < j && !exterior; s0++) {
            for (const d of [-1, 1]) {
              for (let s = 1; s <= reach; s++) {
                const oo = o + d * s
                if (oo < 0 || oo >= outerN) { exterior = true; break }
                const q = idxOf(oo, s0)
                if (outside[q]) { exterior = true; break }
                if (cells[q] !== EMPTY) break
              }
              if (exterior) break
            }
          }
          if (!exterior) continue
          // 端の壁が内側へどこまで続くか（凹みの口なら両端とも長い）
          const depthOf = (at: number) => {
            let best = 0
            for (const d of [-1, 1]) {
              let n = 0
              for (let s = 1; s <= plainEnd + 1; s++) {
                const ok = horizontal ? solidAt(at, o + d * s) : solidAt(o + d * s, at)
                if (!ok) break
                n++
              }
              best = Math.max(best, n)
            }
            return best
          }
          if (depthOf(start - 1) > plainEnd && depthOf(j) > plainEnd) continue
          const kind = len >= winMin ? WINDOW : WALL
          // 壁の厚み全体（外へ抜ける向きの空きのセルも）を同じ種類にする
          for (let s0 = start; s0 < j; s0++) {
            cells[idxOf(o, s0)] = kind
            for (const d of [-1, 1]) {
              for (let s = 1; s <= reach; s++) {
                const oo = o + d * s
                if (oo < 0 || oo >= outerN) break
                const q = idxOf(oo, s0)
                if (outside[q] || cells[q] !== EMPTY) break
                const end1 = idxOf(oo, start - 1), end2 = idxOf(oo, j)
                // 両端が壁の行（壁の厚みの中）だけ埋める。部屋の中までは伸ばさない
                if (cells[end1] === EMPTY || cells[end2] === EMPTY || outside[end1] || outside[end2]) break
                cells[q] = kind
              }
            }
          }
          if (kind === WINDOW) added++
        }
      }
    }
    return added
  }

  /**
   * 開いた状態で描かれた扉板（壁の端から延びる 0.5〜1.0m の線と、同じ半径の 4 分の 1 円の開き勝手）。
   * 壁と同じ太さの線なので壁として残り、内見で通れなくなる。円弧が描かれていれば扉板とみなして壁から外し、
   * 閉じた位置（円弧の終わり、壁の線上の空き）をドアにする。戻り値は足したドアの数
   */
  function removeOpenDoorLeaves(): number {
    const minL = Math.round(0.5 / cellM)
    const maxL = Math.round(1.0 / cellM)
    const thickMax = Math.round(0.2 / cellM)
    /** 画素 (x, y) を中心に、半径方向（ux, uy）に細い線が横切っているか（線の両側が明るい） */
    const lineAt = (x: number, y: number, ux: number, uy: number) => {
      let m = 255
      for (let t = -2; t <= 2; t++) {
        const px = Math.round(x + ux * t), py = Math.round(y + uy * t)
        if (px < 0 || py < 0 || px >= w || py >= h) return false
        m = Math.min(m, lum[py * w + px])
      }
      const side = (t: number) => {
        const px = Math.round(x + ux * t), py = Math.round(y + uy * t)
        return px < 0 || py < 0 || px >= w || py >= h ? 0 : lum[py * w + px]
      }
      return m < 200 && side(-5) > m + 35 && side(5) > m + 35
    }
    const cellOfPx = (x: number, y: number) => {
      const c = Math.floor((x - gx) / cellPx) + P
      const r = Math.floor((y - gy) / cellPx) + P
      return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c
    }
    type Leaf = { horizontal: boolean; line: number; hinge: number; free: number; dir: number; side: number; len: number }
    const leaves: Leaf[] = []
    for (const horizontal of [true, false]) {
      // horizontal = 扉板が横向き（行に沿う）
      const outerN = horizontal ? rows : cols
      const innerN = horizontal ? cols : rows
      const idxOf = (o: number, i: number) => (horizontal ? o * cols + i : i * cols + o)
      for (let o = 1; o + 1 < outerN; o++) {
        let i = 0
        while (i < innerN) {
          if (cells[idxOf(o, i)] !== WALL) { i++; continue }
          let j = i
          while (j < innerN && cells[idxOf(o, j)] === WALL) j++
          const r0 = i, r1 = j - 1
          i = j
          for (const [freeEnd, dir] of [[r1, 1], [r0, -1]] as const) {
            const beyond = freeEnd + dir
            if (beyond < 0 || beyond >= innerN) continue
            const kb = idxOf(o, beyond)
            if (cells[kb] !== EMPTY || outside[kb]) continue
            let best: Leaf | null = null
            let bestHits = 0
            for (let L = minL; L <= maxL && L <= r1 - r0 + 1; L++) {
              const hinge = freeEnd - dir * L
              // 扉板の線（壁の厚み方向の幅が細い）だけ。外壁は対象にしない
              let thin = true
              for (let s = 1; s <= Math.min(L, 4); s++) {
                const a = freeEnd - dir * (s - 1)
                let width = 0
                for (let t = -thickMax; t <= thickMax; t++) if (o + t >= 0 && o + t < outerN && cells[idxOf(o + t, a)] === WALL) width++
                if (width > thickMax || outside[idxOf(o - 1, a)] || outside[idxOf(o + 1, a)]) thin = false
              }
              if (!thin) break
              const hx = gx + (((horizontal ? hinge : o) - P + 0.5) * cellPx)
              const hy = gy + (((horizontal ? o : hinge) - P + 0.5) * cellPx)
              const R = L * cellPx
              for (const side of [-1, 1]) {
                let hits = 0
                for (let deg = 15; deg <= 75; deg += 5) {
                  const th = (deg * Math.PI) / 180
                  // 扉板の向き（ヒンジ → 自由端）と、閉じた位置の向き
                  const ax = horizontal ? dir : 0, ay = horizontal ? 0 : dir
                  const bx = horizontal ? 0 : side, by = horizontal ? side : 0
                  const ux = Math.cos(th) * ax + Math.sin(th) * bx
                  const uy = Math.cos(th) * ay + Math.sin(th) * by
                  const x = hx + R * ux, y = hy + R * uy
                  const q = cellOfPx(x, y)
                  if (q < 0 || cells[q] !== EMPTY || outside[q]) continue
                  if (lineAt(x, y, ux, uy)) hits++
                }
                if (hits >= 10 && hits > bestHits) {
                  bestHits = hits
                  best = { horizontal, line: o, hinge, free: freeEnd, dir, side, len: L }
                }
              }
            }
            if (best) leaves.push(best)
          }
        }
      }
    }
    let added = 0
    const doneHinges = new Set<string>()
    const solid = (q: number) => q >= 0 && q < cells.length && cells[q] !== EMPTY && !outside[q]
    for (const lf of leaves) {
      const idxOf = (o: number, i: number) => (lf.horizontal ? o * cols + i : i * cols + o)
      const outerN = lf.horizontal ? rows : cols
      const innerN = lf.horizontal ? cols : rows
      const keep = Math.round(0.15 / cellM)
      const span: number[] = []
      for (let a = lf.hinge + lf.dir * keep; lf.dir > 0 ? a <= lf.free : a >= lf.free; a += lf.dir) span.push(a)
      /** a の位置で、line から続く壁のセル（線の太さぶん） */
      const lateral = (a: number) => {
        const out: number[] = []
        for (const d of [-1, 1]) {
          for (let t = d > 0 ? 0 : 1; t <= thickMax + 2; t++) {
            const o = lf.line + d * t
            if (o < 0 || o >= outerN) break
            const q = idxOf(o, a)
            if (cells[q] !== WALL) break
            out.push(q)
          }
        }
        return out
      }
      // 円弧の 2 本の半径のうち、どちらが閉じた位置か。この線に沿う壁が、線の両端の先まで途切れずに続いていれば（蝶番の先へ 0.3m 以上）、
      // それは扉の付いている壁そのもの（扉の枠を壁として拾った）で、この線が閉じた位置。扉はここにある。
      // 沿う壁が蝶番の先で終わる（直交する壁から生えた壁）・沿う壁が無いなら、この線は開いた扉板
      const ownWallRows: number[] = []
      for (const d of [-1, 1]) {
        for (let t = 1; t <= thickMax; t++) {
          const o = lf.line + d * t
          if (o < 0 || o >= outerN) break
          let through = true
          // 蝶番の先へ 0.3m 以上（T 字に接する直交する壁の厚みだけではない）、自由端の先へ 2 セル以上続くこと
          const back = Math.round(0.3 / cellM)
          for (let a = lf.hinge - lf.dir * back; through && (lf.dir > 0 ? a <= lf.free + 2 : a >= lf.free - 2); a += lf.dir) {
            if (a < 0 || a >= innerN || cells[idxOf(o, a)] !== WALL) through = false
          }
          if (!through) break
          ownWallRows.push(o)
        }
      }
      // 外壁（外に接する壁）につながる線は扱わない（外壁の内側の列・窓まわりの記号を扉と取り違える）
      const touchesOutside = [...span, lf.free].some(a => lateral(a).some(q => [q - 1, q + 1, q - cols, q + cols].some(n => n >= 0 && n < cells.length && outside[n])))
      if (touchesOutside) continue
      if (ownWallRows.length) {
        let marked = false
        for (let a = lf.hinge + lf.dir * keep; lf.dir > 0 ? a <= lf.free : a >= lf.free; a += lf.dir) {
          for (const o of [lf.line, ...ownWallRows]) {
            const q = idxOf(o, a)
            if (cells[q] === WALL) { cells[q] = DOOR; marked = true }
          }
        }
        if (marked) added++
        continue
      }      // 開いた扉板。部屋の中に立つ細い線は壁から外す（壁に沿って描かれ、隣の壁と一体で太いものは、壁が本物なので残す）
      const widest = Math.max(0, ...span.map(a => lateral(a).length))
      if (widest <= 3) for (const a of span) for (const q of lateral(a)) cells[q] = EMPTY      // 閉じた位置: ヒンジから扉板と直交する向きに、空きを進んで壁に当たるまで（扉の幅 ±）。蝶番側も壁の行（壁の厚み）だけ
      const key = `${lf.horizontal}:${lf.hinge}:${lf.side}`
      if (doneHinges.has(key)) continue
      doneHinges.add(key)
      let marked = false
      for (let t = -thickMax; t <= thickMax; t++) {
        const a = lf.hinge + t
        if (a < 0 || a >= innerN) continue
        const along = (s: number) => {
          const o = lf.line + lf.side * s
          return o < 0 || o >= outerN ? -1 : idxOf(o, a)
        }
        if (!solid(along(0))) continue
        let s = 1
        while (s <= lf.len + 4 && along(s) >= 0 && cells[along(s)] === EMPTY && !outside[along(s)]) s++
        if (s - 1 < lf.len - 3 || s > lf.len + 4 || !solid(along(s))) continue
        for (let k = 1; k < s; k++) cells[along(k)] = DOOR
        marked = true
      }
      if (marked) added++
    }
    return added
  }

  /** セルの画素（建物の座標のセル → 画像の画素） */
  function cellPixels(c: number, r: number, fn: (i: number) => void) {
    const x0 = Math.floor(gx + (c - P) * cellPx)
    const y0 = Math.floor(gy + (r - P) * cellPx)
    const n = Math.max(1, Math.round(cellPx))
    for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) if (x >= 0 && y >= 0 && x < w && y < h) fn(y * w + x)
  }
  /** 開口の途切れに線が描かれているか（灰色の細線）と、両側の塗りの色から、仕切りの種類を決める */
  function drawnPartition(g: Gap): "wall" | "door" | null {
    const byAlong = new Map<number, number[]>()
    for (const q of g.idx) {
      const a = g.horizontal ? q % cols : Math.floor(q / cols)
      byAlong.set(a, [...(byAlong.get(a) ?? []), q])
    }
    let covered = 0
    for (const qs of byAlong.values()) {
      let line = false
      for (const q of qs) cellPixels(q % cols, Math.floor(q / cols), i => {
        const sat = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
        if (lum[i] < 205 && sat < 20) line = true
      })
      if (line) covered++
    }
    if (covered / Math.max(1, byAlong.size) < 0.6) return null
    const thick = g.idx.length / Math.max(1, byAlong.size)
    const off = Math.round(thick / 2) + Math.round(0.25 / cellM)
    const side = (dir: number) => {
      let sr = 0, sg = 0, sb = 0, n = 0
      for (const a of byAlong.keys()) {
        const c = g.horizontal ? a : Math.round(g.cc + dir * off)
        const r = g.horizontal ? Math.round(g.cz + dir * off) : a
        if (c < 0 || r < 0 || c >= cols || r >= rows || cells[r * cols + c] === WALL) continue
        cellPixels(c, r, i => {
          if (lum[i] < 150) return
          sr += data[i * 4]; sg += data[i * 4 + 1]; sb += data[i * 4 + 2]; n++
        })
      }
      return n ? [sr / n, sg / n, sb / n] : null
    }
    const a = side(-1)
    const b = side(1)
    if (!a || !b) return null
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 25 ? "wall" : "door"
  }

  // 色付きの図面: 細い線で仕切られた収納（緑）・水回り（桃・肌色）が隣の部屋とつながってしまうので、塗りの色で分けて仕切り壁と扉を足す
  if (opts.auto && colored) splitByTone()

  /** 塗りの色の系統（splitByTone 用）。水回りの系統は桃色と肌色・茶色に分ける（茶色の収納と桃色の居室の図面がある） */
  type ToneKey = RoomTone | "tan"
  function cellTone(c: number, r: number): ToneKey | null {
    let sr = 0, sg = 0, sb = 0, n = 0
    const x0 = Math.floor(gx + (c - P) * cellPx)
    const y0 = Math.floor(gy + (r - P) * cellPx)
    for (let y = y0; y < y0 + Math.max(1, Math.round(cellPx)); y++) {
      for (let x = x0; x < x0 + Math.max(1, Math.round(cellPx)); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const i = y * w + x
        if (raw[i] || lum[i] < threshold) continue
        sr += data[i * 4]; sg += data[i * 4 + 1]; sb += data[i * 4 + 2]; n++
      }
    }
    if (!n) return null
    const t = roomTone(sr / n, sg / n, sb / n)
    if (t !== "wet") return t
    const R = sr / n, G = sg / n, B = sb / n
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
    const hue = mx === R ? (60 * ((G - B) / (mx - mn)) + 360) % 360 : 0
    // 茶色の収納は暗め（輝度 190 前後）。淡い肌色（輝度 240 前後）は水回りのまま
    return hue >= 15 && hue < 50 && 0.299 * R + 0.587 * G + 0.114 * B < 215 ? "tan" : "wet"
  }

  function splitByTone() {
    const tone = new Array<ToneKey | null>(cells.length).fill(null)
    for (let k = 0; k < cells.length; k++) if (cells[k] === EMPTY && !outside[k]) tone[k] = cellTone(k % cols, Math.floor(k / cols))
    // 文字・記号の上は色が取れないので、周りの多数派で埋める（2 回）
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < cells.length; k++) {
        if (cells[k] !== EMPTY || outside[k] || tone[k]) continue
        const cnt = new Map<ToneKey, number>()
        for (const n of [k - 1, k + 1, k - cols, k + cols]) if (tone[n]) cnt.set(tone[n]!, (cnt.get(tone[n]!) ?? 0) + 1)
        const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]
        if (best) tone[k] = best[0]
      }
    }
    const seen = new Uint8Array(cells.length)
    // 収納は小さいもの（0.35m²: 半間の物入れ）も分ける。水回りは 0.6m² 以上
    const minCellsOf = (t: ToneKey) => Math.round((t === "storage" ? 0.35 : 0.6) / (cellM * cellM))
    const minCells = Math.round(0.35 / (cellM * cellM))
    for (let p = 0; p < cells.length; p++) {
      if (cells[p] !== EMPTY || outside[p] || seen[p]) continue
      // 部屋（空きセルの連結成分）
      const comp: number[] = []
      const st = [p]
      seen[p] = 1
      while (st.length) {
        const q = st.pop()!
        comp.push(q)
        for (const n of [q - 1, q + 1, q - cols, q + cols]) if (cells[n] === EMPTY && !outside[n] && !seen[n]) { seen[n] = 1; st.push(n) }
      }
      const inComp = new Set(comp)
      const count = new Map<ToneKey, number>()
      for (const q of comp) if (tone[q]) count.set(tone[q]!, (count.get(tone[q]!) ?? 0) + 1)
      const dominant = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      // 肌色・茶色（tan）と桃色を分けるのは、部屋の多数派が桃色のときだけ（桃色の居室に茶色の収納）。それ以外は同じ水回りの系統
      const key = (q: number) => (dominant !== "wet" && tone[q] === "tan" ? "wet" : tone[q])
      // 同じ色の塊（収納・水回り）で、部屋の多数派と違う色のもの
      const subSeen = new Set<number>()
      for (const q0 of comp) {
        const t0 = key(q0)
        if (subSeen.has(q0) || !t0 || t0 === dominant || (t0 !== "storage" && t0 !== "wet" && t0 !== "tan")) continue
        const sub: number[] = []
        const s2 = [q0]
        subSeen.add(q0)
        while (s2.length) {
          const q = s2.pop()!
          sub.push(q)
          for (const n of [q - 1, q + 1, q - cols, q + cols]) if (inComp.has(n) && !subSeen.has(n) && key(n) === t0) { subSeen.add(n); s2.push(n) }
        }
        if (sub.length < minCellsOf(t0) || comp.length - sub.length < minCells) continue
        // 塊の外周（隣が別の色のセル）を壁にする
        const inSub = new Set(sub)
        const edge = sub.filter(q => [q - 1, q + 1, q - cols, q + cols].some(n => inComp.has(n) && !inSub.has(n)))
        for (const q of edge) cells[q] = WALL
        // 扉: 境界のうち最も長い直線の中央に 0.6m（入れなければ境界の長さの 7 割）
        const byRow = new Map<number, number[]>()
        const byCol = new Map<number, number[]>()
        for (const q of edge) {
          const c = q % cols
          const r = (q - c) / cols
          if (!byRow.has(r)) byRow.set(r, [])
          byRow.get(r)!.push(c)
          if (!byCol.has(c)) byCol.set(c, [])
          byCol.get(c)!.push(r)
        }
        let best: { horizontal: boolean; line: number; a0: number; a1: number } | null = null
        for (const [horizontal, map] of [[true, byRow], [false, byCol]] as const) {
          for (const [line, vals] of map) {
            const sorted = [...vals].sort((a, b) => a - b)
            let start = sorted[0]
            for (let i = 1; i <= sorted.length; i++) {
              if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue
              const a0 = start
              const a1 = sorted[i - 1]
              if (!best || a1 - a0 > best.a1 - best.a0) best = { horizontal, line, a0, a1 }
              if (i < sorted.length) start = sorted[i]
            }
          }
        }
        if (best) {
          const len = best.a1 - best.a0 + 1
          const dn = Math.max(1, Math.min(Math.round(0.6 / cellM), Math.floor(len * 0.7)))
          const mid = Math.floor((best.a0 + best.a1) / 2)
          for (let a = mid - Math.floor(dn / 2); a < mid - Math.floor(dn / 2) + dn; a++) {
            const q = best.horizontal ? best.line * cols + a : a * cols + best.line
            if (cells[q] === WALL) cells[q] = DOOR
          }
          doors++
        }
      }
    }
  }

  // 外部に面する側（外壁仕上げを貼る面）
  const sideBits = (i: number) => {
    const c = i % cols
    const r = (i - c) / cols
    let b = 0
    if (c < cols - 1 && outside[i + 1]) b |= 1
    if (c > 0 && outside[i - 1]) b |= 2
    if (r < rows - 1 && outside[i + cols]) b |= 4
    if (r > 0 && outside[i - cols]) b |= 8
    return b
  }
  const toM = (cr: number) => Math.round((cr - P) * cellM * 1000) / 1000
  const sizeM = (n: number) => Math.round(n * cellM * 1000) / 1000
  const grid: Grid = { cols, rows, cells }
  // 設備の記号（細線の箱、建物の座標）。部屋の名前（浴室・洗面所）と、壁付けキッチンの判定にも使う
  let fixtures: FixtureHint[] = thin
    ? findFixtureBoxes(thin, solidForFixtures, w, h, ppm).map(b => ({
        x: Math.round(((b.x0 - gx) / ppm) * 100) / 100,
        z: Math.round(((b.y0 - gy) / ppm) * 100) / 100,
        w: Math.round(((b.x1 - b.x0 + 1) / ppm) * 100) / 100,
        d: Math.round(((b.y1 - b.y0 + 1) / ppm) * 100) / 100,
        kind: null,
        lines: b.lines,
      }))
      // 建物の外（玄関扉の開き勝手・方位記号・バルコニー）は除く
      .filter(fx => fx.x >= -0.05 && fx.z >= -0.05 && fx.x + fx.w <= sizeM(cols - 2 * P) + 0.05 && fx.z + fx.d <= sizeM(rows - 2 * P) + 0.05)
      .filter(fx => {
        const c = Math.floor((fx.x + fx.w / 2) / cellM) + P
        const r = Math.floor((fx.z + fx.d / 2) / cellM) + P
        return c >= 0 && r >= 0 && c < cols && r < rows && !outside[r * cols + c]
      })
    : []

  // 部屋（開口を閉じた内部の空セル連結成分）
  const detectRooms = () => {
    const roomSeen = new Uint8Array(cols * rows)
    const label = new Int32Array(cols * rows).fill(-1)
    const list: (FoundRoom & { cells: number[] })[] = []
    for (let p = 0; p < cells.length; p++) {
      if (cells[p] !== EMPTY || outside[p] || roomSeen[p]) continue
      let n = 0, sx = 0, sz = 0
      let c0 = cols, c1 = -1, r0 = rows, r1 = -1
      let cr = 0, cg = 0, cb = 0, cn = 0
      let touchesEntrance = false
      const comp: number[] = []
      stack.push(p)
      roomSeen[p] = 1
      while (stack.length) {
        const q = stack.pop()!
        comp.push(q)
        n++
        const c = q % cols
        const r = (q - c) / cols
        sx += c
        sz += r
        if (c < c0) c0 = c
        if (c > c1) c1 = c
        if (r < r0) r0 = r
        if (r > r1) r1 = r
        // 塗りの色（壁・文字ではない明るい画素だけ）
        const px = Math.floor(gx + (c - P + 0.5) * cellPx)
        const py = Math.floor(gy + (r - P + 0.5) * cellPx)
        if (px >= 0 && py >= 0 && px < w && py < h) {
          const i = py * w + px
          if (!raw[i] && lum[i] >= threshold) {
            cr += data[i * 4]
            cg += data[i * 4 + 1]
            cb += data[i * 4 + 2]
            cn++
          }
        }
        for (const k of [c > 0 ? q - 1 : -1, c < cols - 1 ? q + 1 : -1, r > 0 ? q - cols : -1, r < rows - 1 ? q + cols : -1]) {
          if (k >= 0 && entranceCells.has(k)) touchesEntrance = true
          if (k >= 0 && !roomSeen[k] && cells[k] === EMPTY && !outside[k]) {
            roomSeen[k] = 1
            stack.push(k)
          }
        }
      }
      const area = n * cellM * cellM
      const rgb: [number, number, number] | null = cn ? [cr / cn, cg / cn, cb / cn] : null
      const tone = rgb ? roomTone(...rgb) : "neutral"
      for (const q of comp) label[q] = list.length
      list.push({
        area, cx: (sx / n - P + 0.5) * cellM, cz: (sz / n - P + 0.5) * cellM, tone, rgb,
        minDim: Math.min(c1 - c0 + 1, r1 - r0 + 1) * cellM, maxDim: Math.max(c1 - c0 + 1, r1 - r0 + 1) * cellM, entrance: touchesEntrance,
        box: { x0: (c0 - P) * cellM, z0: (r0 - P) * cellM, x1: (c1 - P + 1) * cellM, z1: (r1 - P + 1) * cellM },
        cells: comp,
      })
    }
    return { list, label }
  }
  let detected = detectRooms()

  // 壁付けキッチン: 大きな部屋（LDK）の脇の細長い場所（奥行 1m 以下）にコンロ・シンクの記号があり、太い線（吊り戸棚・カウンターの縁）で
  // 仕切られている。色付きの図面だけ、仕切りを外して LDK とつなげ、細長い場所全体を壁付けのキッチンの記号として扱う
  if (opts.auto && colored) {
    const big = detected.list.filter(f => f.area >= 9)
    let merged = false
    for (const strip of detected.list) {
      // 奥行は面積 ÷ 長さで見る（隣の小さなくぼみとつながって L 字になると、外接矩形の短辺が 1m を超える）
      if (strip.area / strip.maxDim! > 1.0 || strip.maxDim! < 1.8 || strip.area > 3.5 || strip.entrance) continue
      const inside = fixtures.filter(fx => fx.x >= strip.box!.x0 - 0.05 && fx.z >= strip.box!.z0 - 0.05 && fx.x + fx.w <= strip.box!.x1 + 0.05 && fx.z + fx.d <= strip.box!.z1 + 0.05)
      if (!inside.length) continue
      const horizontal = strip.box!.x1 - strip.box!.x0 >= strip.box!.z1 - strip.box!.z0
      const maxT = Math.round(0.3 / cellM)
      for (const room of big) {
        const target = detected.list.indexOf(room)
        const cut: number[] = []
        for (const q of strip.cells) {
          const c = q % cols
          const r = (q - c) / cols
          for (const d of [-1, 1]) {
            const run: number[] = []
            for (let s = 1; s <= maxT + 1; s++) {
              const cc = horizontal ? c : c + d * s
              const rr = horizontal ? r + d * s : r
              if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) break
              const k = rr * cols + cc
              if (cells[k] === WALL) { run.push(k); continue }
              if (detected.label[k] === target && run.length) cut.push(...run)
              break
            }
          }
        }
        if (cut.length < Math.round(1.2 / cellM)) continue
        for (const k of cut) cells[k] = EMPTY
        // 細長い場所の奥（外壁側）に、全長のキッチンの記号を置く（コンロ・シンクの小さな箱は使わない）
        const b = strip.box!
        const toward = horizontal ? (room.cz > (b.z0 + b.z1) / 2 ? "s" : "n") : room.cx > (b.x0 + b.x1) / 2 ? "e" : "w"
        const depth = Math.min(0.65, horizontal ? b.z1 - b.z0 : b.x1 - b.x0)
        const k: FixtureHint = horizontal
          ? { x: b.x0, z: toward === "s" ? b.z0 : b.z1 - depth, w: b.x1 - b.x0, d: depth, kind: "kitchen", lines: [1, 1, 1, 1] }
          : { x: toward === "e" ? b.x0 : b.x1 - depth, z: b.z0, w: depth, d: b.z1 - b.z0, kind: "kitchen", lines: [1, 1, 1, 1] }
        fixtures = [...fixtures.filter(fx => !inside.includes(fx)), k]
        merged = true
        break
      }
    }
    if (merged) detected = detectRooms()
  }

  // 玄関の土間から部屋の中への扉が無い（上がり框の線が壁として拾われた）ときは、いちばん長く接する部屋との境を開ける
  if (opts.auto && colored && entranceCells.size) {
    const entry = detected.list.find(f => f.entrance)
    if (entry && entry.area < 3.5) {
      const own = new Set(entry.cells)
      const target = detected.list.indexOf(entry)
      let interiorDoor = false
      const shared = new Map<number, number[]>()
      const maxT = Math.round(0.3 / cellM)
      for (const q of entry.cells) {
        const c = q % cols
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n0 = q + dc + dr * cols
          if (cells[n0] === DOOR && !entranceCells.has(n0)) interiorDoor = true
          const run: number[] = []
          for (let s = 1; s <= maxT + 1; s++) {
            const cc = c + dc * s
            const k = q + dc * s + dr * s * cols
            if (cc < 0 || cc >= cols || k < 0 || k >= cells.length) break
            if (cells[k] === WALL) { run.push(k); continue }
            const lb = detected.label[k]
            if (lb >= 0 && lb !== target && run.length && !own.has(k)) shared.set(lb, [...(shared.get(lb) ?? []), ...run])
            break
          }
        }
      }
      const best = [...shared.entries()].sort((a, b) => b[1].length - a[1].length)[0]
      if (!interiorDoor && best && best[1].length >= Math.round(0.6 / cellM)) {
        for (const k of best[1]) cells[k] = EMPTY
        detected = detectRooms()
      }
    }
  }

  // 壁の矩形は、仕切りの統合（壁付けキッチン・玄関の上がり框）を終えたセルから作る
  const wallRects = greedyRects(grid, i => (cells[i] >= WALL && cells[i] !== GAP_H && cells[i] !== GAP_V ? cells[i] * 16 + sideBits(i) : -1))
  const walls: WallRect[] = wallRects.map(rc => {
    const kind = KIND_OF[rc.key >> 4] ?? "wall"
    const bits = rc.key & 15
    const outsideSides: Side[] = []
    if (bits & 1) outsideSides.push("+x")
    if (bits & 2) outsideSides.push("-x")
    if (bits & 4) outsideSides.push("+z")
    if (bits & 8) outsideSides.push("-z")
    const r: WallRect = { x: toM(rc.c), z: toM(rc.r), w: sizeM(rc.w), d: sizeM(rc.h), kind }
    if (outsideSides.length) r.outside = outsideSides
    return r
  })
  const slabs: Rect[] = greedyRects(grid, i => (outside[i] ? -1 : 1)).map(rc => ({ x: toM(rc.c), z: toM(rc.r), w: sizeM(rc.w), d: sizeM(rc.h) }))

  // 玄関の土間から扉（上がり框の線）でつながる小さな場所は玄関ホール・廊下
  const entryRoom = detected.list.findIndex(f => f.entrance)
  if (entryRoom >= 0) {
    const doorSeen = new Uint8Array(cells.length)
    for (const q of detected.list[entryRoom].cells) {
      for (const n0 of [q - 1, q + 1, q - cols, q + cols]) {
        if (cells[n0] !== DOOR || entranceCells.has(n0) || doorSeen[n0]) continue
        const st2 = [n0]
        doorSeen[n0] = 1
        while (st2.length) {
          const d = st2.pop()!
          for (const n1 of [d - 1, d + 1, d - cols, d + cols]) {
            if (cells[n1] === DOOR && !doorSeen[n1]) { doorSeen[n1] = 1; st2.push(n1) }
            const lb = detected.label[n1]
            if (lb >= 0 && lb !== entryRoom) detected.list[lb].hall = true
          }
        }
      }
    }
  }
  const found: FoundRoom[] = detected.list.filter(f => f.area >= 0.4).map(({ cells, ...f }) => (void cells, f))
  found.sort((a, b) => b.area - a.area)
  relativeTones(found, fixtures)
  const rooms = nameRooms(found, opts.level)

  const width = sizeM(cols - 2 * P)
  const depth = sizeM(rows - 2 * P)
  // 階段の記号（画素 → 建物の座標）。外形の内側にあるものだけ
  const stairHints: StairHint[] = thin
    ? findStairSymbols(thin, w, h, ppm, colored)
        .map(sy => ({
          x: Math.round(((sy.x0 - gx) / ppm) * 100) / 100,
          z: Math.round(((sy.y0 - gy) / ppm) * 100) / 100,
          w: Math.round(((sy.x1 - sy.x0) / ppm) * 100) / 100,
          d: Math.round(((sy.y1 - sy.y0) / ppm) * 100) / 100,
          axis: sy.axis,
          lines: sy.lines,
          strong: sy.strong,
        }))
        // 弱い候補（2〜3 本）は窓の二重線・設備の線と区別できないので使わない
        .filter(r => r.strong && r.x >= -0.05 && r.z >= -0.05 && r.x + r.w <= sizeM(cols - 2 * P) + 0.05 && r.z + r.d <= sizeM(rows - 2 * P) + 0.05)
    : []
  let insideCells = 0
  let edgeCells = 0
  for (let k = 0; k < cells.length; k++) {
    if (outside[k]) continue
    insideCells++
    const c = k % cols
    if ((c > 0 && outside[k - 1]) || (c < cols - 1 && outside[k + 1]) || (k >= cols && outside[k - cols]) || (k + cols < cells.length && outside[k + cols])) edgeCells++
  }
  const floorArea = Math.round(Math.max(0, insideCells * cellM * cellM - edgeCells * cellM * (wallPx / ppm / 2)) * 100) / 100
  return {
    colored,
    floorArea,
    stairHints,
    fixtures,
    floor: { level: opts.level, height: opts.floorHeight, walls, slabs, rooms },
    footprint: { width, depth },
    bboxPx: { x: gx, y: gy, w: bw, h: bh },
    pxPerMeter: ppm,
    stats: {
      walls: walls.filter(x => x.kind === "wall").length,
      windows,
      doors,
      rooms: rooms.length,
      cellMeters: Math.round(cellM * 1000) / 1000,
    },
    applied: { threshold, cleanRadius, wallPx },
    scaleCheck: scaleCheckOf(wallPx, ppm, opts.widthMeters),
  }
}

/**
 * 部屋の塗りの色の系統。不動産サイトの間取り図は、居室 = 青・水色、収納 = 緑、水回り = 桃・肌色で塗り分けることが多い。
 * 白黒の図面や彩度の低い塗りは neutral（広さで判断する）
 */
export type RoomTone = "living" | "storage" | "wet" | "neutral"

export function roomTone(r: number, g: number, b: number): RoomTone {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 14) return "neutral"
  let hue: number
  if (max === r) hue = (60 * ((g - b) / (max - min)) + 360) % 360
  else if (max === g) hue = 60 * ((b - r) / (max - min)) + 120
  else hue = 60 * ((r - g) / (max - min)) + 240
  if (hue >= 170 && hue < 260) return "living"
  if (hue >= 70 && hue < 170) return "storage"
  if (hue < 50 || hue >= 330) return "wet"
  return "neutral"
}

type FoundRoom = {
  area: number
  cx: number
  cz: number
  tone: RoomTone
  minDim: number
  maxDim?: number
  entrance?: boolean
  /** 塗りの平均色（取れなければ null） */
  rgb?: [number, number, number] | null
  /** 外接矩形（建物の座標） */
  box?: { x0: number; z0: number; x1: number; z1: number }
  /** 中にある設備の記号（長辺・短辺 m） */
  boxes?: { long: number; short: number }[]
  /** 玄関の土間と扉（上がり框）でつながる */
  hall?: boolean
}

const satOf = (c: [number, number, number]) => Math.max(...c) - Math.min(...c)
const colorDist = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * 塗り分けの色はサイトごとに違う（居室が水色の図面も、桃色・黄色の図面もある）。
 * 最も広い部屋の色が「居室」の系統（青・水色）でなければ、色の意味を図面の中で決め直す:
 * - 最も広い部屋と同じ色 = 居室
 * - それ以外の色は、同じ色の部屋のどれかに設備の記号があれば水回り、無ければ収納
 * 各部屋の中の設備の記号（boxes）も記録する（浴室・洗面所の判定に使う）
 */
export function relativeTones(found: FoundRoom[], fixtures: Rect[]): void {
  for (const f of found) {
    if (!f.box) continue
    const b = f.box
    f.boxes = fixtures
      .filter(fx => fx.x + fx.w / 2 > b.x0 && fx.x + fx.w / 2 < b.x1 && fx.z + fx.d / 2 > b.z0 && fx.z + fx.d / 2 < b.z1)
      .map(fx => ({ long: Math.max(fx.w, fx.d), short: Math.min(fx.w, fx.d) }))
  }
  const largest = [...found].sort((a, b) => b.area - a.area)[0]
  if (!largest?.rgb || largest.tone === "living" || satOf(largest.rgb) < 14) return
  const living = largest.rgb
  const others: FoundRoom[] = []
  for (const f of found) {
    if (!f.rgb || satOf(f.rgb) < 14) f.tone = "neutral"
    else if (colorDist(f.rgb, living) < 28) f.tone = "living"
    else others.push(f)
  }
  for (const f of others) {
    const group = others.filter(o => colorDist(o.rgb!, f.rgb!) < 28)
    f.tone = group.some(o => o.boxes?.length) ? "wet" : "storage"
  }
}

/**
 * 部屋の名前（家具のおまかせ配置が名前で中身を決める: LDK / 洋室 / トイレ / 浴室 / 水回り / 収納）。
 * 塗りの色があれば色で、無ければ広さと短辺で決める
 */
export function nameRooms(found: FoundRoom[], level: number): RoomLabel[] {
  const n: Record<string, number> = {}
  const next = (base: string) => `${base}${(n[base] = (n[base] ?? 0) + 1)}`
  const hasColor = found.some(f => f.tone !== "neutral")
  let ldk = false
  return found.map(f => {
    let name: string
    // 玄関（外のドア）に接する小さな場所は玄関・ホール（色付きの図面では灰色の土間）
    if (f.entrance && f.area < 9 && f.tone !== "wet" && f.tone !== "storage") {
      return { name: n["玄関・ホール"] ? next("玄関・ホール") : (n["玄関・ホール"] = 1, "玄関・ホール"), x: Math.round(f.cx * 100) / 100, z: Math.round(f.cz * 100) / 100, area: Math.round(f.area * 10) / 10 }
    }
    // 玄関の土間から上がった所の小さな場所（水回り・収納の色でないもの）は廊下
    if (f.hall && f.area < 4.5 && f.tone !== "wet" && f.tone !== "storage") {
      return { name: next("廊下"), x: Math.round(f.cx * 100) / 100, z: Math.round(f.cz * 100) / 100, area: Math.round(f.area * 10) / 10 }
    }
    // 塗られていない（白い）小さな部屋に設備の記号があれば、記号で決める（水回りを白く塗る図面がある。水回りの色の部屋は下の規則）:
    // 浴槽の大きさの箱 → 浴室、小さい便器の箱がある 1.5m² 未満 → トイレ、正方形に近い箱（洗面台・洗濯機置き場）→ 洗面所
    if (f.boxes?.length && f.area < 4.5 && f.tone === "neutral") {
      const label = (n: string) => ({ name: next(n), x: Math.round(f.cx * 100) / 100, z: Math.round(f.cz * 100) / 100, area: Math.round(f.area * 10) / 10 })
      if (f.boxes.some(b => b.long >= 1.0 && b.short >= 0.6)) return label("浴室")
      if (f.area < 1.5 && f.boxes.some(b => b.long <= 0.75)) return label("トイレ")
      // 洗面台は横長（0.75〜1.0 × 0.5m）、洗濯機置き場は正方形に近い
      if (f.area >= 1.2 && f.boxes.some(b => b.long <= 1.0 && b.short >= 0.45 && b.long / b.short <= 2)) return label("洗面所")
    }
    // 細長くて面積のある場所（短辺 1.5m 未満・2.5m² 以上）は廊下
    if (f.minDim < 1.5 && f.area >= 2.5 && f.tone !== "wet") {
      return { name: next("廊下"), x: Math.round(f.cx * 100) / 100, z: Math.round(f.cz * 100) / 100, area: Math.round(f.area * 10) / 10 }
    }
    // 色付きの図面の白い（塗られていない）場所は廊下・ホール
    if (f.tone === "neutral" && hasColor && f.area >= 1.5 && !(f.area >= 4.5 && f.minDim >= 1.8)) {
      return { name: next("廊下"), x: Math.round(f.cx * 100) / 100, z: Math.round(f.cz * 100) / 100, area: Math.round(f.area * 10) / 10 }
    }
    const kind =
      f.tone === "neutral" && hasColor
        ? f.area >= 4.5 && f.minDim >= 1.8 ? "living" : "small"
        : f.tone === "neutral" ? (f.area >= 6 ? "living" : "small") : f.tone
    if (kind === "living") {
      if (!ldk && level === 0 && f.area >= 9) {
        ldk = true
        name = "LDK"
      } else name = f.area >= 4.5 && f.minDim >= 1.8 ? next("洋室") : next("収納")
    } else if (kind === "storage") name = next("収納")
    // 水回り: 細長い（長辺が短辺の 1.6 倍以上）小部屋はトイレ、正方形に近いものは浴室、広いものは水回り（洗面・脱衣を含む）
    // 設備の記号があれば: 浴槽の大きさ（長辺 1.0m・短辺 0.6m 以上）の箱は浴室、それ以外の箱（洗面台・洗濯機置き場）は洗面所
    else if (kind === "wet" && f.boxes?.some(b => b.long >= 1.0 && b.short >= 0.6)) name = next("浴室")
    // 便器の記号（タンク部分の小さな箱）がある 1.5m² 未満の場所はトイレ
    else if (kind === "wet" && f.area < 1.5 && f.boxes?.some(b => b.long <= 0.75)) name = next("トイレ")
    // 洗面台・洗濯機置き場は正方形に近い箱
    else if (kind === "wet" && f.area >= 1.5 && f.boxes?.some(b => b.long <= 0.9 && b.long / b.short <= 1.35)) name = next("洗面所")
    else if (kind === "wet") name = f.area >= 3.6 ? next("水回り") : f.maxDim && f.maxDim / f.minDim >= 1.6 && f.area < 2.2 ? next("トイレ") : f.area < 2.2 && !f.maxDim ? next("トイレ") : next("浴室")
    else name = next("水回り・収納")
    return { name, x: Math.round(f.cx * 100) / 100, z: Math.round(f.cz * 100) / 100, area: Math.round(f.area * 10) / 10 }
  })
}

/** 壁の厚みから縮尺の入力違いを見つける（0.08〜0.25m の外なら、0.15m とみなした横幅を提案する） */
export function scaleCheckOf(wallPx: number, ppm: number, widthMeters: number): { wallMeters: number; suggestedWidth: number | null } {
  if (!wallPx || !ppm) return { wallMeters: 0, suggestedWidth: null }
  const wallMeters = Math.round((wallPx / ppm) * 1000) / 1000
  if (wallMeters >= 0.08 && wallMeters <= 0.25) return { wallMeters, suggestedWidth: null }
  // 910mm モジュールの半分（0.455m）単位に丸める
  const raw = (widthMeters * 0.15) / wallMeters
  return { wallMeters, suggestedWidth: Math.max(2.73, Math.round(raw / 0.455) * 0.455) }
}

/** 階ごとの解析結果を 1 棟の BuildingSpec にまとめる（外観パースの色・屋根形状と組み合わせ可能） */
/**
 * 解析結果から作った建物の「もっともらしさ」。縮尺の候補のうち、格子のずれで間仕切り・設備・階段が消えた解釈や、
 * 文字・記号の線で部屋が細切れになった解釈を避けるのに使う（大きいほど良い）。
 * 部屋の数だけを数えると細切れの解釈が勝つので、物件の間取り（居室数）が分かればそれとの差で減点する。
 * 設備の分類と階段は建物を組み立てる段で決まるので、組み立てた建物で数える
 */
export function structureScore(results: FloorplanResult[], expect: { bedrooms?: number | null } = {}): number {
  // 自動配置の階段は縮尺の良し悪しと関係が薄く重いので数えない（図面の記号から置けた階段だけ）
  const spec = specFromFloorplans(results, { name: "score", roof: "flat", pitch: 0, materials: DEFAULT_MATERIALS, withPerspective: false, autoStairs: false })
  const names = spec.floors.flatMap(f => f.rooms.map(r => r.name))
  const bedrooms = names.filter(n => /^(洋室|和室)/.test(n)).length
  const wet = new Set(names.map(n => n.match(/^(浴室|トイレ|洗面所)/)?.[1]).filter(Boolean)).size
  const fixed = Math.min(8, (spec.furniture ?? []).filter(f => f.fixed).length)
  const entrance = spec.floors[0]?.walls.some(w => w.kind === "door" && w.outside?.length) ? 2 : 0
  let score = 3 * (spec.stairs?.length ?? 0) + fixed + 1.5 * wet + entrance + (names.includes("LDK") ? 2 : 0)
  score += expect.bedrooms ? -2 * Math.abs(bedrooms - expect.bedrooms) : Math.min(bedrooms, 5)
  score -= 0.3 * Math.max(0, names.length - 5 * spec.floors.length)
  return score
}

/**
 * 物件の延床面積などから決めた横幅は ±2% 程度の誤差を持つ。その範囲の候補（0.5% 刻み）を解析し、
 * 構造がいちばん多く取れた横幅を選ぶ（同点なら元の横幅に近い方）。
 * セル（0.05m）が画素の整数倍にならないため、横幅が数 cm 違うだけで細い間仕切りが消えることがある
 */
export function scaleCandidates(width: number, steps = 4, ratio = 0.005): number[] {
  const out: number[] = []
  for (let k = -steps; k <= steps; k++) out.push(Math.round(width * (1 + k * ratio) * 100) / 100)
  return [...new Set(out)]
}

export function chooseScale(width: number, scored: { width: number; score: number }[]): number {
  if (!scored.length) return width
  return [...scored].sort((a, b) => b.score - a.score || Math.abs(a.width - width) - Math.abs(b.width - width))[0].width
}

export function specFromFloorplans(
  results: FloorplanResult[],
  opts: { name: string; roof: RoofType; pitch: number; materials: Materials; withPerspective: boolean; autoStairs?: boolean },
): BuildingSpec {
  if (results.length === 0) throw new Error("解析済みの間取り図がありません")
  const sorted = [...results].sort((a, b) => a.floor.level - b.floor.level)
  const floors = sorted.map(r => r.floor).map((f, i) => ({ ...f, level: i, walls: [...f.walls] }))
  // 間取り図の設備の記号（キッチン・冷蔵庫・洗面台・洗濯機・トイレ・浴槽）を、図面の位置に固定の設備として置く
  const furniture: FurnitureItem[] = []
  floors.forEach((fl, i) => {
    const placed = placePlanFixtures(fl, sorted[i].fixtures ?? [])
    fl.walls = placed.walls
    furniture.push(...placed.items)
  })
  // LDK は図面のキッチンがある部屋（新築の 2 階リビングなど、1 階とは限らない）。キッチンが無ければ解析時の名前のまま
  const kitchen = furniture.find(f => /^kitchen/.test(f.type))
  if (kitchen) {
    const fl = floors.find(f => f.level === kitchen.level)
    if (fl) {
      const ext = fl.slabs.reduce((e, r) => ({ x0: Math.min(e.x0, r.x), z0: Math.min(e.z0, r.z), x1: Math.max(e.x1, r.x + r.w), z1: Math.max(e.z1, r.z + r.d) }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity })
      const near = (r: RoomLabel) => {
        const b = roomBox(fl, ext, r.x, r.z)
        return kitchen.x > b.x0 - 0.6 && kitchen.x < b.x1 + 0.6 && kitchen.z > b.z0 - 0.6 && kitchen.z < b.z1 + 0.6
      }
      const target = fl.rooms.filter(r => !/トイレ|浴室|洗面|収納|階段|玄関/.test(r.name) && near(r)).sort((a, b) => b.area - a.area)[0]
      if (target && target.name !== "LDK") {
        for (const f of floors) {
          let n = Math.max(0, ...f.rooms.map(r => Number(r.name.match(/^洋室(\d+)$/)?.[1] ?? 0)))
          f.rooms = f.rooms.map(r => (r === target ? { ...r, name: "LDK" } : r.name === "LDK" ? { ...r, name: `洋室${++n}` } : r))
        }
      }
    }
  }
  // キッチンが見つからなければ、1 階の「LDK」が LDK には狭すぎる（12m² 未満）とき、全階でいちばん広い居室を LDK にする（2 階リビング・3 階建て）
  if (!kitchen && floors.length >= 2) {
    const living = floors.flatMap(f => f.rooms.filter(r => r.name === "LDK" || /^洋室\d+$/.test(r.name)).map(r => ({ f, r })))
    const ldk = living.find(x => x.r.name === "LDK")
    const best = [...living].sort((a, b) => b.r.area - a.r.area)[0]
    if (best && best.r.name !== "LDK" && best.r.area >= 12 && (!ldk || (ldk.r.area < 12 && best.r.area > ldk.r.area * 1.5))) {
      for (const f of floors) {
        let n = Math.max(0, ...f.rooms.map(r => Number(r.name.match(/^洋室(\d+)$/)?.[1] ?? 0)))
        f.rooms = f.rooms.map(r => (r === best.r ? { ...r, name: "LDK" } : r.name === "LDK" ? { ...r, name: `洋室${++n}` } : r))
      }
    }
  }
  // 間取り図の階段の記号から階段を置く（置けない階は読み込み時の自動配置に任せる）
  const stairs: StairSpec[] = []
  for (let i = 0; i + 1 < floors.length; i++) {
    const s = stairFromHints(floors[i], floors[i + 1], [...(sorted[i].stairHints ?? []), ...(sorted[i + 1].stairHints ?? [])], { throughFloor: !!(sorted[i].colored || sorted[i + 1].colored) })
    if (s) stairs.push(s)
  }
  const width = Math.max(...results.map(r => r.footprint.width))
  const depth = Math.max(...results.map(r => r.footprint.depth))
  const spec: BuildingSpec = {
    version: 1,
    name: opts.name,
    source: opts.withPerspective ? "both" : "floorplan",
    footprint: { width, depth },
    wallHeightDefault: floors[0].height,
    openings: { sill: 0.9, head: 2.05 },
    floors,
    roof: { type: opts.roof, pitch: opts.pitch, overhang: 0.45 },
    materials: { ...opts.materials },
    ...(furniture.length ? { furniture } : {}),
  }
  // 図面の上側に玄関があるなど、玄関が道路側（+z）でなければ建物ごと回して玄関を道路に向ける（外構・駐車場・内見の入口が玄関側になる）
  // 階段の外形の中にある「部屋」（下の階の階段の場所・上の階の開口）は階段とする（家具を置かない）
  for (const st of stairs) {
    for (const fl of floors) {
      if (fl.level !== st.fromLevel && fl.level !== st.fromLevel + 1) continue
      const o = fl.level === st.fromLevel ? st : (st.opening ?? st)
      const inside = (r: RoomLabel, b: Rect) => r.x > b.x && r.x < b.x + b.w && r.z > b.z && r.z < b.z + b.d
      // 下の階で、上の階の開口の真下（上り切る側の段の下）にある収納は階段下収納として残す
      const under = fl.level === st.fromLevel ? st.opening : undefined
      fl.rooms = fl.rooms.map(r => (!inside(r, o) ? r : under && inside(r, under) && r.name.startsWith("収納") ? { ...r, name: "階段下収納" } : { ...r, name: "階段" }))
    }
  }
  // 階段の箱に取り込まれた場所（階段下）の設備は置かない
  if (spec.furniture) {
    spec.furniture = spec.furniture.filter(it => !stairs.some(st => it.level === st.fromLevel && it.x > st.x && it.x < st.x + st.w && it.z > st.z && it.z < st.z + st.d))
    if (!spec.furniture.length) delete spec.furniture
  }
  const faced = faceEntranceToRoad(floors.length >= 2 ? { ...spec, stairs } : spec).spec
  // 記号から置けなかった階は自動配置で補う（保存前に決める。読み込み時の補完に頼らない）
  if (floors.length < 2 || opts.autoStairs === false) return faced
  const placed = autoStairs(faced, faced.stairs ?? [])
  // それでも置けない階は、中の壁を外してでも置く（内見で上の階へ行けるようにする）
  for (const f of faced.floors.slice(0, -1)) {
    if (placed.some(s => s.fromLevel === f.level)) continue
    const s = forceStair(faced, f.level, placed)
    if (s) {
      const { forced: _forced, ...stair } = s as StairSpec & { forced?: boolean }
      void _forced
      placed.push(stair)
    }
  }
  return { ...faced, stairs: placed.sort((a, b) => a.fromLevel - b.fromLevel) }
}

export const KIND_COLORS: Record<WallKind, string> = {
  wall: "rgba(220, 38, 38, 0.55)",
  window: "rgba(14, 165, 233, 0.85)",
  glassdoor: "rgba(16, 185, 129, 0.85)",
  door: "rgba(245, 158, 11, 0.9)",
}

/** 解析結果を元画像の上に重ねて描画する（検出の妥当性を目視確認するため） */
export function drawFloorplanOverlay(ctx: CanvasRenderingContext2D, result: FloorplanResult, scale: number) {
  const { bboxPx, pxPerMeter } = result
  const toPx = (m: number, origin: number) => (origin + m * pxPerMeter) * scale
  for (const s of result.floor.slabs) {
    ctx.fillStyle = "rgba(59, 130, 246, 0.08)"
    ctx.fillRect(toPx(s.x, bboxPx.x), toPx(s.z, bboxPx.y), s.w * pxPerMeter * scale, s.d * pxPerMeter * scale)
  }
  for (const r of result.floor.walls) {
    ctx.fillStyle = KIND_COLORS[r.kind]
    ctx.fillRect(toPx(r.x, bboxPx.x), toPx(r.z, bboxPx.y), Math.max(1, r.w * pxPerMeter * scale), Math.max(1, r.d * pxPerMeter * scale))
  }
  ctx.font = `${Math.max(11, 12 * scale)}px system-ui, sans-serif`
  ctx.textAlign = "center"
  for (const room of result.floor.rooms) {
    const x = toPx(room.x, bboxPx.x)
    const y = toPx(room.z, bboxPx.y)
    const label = `${room.name} ${room.area}㎡`
    const tw = ctx.measureText(label).width
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)"
    ctx.fillRect(x - tw / 2 - 4, y - 10, tw + 8, 18)
    ctx.fillStyle = "#fff"
    ctx.fillText(label, x, y + 4)
  }
}

import { test } from "node:test"
import assert from "node:assert/strict"
import { analyzeFloorplan, DEFAULT_FLOORPLAN_OPTIONS } from "../src/lib/floorplan-analyzer.ts"
import { lowerRoofRects } from "../src/lib/building-geometry.ts"

/**
 * 白地に黒い壁の合成図面（縮尺 50px/m）。外壁・間仕切り・開口・扉板・円弧・塗りの丸を描ける。
 * 座標は m（建物の左上が原点）
 */
function canvas(W, D, M = 40) {
  const PPM = 50
  const w = Math.round(W * PPM) + 2 * M
  const h = Math.round(D * PPM) + 2 * M
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  const px = v => Math.round(M + v * PPM)
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    data[i] = data[i + 1] = data[i + 2] = v
  }
  const rect = (x0, z0, x1, z1, v = 30) => { for (let y = px(z0); y < px(z1); y++) for (let x = px(x0); x < px(x1); x++) set(x, y, v) }
  return {
    img: { width: w, height: h, data },
    PPM,
    rect,
    /** 細い線（1px、灰色） */
    line(x0, z0, x1, z1, v = 90) {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * PPM * 2)
      for (let k = 0; k <= n; k++) set(px(x0 + ((x1 - x0) * k) / n), px(z0 + ((z1 - z0) * k) / n), v)
    },
    /** 4 分の 1 円（中心 cx, cz・半径 r・開始角 a0 から a1 まで、ラジアン） */
    arc(cx, cz, r, a0, a1, v = 90) {
      const n = Math.ceil(r * PPM * 4)
      for (let k = 0; k <= n; k++) {
        const a = a0 + ((a1 - a0) * k) / n
        set(px(cx + r * Math.cos(a)), px(cz + r * Math.sin(a)), v)
      }
    },
    /** 塗りの丸（中に白抜きの文字の代わりの四角を 2 つ） */
    badge(cx, cz, r) {
      for (let y = px(cz - r); y <= px(cz + r); y++) for (let x = px(cx - r); x <= px(cx + r); x++) {
        if (Math.hypot((x - px(cx)) / PPM, (y - px(cz)) / PPM) <= r) set(x, y, 60)
      }
      rect(cx - r * 0.5, cz - r * 0.4, cx - r * 0.25, cz + r * 0.4, 255)
      rect(cx + r * 0.05, cz - r * 0.4, cx + r * 0.45, cz - r * 0.2, 255)
    },
  }
}

/** 外壁 0.15m の箱 */
function box(c, W, D, T = 0.15) {
  c.rect(0, 0, W, T)
  c.rect(0, D - T, W, D)
  c.rect(0, 0, T, D)
  c.rect(W - T, 0, W, D)
}

/** 解析結果の壁の矩形から、外周から壁を通らずに部屋の中まで入れるセルの数（3D の外壁の縦の隙間） */
function leaks(r) {
  const cell = 0.05
  const W = r.footprint.width, D = r.footprint.depth
  const cols = Math.ceil(W / cell) + 4, rows = Math.ceil(D / cell) + 4
  const occ = new Uint8Array(cols * rows)
  for (const w of r.floor.walls) {
    for (let z = Math.floor(w.z / cell + 1e-6) + 2; z < Math.ceil((w.z + w.d) / cell - 1e-6) + 2; z++) for (let x = Math.floor(w.x / cell + 1e-6) + 2; x < Math.ceil((w.x + w.w) / cell - 1e-6) + 2; x++) occ[z * cols + x] = 1
  }
  const out = new Uint8Array(cols * rows)
  const st = []
  for (let c = 0; c < cols; c++) st.push(c, (rows - 1) * cols + c)
  for (let q = 0; q < rows; q++) st.push(q * cols, q * cols + cols - 1)
  while (st.length) {
    const p = st.pop()
    if (out[p] || occ[p]) continue
    out[p] = 1
    const c = p % cols
    if (c > 0) st.push(p - 1)
    if (c < cols - 1) st.push(p + 1)
    if (p >= cols) st.push(p - cols)
    if (p + cols < out.length) st.push(p + cols)
  }
  // 建物の中央付近（外周から 0.5m 以上内側）に外が届いたセル
  let n = 0
  for (let q = 0; q < rows; q++) for (let c = 0; c < cols; c++) {
    const x = (c - 2) * cell, z = (q - 2) * cell
    if (out[q * cols + c] && x > 0.5 && z > 0.5 && x < W - 0.5 && z < D - 0.5) n++
  }
  return n
}

const analyze = (img, W, level = 0) => analyzeFloorplan(img, { ...DEFAULT_FLOORPLAN_OPTIONS, widthMeters: W, level })

test("外壁の 0.5m 未満の途切れは、0.25m 以上なら小窓、それ未満なら壁で埋める（3D の外壁に縦の隙間を残さない）", () => {
  const W = 6, D = 5
  const c = canvas(W, D)
  box(c, W, D)
  c.rect(3, 0, 3.15, D) // 間仕切り
  // 上の外壁に 0.33m の小窓（トイレの窓）、右の外壁に 0.1m の途切れ（記号で途切れた壁）
  c.rect(1.0, 0, 1.33, 0.15, 255)
  c.line(1.0, 0.07, 1.33, 0.07)
  c.rect(W - 0.15, 2.0, W, 2.1, 255)
  const r = analyze(c.img, W)
  assert.equal(leaks(r), 0)
  const near = (kind, x, z) => r.floor.walls.some(w => w.kind === kind && x >= w.x - 0.06 && x <= w.x + w.w + 0.06 && z >= w.z - 0.06 && z <= w.z + w.d + 0.06)
  assert.ok(near("window", 1.15, 0.07), "小窓")
  assert.ok(near("wall", W - 0.07, 2.05), "細い途切れは壁")
})

test("外壁の隅で 2 本の壁の端が食い違っていても、外から部屋へ抜けない", () => {
  const W = 6, D = 5
  const c = canvas(W, D)
  // 左上の隅: 左の外壁が内側へ 5cm ずれて z=0.22 から始まり、上の外壁との間に 7cm の食い違いの抜けがある
  c.rect(0, 0, W, 0.15)
  c.rect(0, D - 0.15, W, D)
  c.rect(0.05, 0.22, 0.2, D)
  c.rect(W - 0.15, 0, W, D)
  const r = analyze(c.img, W)
  assert.equal(leaks(r), 0)
})

test("開いた状態で描かれた扉板（細い線 + 4 分の 1 円）は壁にせず、閉じた位置をドアにする", () => {
  const W = 6, D = 5
  const c = canvas(W, D)
  box(c, W, D)
  // 横の間仕切り z=2.0〜2.15、x=2.0〜2.7 が扉の開口（左右の壁の端が抱き）
  c.rect(0, 2.0, 2.0, 2.15)
  c.rect(2.7, 2.0, W, 2.15)
  // 扉板: 蝶番 (2.7, 2.15) から下へ 0.7m、開き勝手の円弧は閉じた位置 (2.0, 2.15) まで
  c.rect(2.66, 2.15, 2.72, 2.85, 80)
  c.arc(2.7, 2.15, 0.7, Math.PI / 2, Math.PI)
  const r = analyze(c.img, W)
  const at = (x, z) => r.floor.walls.filter(w => x >= w.x && x <= w.x + w.w && z >= w.z && z <= w.z + w.d).map(w => w.kind)
  // 扉板の中ほど（2.69, 2.6）に壁が無い（内見で通れる）
  assert.ok(!at(2.69, 2.6).includes("wall"), `扉板が壁のまま: ${at(2.69, 2.6)}`)
  // 開口（2.35, 2.07）はドア
  assert.ok(at(2.35, 2.07).includes("door"), `閉じた位置がドアでない: ${at(2.35, 2.07)}`)
})

test("壁に沿って開いた扉板は、隣の壁を消さない", () => {
  const W = 6, D = 5
  const c = canvas(W, D)
  box(c, W, D)
  // 横の間仕切り（x=1.3〜2.0 が扉の開口）と、開口の右端から下へ伸びる縦の間仕切り
  c.rect(0, 2.0, 1.3, 2.15)
  c.rect(2.0, 2.0, W, 2.15)
  c.rect(2.0, 2.15, 2.15, D)
  // 扉板は縦の間仕切りに沿って開く（間仕切りの左に接して下へ 0.7m）
  c.rect(1.95, 2.15, 2.0, 2.85, 80)
  c.arc(2.0, 2.15, 0.7, Math.PI / 2, Math.PI)
  const r = analyze(c.img, W)
  const at = (x, z) => r.floor.walls.filter(w => x >= w.x && x <= w.x + w.w && z >= w.z && z <= w.z + w.d).map(w => w.kind)
  assert.ok(at(2.08, 2.5).includes("wall"), `縦の間仕切りが消えた: ${at(2.08, 2.5)}`)
  assert.ok(at(2.08, 4.0).includes("wall"))
})

test("図面に接して描かれた階の表記の丸いバッジ（白抜きの文字）は壁にしない", () => {
  const W = 6, D = 5
  const c = canvas(W, D, 60)
  box(c, W, D)
  c.badge(W + 0.35, D + 0.35, 0.45)
  const r = analyze(c.img, W)
  // 建物の外（右下）に壁の塊が無い
  const outside = r.floor.walls.filter(w => w.x > W - 0.05 + 0.15 || w.z > D - 0.05 + 0.15)
  assert.equal(outside.length, 0, JSON.stringify(outside.slice(0, 3)))
})

test("下の階だけの部分（上の階の床に覆われない範囲）に陸屋根の範囲を返す", () => {
  const floor = (level, slabs) => ({ level, height: 2.8, walls: [], rooms: [], slabs })
  const spec = { floors: [floor(0, [{ x: 0, z: 0, w: 9, d: 7 }]), floor(1, [{ x: 0, z: 0, w: 9, d: 5.8 }, { x: 0, z: 5.8, w: 2, d: 0.04 }])] }
  const out = lowerRoofRects(spec)
  assert.equal(out.length, 1)
  assert.equal(out[0].level, 0)
  const area = out[0].rects.reduce((a, r) => a + r.w * r.d, 0)
  assert.ok(Math.abs(area - 9 * 1.2) < 0.1, `面積 ${area}`)
  // 最上階には返さない・同じ形の階には返さない
  assert.deepEqual(lowerRoofRects({ floors: [floor(0, [{ x: 0, z: 0, w: 9, d: 7 }]), floor(1, [{ x: 0, z: 0, w: 9, d: 7 }])] }), [])
})

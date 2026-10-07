/**
 * 不動産サイトの間取り図は、1 枚の画像に 1F・2F（・3F）を並べて描くことが多い。
 * 1 枚の画像から階ごとの図面の範囲を見つける（純関数。ブラウザでは cropDataUrl で切り出す）。
 *
 * - 白地でない画素（線・塗り）の行・列の投影で、全部が白い帯ごとに再帰的に分ける（XY 分割。階と階の間の余白で分かれる）
 * - 最も大きい塊の 25% 未満の塊（方位記号・表記・吹抜の小さな図・凡例）は階にしない
 * - 並び順: 横に並べた図面は左から、縦 1 列に積んだ図面は下から 1F（上の階を上に描く）
 * 同じ画像から切り出した階は縮尺（1m あたりの画素）が同じ。横幅の比を保って縮尺を合わせる
 */

export type SheetBlock = { x: number; y: number; w: number; h: number }

type ImageLike = { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export function findFloorBlocks(image: ImageLike): SheetBlock[] {
  const { width: w, height: h, data } = image
  // 白地でない画素（線・塗り）。JPEG のにじみは輝度 225 以上・彩度 18 以下なら白とみなす
  const ink = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3]
    if (a < 40) continue
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    ink[i] = lum < 225 || Math.max(r, g, b) - Math.min(r, g, b) > 18 ? 1 : 0
  }
  // 図面全体に比べて小さな孤立した塊（階の表記「1F」・方位記号・注記の文字）は、分割の判定から外す。
  // 小さな画像に図面を詰めて描いた図面では、階と階の間に置いた「1F」の表記が両側の外壁と 2〜3px で接し、白い帯ができない
  const small = smallComponents(ink, w, h)
  const cutInk = small.mask ? ink.map((v, i) => (v && !small.mask![i] ? 1 : 0)) : ink
  // 再帰的な XY 分割: 全部が白い行（列）の帯で区切る。1 つの階の図面の中には、外壁が続くので全部が白い行・列は無い
  // （細い線を投影から外して吹き出しの引き出し線を切る案は、細い線で描いたポーチ・バルコニーまで切り落とした）
  const gap = Math.max(5, Math.round(Math.max(w, h) * 0.008))
  const leaves: SheetBlock[] = []
  const cut = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const rowInk = new Uint32Array(y1 - y0)
    const colInk = new Uint32Array(x1 - x0)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (cutInk[y * w + x]) { rowInk[y - y0]++; colInk[x - x0]++ }
    // 墨のある範囲に詰める
    let t = 0, bt = rowInk.length - 1, l = 0, rt = colInk.length - 1
    while (t <= bt && rowInk[t] === 0) t++
    while (bt >= t && rowInk[bt] === 0) bt--
    while (l <= rt && colInk[l] === 0) l++
    while (rt >= l && colInk[rt] === 0) rt--
    if (t > bt || l > rt) return
    const X0 = x0 + l, X1 = x0 + rt + 1, Y0 = y0 + t, Y1 = y0 + bt + 1
    const splitAt = (prof: Uint32Array, from: number, to: number) => {
      const parts: [number, number][] = []
      let start = from, run = 0
      for (let i = from; i < to; i++) {
        if (prof[i] <= 1) run++
        else {
          if (run >= gap && i - run > start) parts.push([start, i - run])
          if (run >= gap) start = i
          run = 0
        }
      }
      parts.push([start, to])
      return parts
    }
    if (depth < 8) {
      const rowsParts = splitAt(rowInk, t, bt + 1)
      if (rowsParts.length > 1) { for (const [a, b] of rowsParts) cut(X0, y0 + a, X1, y0 + b, depth + 1); return }
      const colParts = splitAt(colInk, l, rt + 1)
      if (colParts.length > 1) { for (const [a, b] of colParts) cut(x0 + a, Y0, x0 + b, Y1, depth + 1); return }
    }
    leaves.push({ x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 })
  }
  cut(0, 0, w, h, 0)
  if (!leaves.length) return []
  const area = (b: SheetBlock) => b.w * b.h
  const largest = Math.max(...leaves.map(area))
  // 図面らしい塊: 大きさが最大の 25% 以上、短辺が画像の短辺の 12% 以上（方位記号・表記・吹抜の小さな図・凡例は除く）
  const blocks = leaves.filter(c => area(c) >= largest * 0.25 && Math.min(c.w, c.h) >= Math.min(w, h) * 0.12)
  // 外した小さな塊のうち、1 つの階だけに接するもの（3px 以内。玄関ポーチの段・出窓など）はその階の範囲に戻す。
  // 離して書いた階の表記・方位記号は戻さない
  const touch = 3
  for (const c of small.boxes) {
    const near = blocks.filter(b => c.x < b.x + b.w + touch && c.x + c.w > b.x - touch && c.y < b.y + b.h + touch && c.y + c.h > b.y - touch)
    if (near.length !== 1) continue
    const b = near[0]
    const x1 = Math.max(b.x + b.w, c.x + c.w), y1 = Math.max(b.y + b.h, c.y + c.h)
    b.x = Math.min(b.x, c.x)
    b.y = Math.min(b.y, c.y)
    b.w = x1 - b.x
    b.h = y1 - b.y
  }
  return orderBlocks(blocks)
}

/**
 * 墨の連結成分（8 近傍）のうち、墨全体の範囲の長辺の 5% 未満（最低 6px）に収まる小さなものを返す。
 * 1 つしかない・すべてが小さい（図面が無い）ときは何も外さない
 */
function smallComponents(ink: Uint8Array, w: number, h: number): { mask: Uint8Array | null; boxes: SheetBlock[] } {
  const label = new Int32Array(w * h).fill(-1)
  const comps: { x0: number; y0: number; x1: number; y1: number }[] = []
  const stack = new Int32Array(w * h)
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let s = 0; s < w * h; s++) {
    if (!ink[s] || label[s] >= 0) continue
    const id = comps.length
    const c = { x0: w, y0: h, x1: -1, y1: -1 }
    let top = 0
    stack[top++] = s
    label[s] = id
    while (top) {
      const p = stack[--top]
      const x = p % w, y = (p - x) / w
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const q = yy * w + xx
          if (ink[q] && label[q] < 0) {
            label[q] = id
            stack[top++] = q
          }
        }
      }
    }
    comps.push(c)
    minX = Math.min(minX, c.x0); minY = Math.min(minY, c.y0); maxX = Math.max(maxX, c.x1); maxY = Math.max(maxY, c.y1)
  }
  if (comps.length < 2) return { mask: null, boxes: [] }
  const limit = Math.max(6, Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.05))
  const isSmall = comps.map(c => Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) < limit)
  if (isSmall.every(Boolean) || !isSmall.some(Boolean)) return { mask: null, boxes: [] }
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && isSmall[label[i]]) mask[i] = 1
  const boxes = comps.filter((_, i) => isSmall[i]).map(c => ({ x: c.x0, y: c.y0, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 }))
  return { mask, boxes }
}

/** 階の順に並べる: 縦 1 列に積んだ図面（上の階を上に描く）は下から 1F、それ以外は上の行から・行の中は左から */
export function orderBlocks(blocks: SheetBlock[]): SheetBlock[] {
  // 行に分ける（縦に重なる塊は同じ行）→ 上の行から、行の中は左から
  const sorted = [...blocks].sort((a, b) => a.y - b.y)
  const rowsOf: SheetBlock[][] = []
  for (const b of sorted) {
    const row = rowsOf.find(rw => rw.some(o => Math.min(o.y + o.h, b.y + b.h) - Math.max(o.y, b.y) > Math.min(o.h, b.h) * 0.3))
    if (row) row.push(b)
    else rowsOf.push([b])
  }
  // 縦 1 列に積んだ図面（上の階を上に描く。最上部に塔屋・屋上の小さな図）は下から 1F。横に並べた図面は左から 1F
  if (rowsOf.length >= 2 && rowsOf.every(rw => rw.length === 1)) return rowsOf.map(rw => rw[0]).reverse()
  return rowsOf.flatMap(rw => rw.sort((a, b) => a.x - b.x))
}

/**
 * 物件の階数より多く見つかったら、小さい順に外す（塔屋・屋上テラス・ロフト・吹抜の図。階数に数えない）。
 * 外した後に並べ直す（「2F・ロフト」の行の下に「1F」を描いた図面は、ロフトを外すと縦 1 列になり下から 1F）
 */
export function pickFloors(blocks: SheetBlock[], floors?: number): SheetBlock[] {
  if (!floors || blocks.length <= floors) return blocks
  const keep = new Set([...blocks].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, floors))
  return orderBlocks(blocks.filter(b => keep.has(b)))
}

/** 切り出す範囲（塊の周りに少し余白を足す。画像の外にははみ出さない） */
export function cropRect(block: SheetBlock, image: { width: number; height: number }, marginRatio = 0.04): SheetBlock {
  const m = Math.round(Math.max(block.w, block.h) * marginRatio)
  const x = Math.max(0, block.x - m)
  const y = Math.max(0, block.y - m)
  return { x, y, w: Math.min(image.width, block.x + block.w + m) - x, h: Math.min(image.height, block.y + block.h + m) - y }
}

/**
 * 切り出した階の図面を拡大する倍率（全階で同じ倍率にして縮尺の比を保つ）。3 階建てを田の字に並べた図面などは 1 階分が 150px ほどしかなく、
 * 0.05m の格子が 1〜2px になって間仕切り・階段の記号が取れない。いちばん大きい階の長辺が 350px 未満なら、700px 前後になるよう最大 3 倍まで拡大する
 */
export function upscaleFactor(crops: { w: number; h: number }[]): number {
  const longest = Math.max(0, ...crops.map(c => Math.max(c.w, c.h)))
  // 2 階建てを横に並べた図面（1 階分 350〜500px）はそのまま。拡大すると線のにじみが太り、かえって結果がぶれる
  if (!longest || longest >= 350) return 1
  return Math.min(3, Math.round((700 / longest) * 4) / 4)
}

import type { Materials } from "@/lib/building-spec"

/**
 * 外観パース（写真・CG）から外壁・屋根・地面の色味を推定する。ブラウザ内で完結。
 * 画像を上・中・下の帯に分け、空らしい画素（高明度の青/白）を除いた k-means の最大クラスタを採用する。
 * 寸法・階数・屋根形状は画像からは確定できないため、UI で入力する（AI 解析は拡張ポイント）。
 */

type RGB = [number, number, number]

const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")

function isSky([r, g, b]: RGB) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const bright = max > 200 && max - min < 40
  const blue = b > 150 && b > r + 20 && b > g
  return bright || blue
}

function isGreen([r, g, b]: RGB) {
  return g > r + 10 && g > b + 10
}

function kmeans(pixels: RGB[], k: number, iterations = 8): { color: RGB; count: number }[] {
  if (pixels.length === 0) return []
  const centers: RGB[] = Array.from({ length: k }, (_, i) => [...pixels[Math.floor((i + 0.5) * (pixels.length / k))]] as RGB)
  const assign = new Int32Array(pixels.length)
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    pixels.forEach((p, i) => {
      let best = 0
      let bestD = Infinity
      centers.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
        if (d < bestD) { bestD = d; best = j }
      })
      assign[i] = best
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++
    })
    centers.forEach((c, j) => {
      if (sums[j][3]) { c[0] = sums[j][0] / sums[j][3]; c[1] = sums[j][1] / sums[j][3]; c[2] = sums[j][2] / sums[j][3] }
    })
  }
  const counts = new Array(k).fill(0)
  assign.forEach(a => counts[a]++)
  return centers.map((color, i) => ({ color, count: counts[i] })).sort((a, b) => b.count - a.count)
}

function sampleBand(img: ImageData, y0: number, y1: number, x0 = 0.1, x1 = 0.9): RGB[] {
  const out: RGB[] = []
  const { width: w, height: h, data } = img
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 12000)))
  for (let y = Math.floor(h * y0); y < Math.floor(h * y1); y += step) {
    for (let x = Math.floor(w * x0); x < Math.floor(w * x1); x += step) {
      const i = (y * w + x) * 4
      out.push([data[i], data[i + 1], data[i + 2]])
    }
  }
  return out
}

export type PerspectiveAnalysis = {
  materials: Partial<Materials>
  palette: string[]
  aspect: number
}

export function analyzePerspective(img: ImageData): PerspectiveAnalysis {
  const top = sampleBand(img, 0.05, 0.4).filter(p => !isSky(p) && !isGreen(p))
  const mid = sampleBand(img, 0.4, 0.75, 0.15, 0.85).filter(p => !isSky(p) && !isGreen(p))
  const bottom = sampleBand(img, 0.8, 1, 0, 1)
  const all = sampleBand(img, 0, 1, 0, 1)

  const roof = kmeans(top, 3)
  const wall = kmeans(mid, 4)
  const ground = kmeans(bottom, 3)
  const palette = kmeans(all, 6).map(c => toHex(c.color))

  const luminance = ([r, g, b]: RGB) => 0.299 * r + 0.587 * g + 0.114 * b
  // 屋根は上部帯で最も暗めの主要クラスタ、外壁は中央帯の最大クラスタ
  const roofColor = roof.filter(c => c.count > top.length * 0.15).sort((a, b) => luminance(a.color) - luminance(b.color))[0]?.color
  const wallColor = wall[0]?.color
  const trimColor = wall.length > 1 ? [...wall].sort((a, b) => luminance(a.color) - luminance(b.color))[0].color : undefined
  const groundColor = ground.find(c => isGreen(c.color))?.color ?? ground[0]?.color

  const materials: Partial<Materials> = {}
  if (wallColor) materials.exteriorWall = toHex(wallColor)
  if (roofColor) materials.roof = toHex(roofColor)
  if (trimColor) materials.trim = toHex(trimColor)
  if (groundColor) materials.ground = toHex(groundColor)
  return { materials, palette, aspect: img.width / img.height }
}

/** 画像ファイル → 縮小済み data URL（Dataverse の複数行テキストに収まるサイズへ） */
export async function fileToDataUrl(file: File, maxDim = 1200, quality = 0.85): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const img = await loadImage(src)
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  // 間取り図の線画は PNG、写真・CG は JPEG が小さくなりやすいため、短い方を採用する
  const jpeg = canvas.toDataURL("image/jpeg", quality)
  if (file.type !== "image/png") return jpeg
  const png = canvas.toDataURL("image/png")
  return png.length < jpeg.length ? png : jpeg
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("画像を読み込めませんでした"))
    img.src = src
  })
}

export async function imageDataFromUrl(src: string, maxDim = 1000): Promise<ImageData> {
  const img = await loadImage(src)
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** 画像（data URL）の一部を切り出して data URL にする（間取り図を階ごとに分ける。scale で拡大。全階で同じ倍率なら縮尺の比は保たれる） */
export async function cropDataUrl(src: string, r: { x: number; y: number; w: number; h: number }, scale = 1): Promise<string> {
  const img = await loadImage(src)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(r.w * scale)
  canvas.height = Math.round(r.h * scale)
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingQuality = "high"
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height)
  // 案件の画像は Dataverse の 1 列（約 1MB）に入れるので JPEG にする（線の解析は 0.9 なら変わらない）
  return canvas.toDataURL("image/jpeg", 0.9)
}

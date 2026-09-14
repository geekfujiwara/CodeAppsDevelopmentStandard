/**
 * ブラウザ内だけで完結する図面出力。
 *
 * - SVG: ベクターのまま保存する（CAD ではなく確認・レビュー用）
 * - PDF: SVG を A3 の JPEG に描き直して 1 ページの PDF に埋め込む**ラスター出力**
 *
 * ベクター PDF と注釈一覧の帳票は agent-skill/renderer.py（ReportLab / PyMuPDF）側で生成する。
 * ここでは追加依存を持ち込まないことを優先している。
 */
import type { Drawing } from "./drawing-schema.ts"
import { buildScene } from "./drawing-renderer.ts"
import { sceneToSvg } from "./drawing-scene.ts"

const MM_PER_INCH = 25.4
const PT_PER_MM = 72 / MM_PER_INCH

export function drawingToSvg(drawing: Drawing): string {
  return sceneToSvg(buildScene(drawing))
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Safari で即時 revoke すると保存が中断されることがあるため次フレームで解放する
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadSvg(drawing: Drawing, filename: string): void {
  downloadBlob(new Blob([drawingToSvg(drawing)], { type: "image/svg+xml;charset=utf-8" }), filename)
}

/** Blob へそのまま渡せるよう、SharedArrayBuffer を含まないバイト列に固定する。 */
type Bytes = Uint8Array<ArrayBuffer>

function latin1(value: string): Bytes {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff
  return bytes
}

function base64ToBytes(base64: string): Bytes {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function concat(chunks: Bytes[]): Bytes {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

async function rasterize(svg: string, widthMm: number, heightMm: number, dpi: number): Promise<{ jpeg: Bytes; width: number; height: number }> {
  const width = Math.round((widthMm / MM_PER_INCH) * dpi)
  const height = Math.round((heightMm / MM_PER_INCH) * dpi)
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const image = new Image()
  image.width = width
  image.height = height
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("SVG をラスター化できませんでした"))
    image.src = source
  })

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas 2D コンテキストを取得できませんでした")
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
  return { jpeg: base64ToBytes(dataUrl.slice(dataUrl.indexOf(",") + 1)), width, height }
}

/** PDF のテキスト文字列。日本語を化けさせないため UTF-16BE の 16 進表記にする。 */
function pdfTextString(value: string): string {
  let hex = "FEFF"
  for (let index = 0; index < value.length; index += 1) {
    hex += value.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase()
  }
  return `<${hex}>`
}

/** 追加ライブラリなしで 1 ページの PDF（JPEG 埋め込み）を組み立てる。 */
function buildPdf(jpeg: Bytes, pixelWidth: number, pixelHeight: number, widthMm: number, heightMm: number, title: string): Blob {
  const pageWidth = (widthMm * PT_PER_MM).toFixed(2)
  const pageHeight = (heightMm * PT_PER_MM).toFixed(2)
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q\n`
  const safeTitle = pdfTextString(title.slice(0, 80))

  const objects: Bytes[] = [
    latin1("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    latin1("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    latin1(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
    ),
    latin1(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`),
    concat([
      latin1(
        `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      latin1("\nendstream\nendobj\n"),
    ]),
    latin1(`6 0 obj\n<< /Title ${safeTitle} /Producer (drawing-communication sample) >>\nendobj\n`),
  ]

  const header = latin1("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n")
  const offsets: number[] = []
  let position = header.length
  for (const object of objects) {
    offsets.push(position)
    position += object.length
  }

  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "]
  for (const offset of offsets) xrefLines.push(`${String(offset).padStart(10, "0")} 00000 n `)
  const xref = latin1(
    `${xrefLines.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${position}\n%%EOF\n`,
  )

  return new Blob([concat([header, ...objects, xref])], { type: "application/pdf" })
}

/**
 * A3 1 ページの PDF を生成する。中身はラスター画像なので、寸法の再計測や文字検索はできない。
 * 配布用のベクター PDF が必要なときは Python 側の renderer.py を使うこと。
 */
export async function exportPdf(drawing: Drawing, dpi = 200): Promise<Blob> {
  const svg = drawingToSvg(drawing)
  const { jpeg, width, height } = await rasterize(svg, drawing.sheet.widthMm, drawing.sheet.heightMm, dpi)
  return buildPdf(jpeg, width, height, drawing.sheet.widthMm, drawing.sheet.heightMm, `${drawing.titleBlock.drawingNumber} ${drawing.titleBlock.title}`)
}

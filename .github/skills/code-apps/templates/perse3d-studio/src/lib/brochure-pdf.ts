import { PDFDocument, rgb, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { brochureErrors, brochureFactErrors, type BrochureImage, type BrochureInput } from "./brochure.ts"

const W = 595.28, H = 841.89, M = 34, CW = W - M * 2
const INK = rgb(0.07, 0.15, 0.22), BLUE = rgb(0.025, 0.32, 0.45), PALE = rgb(0.94, 0.97, 0.98), MUTED = rgb(0.36, 0.42, 0.48)

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",")
  if (comma < 0 || !/^data:[^;,]+;base64$/i.test(dataUrl.slice(0, comma))) {
    throw new Error("画像またはフォントがdata URLではありません。案件に画像を取り込み直してください")
  }
  // 数MBのフォントで巨大な正規表現キャプチャ・文字列イテレーター配列を作らない。
  const bin = atob(dataUrl.slice(comma + 1).replace(/\s/g, ""))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** 日本語は文字単位で折り返し、長いURLや空白のない文字列でもページ幅を超えない。省略せず全行を出力する。 */
export function wrapPdfText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  for (const p of text.replace(/\r/g, "").replace(/\t/g, " ").split("\n")) {
    let line = ""
    for (const ch of p) {
      if (line && font.widthOfTextAtSize(line + ch, size) > width) { lines.push(line); line = "" }
      line += ch
    }
    lines.push(line)
  }
  return lines
}

/** PDFはブラウザ内だけで作成。フォントは同梱し、掲載画像以外の外部通信・印刷ダイアログ・iframeを使わない。 */
export async function createBrochurePdf(input: BrochureInput, fontBytes: Uint8Array): Promise<Uint8Array> {
  const errors = [...brochureErrors(input.draft), ...brochureFactErrors(input.facts)]
  if (errors.length) throw new Error(errors.join("\n"))
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  // このCJKフォントはfontkitのサブセット化で文字を抽出できても描画が欠ける。実際の表示を優先して全グリフを埋め込む。
  const font = await pdf.embedFont(fontBytes, {
    subset: false,
    // 文脈によるlocl等の代替グリフはToUnicodeと食い違うことがある。住所・価格・免許番号を検索/コピーできる字形に固定する。
    features: { vert: false, vrt2: false, locl: false, liga: false, clig: false },
  })
  const charset = new Set(font.getCharacterSet())
  const d = input.draft
  const allText = [d.title, d.price, d.address, d.headline, d.description, d.company, d.companyAddress, d.phone, d.license, d.transaction,
    ...input.facts.map(f => f.label + f.value), ...input.floorplans.map(f => f.label), input.hero?.label ?? "", input.source?.url ?? "", input.modelDisclaimer]
  const missing = [...new Set([...allText.join("")].filter(ch => !/\s/.test(ch) && !charset.has(ch.codePointAt(0)!)))]
  if (missing.length) throw new Error(`PDF用フォントにない文字があります。修正してください: ${missing.slice(0, 15).join(" ")}`)
  pdf.setTitle(d.title + " 販売用パンフレット")
  pdf.setAuthor(d.company)
  pdf.setSubject("物件情報・受領間取り図・参考3Dイメージ")
  pdf.setLanguage("ja-JP")
  const contactLines = [d.company, d.companyAddress, `TEL ${d.phone}  /  ${d.license}`, `取引態様: ${d.transaction}`]
    .flatMap(t => wrapPdfText(t, font, 7, CW))
  const footerTop = Math.max(88, 30 + contactLines.length * 9)
  const bottom = footerTop + 22
  let page: PDFPage = pdf.addPage([W, H]), y = H - 90, firstPage = true
  const draw = (text: string, x: number, yy: number, size = 10, color = INK) => {
    page.drawText(text, { x, y: yy, size, font, color })
  }
  const heading = (title: string) => {
    if (firstPage) firstPage = false
    else page = pdf.addPage([W, H])
    page.drawRectangle({ x: 0, y: H - 48, width: W, height: 48, color: BLUE })
    draw("PROPERTY COLLECTION", M, H - 30, 12, rgb(1, 1, 1))
    // 会社名は長い場合も折り返す（ページの横幅を超えない）。
    const company = wrapPdfText(d.company, font, 8, 245)
    company.slice(0, 2).forEach((s, i) => draw(s, W - M - 245, H - 23 - i * 11, 8, rgb(1, 1, 1)))
    y = H - 79
    draw(title, M, y, 13, BLUE)
    y -= 25
    return page
  }
  const paragraph = (text: string, size = 10, width = CW, x = M, lineHeight = size * 1.6, next = "ご紹介（続き）") => {
    for (const line of wrapPdfText(text, font, size, width)) {
      if (y < bottom) heading(next)
      draw(line, x, y, size)
      y -= lineHeight
    }
  }
  const image = async (item: BrochureImage): Promise<PDFImage> => {
    try {
      const bytes = dataUrlBytes(item.dataUrl)
      if (/^data:image\/png;/i.test(item.dataUrl)) return await pdf.embedPng(bytes)
      if (/^data:image\/jpeg;/i.test(item.dataUrl)) return await pdf.embedJpg(bytes)
      throw new Error("JPEG / PNGのみ対応しています")
    } catch (e) {
      throw new Error(`「${item.label}」をPDFに載せられませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const imageBox = async (item: BrochureImage, x: number, top: number, w: number, h: number) => {
    const img = await image(item)
    const k = Math.min(w / img.width, h / img.height)
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: PALE })
    page.drawImage(img, { x: x + (w - img.width * k) / 2, y: top - h + (h - img.height * k) / 2, width: img.width * k, height: img.height * k })
  }
  heading("販売物件のご案内")
  paragraph(d.title, 19, CW, M, 26)
  y -= 3
  paragraph(d.price, 25, CW, M, 31)
  paragraph(d.address, 10)
  const access = input.facts.find(f => f.label === "交通")?.value
  if (access) paragraph(access, 9)
  if (input.hero) {
    if (y - 244 < bottom) heading("外観・参考イメージ")
    await imageBox(input.hero, M, y - 4, CW, 215)
    y -= 234
    paragraph(input.hero.label, 8)
  }
  if (d.headline) { y -= 6; paragraph(d.headline, 13, CW, M, 20) }
  if (d.description) { y -= 8; paragraph(d.description, 10) }
  y -= 10
  paragraph("物件概要・各階の間取り図を次ページ以降に掲載しています。", 9)

  heading("物件概要")
  for (const fact of input.facts) {
    const lines = wrapPdfText(fact.value, font, 9, CW - 111)
    for (let i = 0; i < lines.length; i++) {
      if (y < bottom + 18) heading("物件概要（続き）")
      page.drawRectangle({ x: M, y: y - 6, width: 99, height: 18, color: PALE })
      draw(i === 0 ? fact.label : "（続き）", M + 7, y, 8)
      draw(lines[i], M + 110, y, 9)
      y -= 20
    }
    y -= 4
  }
  y -= 10
  paragraph(input.modelDisclaimer, 8, CW, M, 12, "確認事項")
  if (input.source?.url) {
    y -= 6
    paragraph("取り込み元: " + input.source.url, 7, CW, M, 11, "確認事項（続き）")
    if (input.source.fetchedAt) paragraph("取得日: " + input.source.fetchedAt.slice(0, 10), 8)
  }
  if (!input.floorplans.length) {
    y -= 8
    paragraph("間取り図は未登録です。担当者にお問い合わせください。", 9)
  }
  for (let i = 0; i < input.floorplans.length; i += 2) {
    heading("間取り図")
    for (const item of input.floorplans.slice(i, i + 2)) {
      if (y - 300 < bottom) heading("間取り図（続き）")
      paragraph(item.label, 10)
      await imageBox(item, M, y + 3, CW, 268)
      y -= 292
    }
    paragraph("図面画像は受領した原図です。手動補正・再構成3Dとは区別してご確認ください。", 8)
  }
  for (const [i, p] of pdf.getPages().entries()) {
    page = p
    page.drawLine({ start: { x: M, y: footerTop }, end: { x: W - M, y: footerTop }, thickness: 0.6, color: BLUE })
    let yy = footerTop - 14
    for (const line of contactLines) { draw(line, M, yy, 7, MUTED); yy -= 9 }
    draw(`発行 ${d.issuedOn}  /  情報有効期限 ${d.validUntil}`, M, 15, 6.5, MUTED)
    draw(`${i + 1} / ${pdf.getPageCount()}`, W - M - 30, 15, 7, MUTED)
  }
  return pdf.save()
}

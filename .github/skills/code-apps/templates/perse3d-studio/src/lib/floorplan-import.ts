import { cropRect, findFloorBlocks, pickFloors, upscaleFactor } from "@/lib/floorplan-sheet"
import { cropDataUrl, fileToDataUrl, imageDataFromUrl } from "@/lib/perspective-analyzer"

/**
 * 1 枚の間取り図（1F・2F を並べた不動産サイトの図面）を階ごとに切り出す。2 階分以上に分けられたときだけ切り出した画像を返す。
 * 手動のアップロードと物件ページからの取り込みで同じ処理を使う（同じ前処理を通した画像で解析する）
 */
export async function splitFloorplanSheet(url: string, floors?: number): Promise<string[] | null> {
  const sheet = await imageDataFromUrl(url, 1400)
  const blocks = pickFloors(findFloorBlocks(sheet), floors)
  if (blocks.length < 2) return null
  const rects = blocks.map(b => cropRect(b, sheet))
  const scale = upscaleFactor(rects)
  return Promise.all(rects.map(r => cropDataUrl(url, r, scale)))
}

/** data URL をファイルに戻す（fetch は CSP の connect-src で止まるので使わない） */
function dataUrlToFile(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(",")
  const mime = dataUrl.slice(0, comma).match(/^data:([^;,]+)/)?.[1] ?? "image/jpeg"
  const bin = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], name, { type: mime })
}

/** 取得した画像に、手動のアップロードと同じ前処理（縮小・再圧縮）をかける。外観は 1200px、間取り図は 1400px */
export function normalizeImage(dataUrl: string, kind: "perspective" | "floorplan"): Promise<string> {
  return fileToDataUrl(dataUrlToFile(dataUrl, kind === "perspective" ? "exterior.jpg" : "floorplan.jpg"), kind === "perspective" ? 1200 : 1400)
}

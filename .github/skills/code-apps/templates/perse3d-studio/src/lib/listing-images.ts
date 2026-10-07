import { normalizeImage, splitFloorplanSheet } from "@/lib/floorplan-import"
import { fetchListingImage, fetchListingImageRefs } from "@/lib/listing-source"
import type { SourceImages } from "@/types/project"

export type ListingImagesResult = {
  images: SourceImages
  /** 取り込んだ外観の種類（完成予想図(外観) / 現地外観写真） */
  exteriorLabel?: string
  /** 階ごとに切り出せた階数（切り出せなければ 0） */
  floorsSplit: number
  /** 画面に出す注意（階に分けられなかった・間取り図が無いなど） */
  warning?: string
}

/**
 * 物件ページの URL から、外観 1 枚と間取り図を取り込み、間取り図を階ごとに切り出す。
 * 取得は利用者の操作ごとに 1 件分だけ（物件ページ 1 回 + 外観 1 枚 + 階に分けられる間取り図が見つかるまで最大 3 枚）
 */
export async function importListingImages(url: string, floors: number | undefined, onStep: (message: string) => void = () => {}): Promise<ListingImagesResult> {
  onStep("物件ページから画像の一覧を読んでいます")
  const refs = await fetchListingImageRefs(url)
  const images: SourceImages = { floorplans: {} }
  const result: ListingImagesResult = { images, floorsSplit: 0 }
  if (refs.exterior) {
    onStep(`${refs.exterior.alt}を取得しています`)
    images.perspective = await normalizeImage(await fetchListingImage(refs.exterior), "perspective")
    result.exteriorLabel = refs.exterior.alt
  }
  // 物件の階数に分けられる間取り図を掲載順に探す（新築の分譲は区画ごとに別の図面があり、最初の図面で足りることが多い）
  let chosen: { url: string; pieces: string[] | null } | null = null
  for (const [i, ref] of refs.floorplans.entries()) {
    onStep(`間取り図を取得しています（${i + 1} 枚目）`)
    const plan = await normalizeImage(await fetchListingImage(ref), "floorplan")
    onStep("間取り図を階ごとに切り出しています")
    const pieces = await splitFloorplanSheet(plan, floors)
    const fits = floors && floors >= 2 ? pieces?.length === floors : floors === 1 ? !pieces : !!pieces
    chosen ??= { url: plan, pieces }
    if (fits) {
      chosen = { url: plan, pieces }
      break
    }
  }
  if (!chosen) {
    result.warning = "物件ページに間取り図が見つかりませんでした。間取り図は画像を追加してください"
    return result
  }
  if (chosen.pieces) {
    chosen.pieces.forEach((p, i) => (images.floorplans[String(i)] = p))
    images.floorplanSheet = true
    result.floorsSplit = chosen.pieces.length
    if (floors && chosen.pieces.length !== floors) result.warning = `物件は ${floors} 階建てですが、間取り図から ${chosen.pieces.length} 階分を切り出しました。階の画像を確かめてください`
  } else {
    images.floorplans["0"] = chosen.url
    images.floorplanSheet = false
    if (floors && floors >= 2) result.warning = `物件は ${floors} 階建てですが、間取り図を階ごとに分けられませんでした（敷地図に重ねた図面など）。階ごとに切り抜いた画像を追加してください`
  }
  return result
}

import { parsePlantPageImage, type PlantPageImage } from "./plant-page-images.ts"

type ReadRows = (table: string, options: { select: string[]; filter: string; top: number }) => Promise<Record<string, unknown>[]>
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export type PlantPageImageResult = { images: PlantPageImage[]; unavailable: number }

export async function loadPlantPageImages(read: ReadRows, sourceIds: string[], reply: string, direct: boolean, publisher: string, tables: string): Promise<PlantPageImageResult> {
  if (!sourceIds.length || sourceIds.length > 8 || sourceIds.some(id => !guid.test(id))) return { images: [], unavailable: 0 }
  const rows = await read(`${tables}sourceindexes`, {
    select: [`${tables}sourceindexid`, `${publisher}_pagenumber`, `_${publisher}_drawingrevisionid_value`, `${publisher}_pageimagejson`],
    filter: `(${sourceIds.map(id => `${tables}sourceindexid eq ${id}`).join(" or ")}) and statecode eq 0 and ${publisher}_verified eq true and ${publisher}_sourcekind eq 100000000`, top: 8,
  })
  const images: PlantPageImage[] = []
  let unavailable = 0
  for (const row of rows) {
    const sourceId = row[`${tables}sourceindexid`]
    if (typeof sourceId !== "string" || !sourceIds.includes(sourceId)) continue
    const revisionId = row[`_${publisher}_drawingrevisionid_value`]
    if (typeof revisionId !== "string" || !guid.test(revisionId)) continue
    const revisions = await read(`${tables}drawingrevisions`, {
      select: [`${publisher}_name`, `${publisher}_fileurl`, `_${publisher}_drawingid_value`],
      filter: `${tables}drawingrevisionid eq ${revisionId} and statecode eq 0 and ${publisher}_status eq 100000000`, top: 1,
    })
    const revision = revisions[0]
    const drawingId = revision?.[`_${publisher}_drawingid_value`]
    if (typeof drawingId !== "string" || !guid.test(drawingId)) continue
    const drawings = await read(`${tables}drawings`, { select: [`${publisher}_name`], filter: `${tables}drawingid eq ${drawingId} and statecode eq 0`, top: 1 })
    const drawingNumber = drawings[0]?.[`${publisher}_name`]
    const revisionName = revision[`${publisher}_name`]
    const path = revision[`${publisher}_fileurl`]
    const page = row[`${publisher}_pagenumber`]
    if (typeof drawingNumber !== "string" || typeof revisionName !== "string" || typeof path !== "string" || typeof page !== "number") continue
    if (!direct && (!reply.includes(drawingNumber) || !reply.includes(revisionName))) continue
    // 取り込み時に描画された画像がまだ無い索引が混ざっていても、揃っているページは表示する
    const cached = row[`${publisher}_pageimagejson`]
    if (typeof cached !== "string" || !cached) {
      unavailable++
      continue
    }
    const image = await parsePlantPageImage(cached, { drawingNumber, revision: revisionName, path, page })
    if (!image) throw new Error("画像の図面・改訂・ページを検証できません。")
    images.push(image)
  }
  return { images: images.sort((first, second) => first.page - second.page), unavailable }
}
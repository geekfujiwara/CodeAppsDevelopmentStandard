import { useQuery } from "@tanstack/react-query"
import { label, listAll, num, str } from "@/data/dataverse-client"
import { ENTITY_SETS } from "@/data/kb-dataset"

const P = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || ""
const TP = import.meta.env.VITE_TABLE_PREFIX?.trim() || `${P}_kb`

const f = (name: string) => `${P}_${name}`

export type RevisionRecord = {
  id: string
  drawingId: string
  name: string
  status: string
  issuedDate: string | null
  /** Azure Files 上の相対パス。drawing-files-mcp の入力キー */
  filePath: string
}

export type DocumentRecord = {
  id: string
  name: string
  documentNumber: string
  documentType: string
  revision: string
  issuedDate: string | null
  filePath: string
  projectName: string
}

export type DocumentLinkRecord = {
  id: string
  name: string
  linkType: string
  note: string
  revisionId: string | null
  documentId: string | null
  relatedRevisionId: string | null
}

export type FeatureRecord = {
  id: string
  revisionId: string | null
  name: string
  value: string
  numericValue: number | null
  unit: string
  categoryId: string | null
  categoryName: string
  tagId: string | null
  tagLabel: string
}

export type DrawingRecord = {
  id: string
  number: string
  title: string
  aliases: string[]
  projectName: string
  revisions: RevisionRecord[]
  /** 最新の有効改訂。失効しか無い場合は最後の改訂 */
  activeRevision: RevisionRecord | null
  tagLabels: string[]
}

export type DrawingIndex = {
  drawings: DrawingRecord[]
  documents: DocumentRecord[]
  links: DocumentLinkRecord[]
  features: FeatureRecord[]
}

export const DRAWING_QUERY_KEY = ["kb-drawing-index"] as const

function issuedSort(a: RevisionRecord, b: RevisionRecord) {
  return (a.issuedDate ?? "").localeCompare(b.issuedDate ?? "")
}

async function fetchDrawingIndex(): Promise<DrawingIndex> {
  const [drawingRows, revisionRows, tagRows, documentRows, linkRows, featureRows] = await Promise.all([
    listAll(ENTITY_SETS.drawing, {
      select: [
        `${TP}drawingid`,
        f("name"),
        f("drawingtitle"),
        f("aliases"),
        `_${f("projectid")}_value`,
      ],
      orderBy: `${f("name")} asc`,
    }),
    listAll(ENTITY_SETS.drawingRevision, {
      select: [
        `${TP}drawingrevisionid`,
        f("name"),
        f("status"),
        f("issueddate"),
        f("fileurl"),
        `_${f("drawingid")}_value`,
      ],
    }),
    listAll(ENTITY_SETS.tag, {
      select: [`${TP}tagid`, f("name"), `_${f("drawingid")}_value`],
    }),
    listAll(ENTITY_SETS.document, {
      select: [
        `${TP}documentid`,
        f("name"),
        f("documentnumber"),
        f("documenttype"),
        f("revision"),
        f("issueddate"),
        f("fileurl"),
        `_${f("projectid")}_value`,
      ],
      orderBy: `${f("name")} asc`,
    }),
    listAll(ENTITY_SETS.documentLink, {
      select: [
        `${TP}documentlinkid`,
        f("name"),
        f("linktype"),
        f("note"),
        `_${f("drawingrevisionid")}_value`,
        `_${f("documentid")}_value`,
        `_${f("relateddrawingrevisionid")}_value`,
      ],
    }),
    listAll(ENTITY_SETS.drawingFeature, {
      select: [
        `${TP}drawingfeatureid`,
        f("name"),
        f("value"),
        f("numericvalue"),
        f("unit"),
        `_${f("drawingrevisionid")}_value`,
        `_${f("equipmentcategoryid")}_value`,
        `_${f("tagid")}_value`,
      ],
    }),
  ])

  const revisions: RevisionRecord[] = revisionRows.map((row) => ({
    id: String(row[`${TP}drawingrevisionid`] ?? ""),
    drawingId: str(row, `_${f("drawingid")}_value`) ?? "",
    name: str(row, f("name")) ?? "",
    status: label(row, f("status")),
    issuedDate: str(row, f("issueddate")),
    filePath: str(row, f("fileurl")) ?? "",
  }))

  const revisionsByDrawing = new Map<string, RevisionRecord[]>()
  for (const rev of revisions) {
    const list = revisionsByDrawing.get(rev.drawingId) ?? []
    list.push(rev)
    revisionsByDrawing.set(rev.drawingId, list)
  }

  const tagsByDrawing = new Map<string, string[]>()
  for (const row of tagRows) {
    const drawingId = str(row, `_${f("drawingid")}_value`)
    if (!drawingId) continue
    const list = tagsByDrawing.get(drawingId) ?? []
    list.push(str(row, f("name")) ?? "")
    tagsByDrawing.set(drawingId, list)
  }

  const drawings: DrawingRecord[] = drawingRows.map((row) => {
    const id = String(row[`${TP}drawingid`] ?? "")
    const revs = (revisionsByDrawing.get(id) ?? []).slice().sort(issuedSort)
    const active = revs.filter((r) => r.status === "有効").at(-1) ?? revs.at(-1) ?? null
    return {
      id,
      number: str(row, f("name")) ?? "(図面番号なし)",
      title: str(row, f("drawingtitle")) ?? "",
      aliases: (str(row, f("aliases")) ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      projectName: label(row, `_${f("projectid")}_value`) || "未割当",
      revisions: revs,
      activeRevision: active,
      tagLabels: (tagsByDrawing.get(id) ?? []).sort(),
    }
  })

  const documents: DocumentRecord[] = documentRows.map((row) => ({
    id: String(row[`${TP}documentid`] ?? ""),
    name: str(row, f("name")) ?? "(無題)",
    documentNumber: str(row, f("documentnumber")) ?? "",
    documentType: label(row, f("documenttype")),
    revision: str(row, f("revision")) ?? "",
    issuedDate: str(row, f("issueddate")),
    filePath: str(row, f("fileurl")) ?? "",
    projectName: label(row, `_${f("projectid")}_value`) || "未割当",
  }))

  const links: DocumentLinkRecord[] = linkRows.map((row) => ({
    id: String(row[`${TP}documentlinkid`] ?? ""),
    name: str(row, f("name")) ?? "",
    linkType: label(row, f("linktype")),
    note: str(row, f("note")) ?? "",
    revisionId: str(row, `_${f("drawingrevisionid")}_value`),
    documentId: str(row, `_${f("documentid")}_value`),
    relatedRevisionId: str(row, `_${f("relateddrawingrevisionid")}_value`),
  }))

  const features: FeatureRecord[] = featureRows.map((row) => ({
    id: String(row[`${TP}drawingfeatureid`] ?? ""),
    revisionId: str(row, `_${f("drawingrevisionid")}_value`),
    name: str(row, f("name")) ?? "",
    value: str(row, f("value")) ?? "",
    numericValue: row[f("numericvalue")] == null ? null : num(row, f("numericvalue")),
    unit: str(row, f("unit")) ?? "",
    categoryId: str(row, `_${f("equipmentcategoryid")}_value`),
    categoryName: label(row, `_${f("equipmentcategoryid")}_value`),
    tagId: str(row, `_${f("tagid")}_value`),
    tagLabel: label(row, `_${f("tagid")}_value`),
  }))

  return { drawings, documents, links, features }
}

export function useDrawingIndex() {
  return useQuery({ queryKey: DRAWING_QUERY_KEY, queryFn: fetchDrawingIndex })
}

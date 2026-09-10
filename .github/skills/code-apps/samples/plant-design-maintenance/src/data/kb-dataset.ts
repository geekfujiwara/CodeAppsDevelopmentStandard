import { useQuery } from "@tanstack/react-query"
import { bool, label, listAll, num, str, type DataverseRow } from "@/data/dataverse-client"
import type { KpiAnswer, KpiIncident, KpiInput, KpiKnowledge, KpiTagExtraction } from "@/lib/kpi"

const P = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || ""
const TP = import.meta.env.VITE_TABLE_PREFIX?.trim() || `${P}_kb`

/** EntitySetName は論理名の英語複数形。Dataverse 側の実値と一致させている */
export const ENTITY_SETS = {
  equipmentCategory: `${TP}equipmentcategories`,
  incident: `${TP}incidents`,
  incidentAnswer: `${TP}incidentanswers`,
  knowledge: `${TP}knowledges`,
  knowledgeSource: `${TP}knowledgesources`,
  tag: `${TP}tags`,
  tagExtraction: `${TP}tagextractions`,
  drawing: `${TP}drawings`,
  drawingRevision: `${TP}drawingrevisions`,
  document: `${TP}documents`,
  documentLink: `${TP}documentlinks`,
  drawingFeature: `${TP}drawingfeatures`,
} as const

const f = (name: string) => `${P}_${name}`

function lookupId(row: DataverseRow, lookupField: string): string | null {
  return str(row, `_${lookupField}_value`)
}

/**
 * KPI の起点となる「業務上の日時」を取り出す。
 *
 * Dataverse の createdon はレコードを Dataverse に書いた日時であり、業務上の
 * 発生日時ではない。移行やデモデータ投入をすると全レコードが同じ日に寄り、
 * クローズ日時より後ろになって日数差が負になる（= KPI が「データなし」になる）。
 * そのため業務日時列を優先し、未設定の場合だけ createdon にフォールバックする。
 */
function businessDate(row: DataverseRow, businessField: string): string {
  return str(row, businessField) ?? str(row, "createdon") ?? ""
}

async function fetchIncidents(): Promise<KpiIncident[]> {
  const rows = await listAll(ENTITY_SETS.incident, {
    select: [
      `${TP}incidentid`,
      f("name"),
      f("status"),
      f("reportedon"),
      f("closedon"),
      f("knowledgegenerated"),
      `_${f("drawingrevisionid")}_value`,
      "createdon",
    ],
    orderBy: "createdon desc",
  })
  return rows.map((row) => ({
    id: String(row[`${TP}incidentid`] ?? ""),
    status: label(row, f("status")),
    createdOn: businessDate(row, f("reportedon")),
    closedOn: str(row, f("closedon")),
    knowledgeGenerated: bool(row, f("knowledgegenerated")),
    categoryName: null,
    drawingRevisionId: lookupId(row, f("drawingrevisionid")),
  }))
}

async function fetchKnowledge(): Promise<KpiKnowledge[]> {
  const [rows, sources] = await Promise.all([
    listAll(ENTITY_SETS.knowledge, {
      select: [
        `${TP}knowledgeid`,
        f("name"),
        f("status"),
        f("visibility"),
        f("occurrencecount"),
        f("generatedon"),
        f("approvedon"),
        `_${f("equipmentcategoryid")}_value`,
        "createdon",
      ],
      orderBy: "createdon desc",
    }),
    listAll(ENTITY_SETS.knowledgeSource, {
      select: [`${TP}knowledgesourceid`, f("sourcetype"), `_${f("knowledgeid")}_value`],
    }),
  ])

  const sourceCounts = new Map<string, number>()
  const sourceTypes = new Map<string, string[]>()
  for (const source of sources) {
    const knowledgeId = lookupId(source, f("knowledgeid"))
    if (!knowledgeId) continue
    sourceCounts.set(knowledgeId, (sourceCounts.get(knowledgeId) ?? 0) + 1)
    const type = label(source, f("sourcetype"))
    if (type) sourceTypes.set(knowledgeId, [...(sourceTypes.get(knowledgeId) ?? []), type])
  }

  return rows.map((row) => {
    const id = String(row[`${TP}knowledgeid`] ?? "")
    const key = sourceCounts.has(id) ? id : id.toLowerCase()
    return {
      id,
      status: label(row, f("status")),
      visibility: label(row, f("visibility")),
      occurrenceCount: num(row, f("occurrencecount")),
      createdOn: businessDate(row, f("generatedon")),
      approvedOn: str(row, f("approvedon")),
      sourceCount: sourceCounts.get(key) ?? 0,
      sourceTypes: sourceTypes.get(key) ?? [],
      categoryName: label(row, `_${f("equipmentcategoryid")}_value`) || null,
    }
  })
}

async function fetchAnswers(): Promise<KpiAnswer[]> {
  const rows = await listAll(ENTITY_SETS.incidentAnswer, {
    select: [
      `${TP}incidentanswerid`,
      f("missinginfo"),
      f("answeredon"),
      f("isanswerable"),
      f("isaigenerated"),
      `_${f("incidentid")}_value`,
      "createdon",
    ],
  })
  return rows.map((row) => ({
    id: String(row[`${TP}incidentanswerid`] ?? ""),
    incidentId: lookupId(row, f("incidentid")),
    createdOn: businessDate(row, f("answeredon")),
    missingInfo: str(row, f("missinginfo")),
    isAnswerable: bool(row, f("isanswerable")),
    isAiGenerated: bool(row, f("isaigenerated")),
  }))
}

async function fetchTagExtractions(): Promise<KpiTagExtraction[]> {
  const rows = await listAll(ENTITY_SETS.tagExtraction, {
    select: [`${TP}tagextractionid`, `_${f("tagid")}_value`],
  })
  return rows.map((row) => ({
    id: String(row[`${TP}tagextractionid`] ?? ""),
    resolved: lookupId(row, f("tagid")) !== null,
  }))
}

/**
 * incident 側にはカテゴリ列がないため、ナレッジのカテゴリ名を
 * 正規化済みの表示名として KPI 側へ渡す。
 */
async function fetchDataset(): Promise<KpiInput> {
  const [incidents, knowledge, answers, tagExtractions] = await Promise.all([
    fetchIncidents(),
    fetchKnowledge(),
    fetchAnswers(),
    fetchTagExtractions(),
  ])
  return { incidents, knowledge, answers, tagExtractions }
}

export const KB_DATASET_QUERY_KEY = ["kb-dataset"] as const

export function useKbDataset() {
  return useQuery({
    queryKey: KB_DATASET_QUERY_KEY,
    queryFn: fetchDataset,
    staleTime: 60_000,
  })
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MicrosoftDataverseService } from "@/integrations/connectors"
import { bool, label, listAll, num, str } from "@/data/dataverse-client"
import { ENTITY_SETS, KB_DATASET_QUERY_KEY } from "@/data/kb-dataset"

const P = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || ""
const TP = import.meta.env.VITE_TABLE_PREFIX?.trim() || `${P}_kb`
const ORGANIZATION = import.meta.env.VITE_DATAVERSE_URL?.trim() ?? ""

const f = (name: string) => `${P}_${name}`

/** Picklist の整数値。書き込み時はラベルではなくこの値を送る必要がある */
export const INCIDENT_STATUS_VALUE = { 未対応: 100000000, 対応中: 100000001, 完了: 100000002 } as const
export const KNOWLEDGE_STATUS_VALUE = { 未承認: 100000000, 承認済み: 100000001, 要確認: 100000002 } as const
export const VISIBILITY_VALUE = { 社内限定: 100000000, 公開可: 100000001 } as const
export const ZONE_VALUE = { 社内: 100000000, 現地: 100000001, 顧客: 100000002 } as const

export type IncidentStatus = keyof typeof INCIDENT_STATUS_VALUE
export type KnowledgeStatus = keyof typeof KNOWLEDGE_STATUS_VALUE
export type Visibility = keyof typeof VISIBILITY_VALUE
export type Zone = keyof typeof ZONE_VALUE

export type IncidentRecord = {
  id: string
  title: string
  detail: string
  status: IncidentStatus
  zone: string
  when: string
  where: string
  tagId: string | null
  tagLabel: string
  knowledgeGenerated: boolean
  closedOn: string | null
}

export type KnowledgeSourceRecord = {
  id: string
  knowledgeId: string
  title: string
  sourceType: string
  reference: string
  verified: boolean
}

export type KnowledgeRecord = {
  id: string
  title: string
  summary: string
  symptom: string
  countermeasure: string
  status: string
  visibility: string
  occurrenceCount: number
  categoryName: string
  tagId: string | null
  tagLabel: string
  approvedOn: string | null
  sourceCount: number
  sources: KnowledgeSourceRecord[]
}

export type TagRecord = {
  id: string
  label: string
  description: string
  categoryName: string
  x: number
  y: number
}

function asIncidentStatus(value: string): IncidentStatus {
  return value in INCIDENT_STATUS_VALUE ? (value as IncidentStatus) : "未対応"
}

async function fetchIncidentRecords(): Promise<IncidentRecord[]> {
  const rows = await listAll(ENTITY_SETS.incident, {
    select: [
      `${TP}incidentid`,
      f("name"),
      f("detail"),
      f("status"),
      f("zone"),
      f("when"),
      f("where"),
      f("knowledgegenerated"),
      f("closedon"),
      `_${f("tagid")}_value`,
    ],
    orderBy: "createdon desc",
  })

  return rows.map((row) => ({
    id: String(row[`${TP}incidentid`] ?? ""),
    title: str(row, f("name")) ?? "(無題)",
    detail: str(row, f("detail")) ?? "",
    status: asIncidentStatus(label(row, f("status"))),
    zone: label(row, f("zone")),
    when: str(row, f("when")) ?? "",
    where: str(row, f("where")) ?? "",
    tagId: str(row, `_${f("tagid")}_value`),
    tagLabel: label(row, `_${f("tagid")}_value`) || "未指定",
    knowledgeGenerated: bool(row, f("knowledgegenerated")),
    closedOn: str(row, f("closedon")),
  }))
}

async function fetchKnowledgeRecords(): Promise<KnowledgeRecord[]> {
  const [rows, sourceRows] = await Promise.all([
    listAll(ENTITY_SETS.knowledge, {
      select: [
        `${TP}knowledgeid`,
        f("name"),
        f("summary"),
        f("symptom"),
        f("countermeasure"),
        f("status"),
        f("visibility"),
        f("occurrencecount"),
        f("approvedon"),
        `_${f("equipmentcategoryid")}_value`,
        `_${f("tagid")}_value`,
      ],
      orderBy: "createdon desc",
    }),
    listAll(ENTITY_SETS.knowledgeSource, {
      select: [
        `${TP}knowledgesourceid`,
        f("name"),
        f("sourcetype"),
        f("reference"),
        f("verified"),
        `_${f("knowledgeid")}_value`,
      ],
    }),
  ])

  const sourcesByKnowledge = new Map<string, KnowledgeSourceRecord[]>()
  for (const row of sourceRows) {
    const knowledgeId = (str(row, `_${f("knowledgeid")}_value`) ?? "").toLowerCase()
    if (!knowledgeId) continue
    const entry: KnowledgeSourceRecord = {
      id: String(row[`${TP}knowledgesourceid`] ?? ""),
      knowledgeId,
      title: str(row, f("name")) ?? "(無題)",
      sourceType: label(row, f("sourcetype")),
      reference: str(row, f("reference")) ?? "",
      verified: bool(row, f("verified")),
    }
    const bucket = sourcesByKnowledge.get(knowledgeId)
    if (bucket) bucket.push(entry)
    else sourcesByKnowledge.set(knowledgeId, [entry])
  }

  return rows.map((row) => {
    const id = String(row[`${TP}knowledgeid`] ?? "")
    const sources = sourcesByKnowledge.get(id.toLowerCase()) ?? []
    return {
      id,
      title: str(row, f("name")) ?? "(無題)",
      summary: str(row, f("summary")) ?? "",
      symptom: str(row, f("symptom")) ?? "",
      countermeasure: str(row, f("countermeasure")) ?? "",
      status: label(row, f("status")),
      visibility: label(row, f("visibility")),
      occurrenceCount: num(row, f("occurrencecount")),
      categoryName: label(row, `_${f("equipmentcategoryid")}_value`) || "未分類",
      tagId: str(row, `_${f("tagid")}_value`),
      tagLabel: label(row, `_${f("tagid")}_value`) || "未指定",
      approvedOn: str(row, f("approvedon")),
      sourceCount: sources.length,
      sources,
    }
  })
}

async function updateRecord(entitySetName: string, id: string, item: Record<string, unknown>) {
  if (!ORGANIZATION) throw new Error("VITE_DATAVERSE_URL が未設定です。")
  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    "return=representation",
    "application/json",
    ORGANIZATION,
    entitySetName,
    id,
    item,
  )
  if (!result.success) {
    throw new Error(`${entitySetName} の更新に失敗しました: ${result.error ?? "unknown error"}`)
  }
}

async function createRecord(entitySetName: string, item: Record<string, unknown>) {
  if (!ORGANIZATION) throw new Error("VITE_DATAVERSE_URL が未設定です。")
  const result = await MicrosoftDataverseService.CreateRecordWithOrganization(
    "return=representation",
    "application/json",
    ORGANIZATION,
    entitySetName,
    item,
  )
  if (!result.success) {
    throw new Error(`${entitySetName} の作成に失敗しました: ${result.error ?? "unknown error"}`)
  }
}

async function deleteRecord(entitySetName: string, id: string) {
  if (!ORGANIZATION) throw new Error("VITE_DATAVERSE_URL が未設定です。")
  const result = await MicrosoftDataverseService.DeleteRecordWithOrganization(ORGANIZATION, entitySetName, id)
  if (!result.success) {
    throw new Error(`${entitySetName} の削除に失敗しました: ${result.error ?? "unknown error"}`)
  }
}

async function fetchTags(): Promise<TagRecord[]> {
  const rows = await listAll(ENTITY_SETS.tag, {
    select: [
      `${TP}tagid`,
      f("name"),
      f("description"),
      f("positionx"),
      f("positiony"),
      `_${f("equipmentcategoryid")}_value`,
    ],
    orderBy: `${f("name")} asc`,
  })
  return rows.map((row) => ({
    id: String(row[`${TP}tagid`] ?? ""),
    label: str(row, f("name")) ?? "(無題)",
    description: str(row, f("description")) ?? "",
    categoryName: label(row, `_${f("equipmentcategoryid")}_value`) || "未分類",
    x: num(row, f("positionx")),
    y: num(row, f("positiony")),
  }))
}

export const INCIDENT_QUERY_KEY = ["kb-incidents"] as const
export const KNOWLEDGE_QUERY_KEY = ["kb-knowledge"] as const
export const TAG_QUERY_KEY = ["kb-tags"] as const

export function useTags() {
  return useQuery({ queryKey: TAG_QUERY_KEY, queryFn: fetchTags, staleTime: 5 * 60_000 })
}

export function useIncidents() {
  return useQuery({ queryKey: INCIDENT_QUERY_KEY, queryFn: fetchIncidentRecords, staleTime: 30_000 })
}

export function useKnowledgeEntries() {
  return useQuery({ queryKey: KNOWLEDGE_QUERY_KEY, queryFn: fetchKnowledgeRecords, staleTime: 30_000 })
}

export function useCreateIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tagId: string
      title: string
      detail: string
      zone: keyof typeof ZONE_VALUE
      when: string
      where: string
      who: string
    }) => {
      await createRecord(ENTITY_SETS.incident, {
        [f("name")]: input.title,
        [f("detail")]: input.detail,
        [f("status")]: INCIDENT_STATUS_VALUE.未対応,
        [f("zone")]: ZONE_VALUE[input.zone],
        [f("when")]: input.when,
        [f("where")]: input.where,
        [f("who")]: input.who,
        [f("knowledgegenerated")]: false,
        // ルックアップの書き込みはナビゲーションプロパティ @odata.bind で行う
        [`${f("tagid")}@odata.bind`]: `/${ENTITY_SETS.tag}(${input.tagId})`,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INCIDENT_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: KB_DATASET_QUERY_KEY })
    },
  })
}

export function useUpdateIncidentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: IncidentStatus }) => {
      const item: Record<string, unknown> = { [f("status")]: INCIDENT_STATUS_VALUE[status] }
      // クローズ日時は KPI の MTTC (K-02) の実測値になるため、完了時に必ず打刻する
      if (status === "完了") item[f("closedon")] = new Date().toISOString()
      await updateRecord(ENTITY_SETS.incident, id, item)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INCIDENT_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: KB_DATASET_QUERY_KEY })
    },
  })
}

export function useApproveKnowledge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, publicAllowed }: { id: string; publicAllowed: boolean }) => {
      await updateRecord(ENTITY_SETS.knowledge, id, {
        [f("status")]: KNOWLEDGE_STATUS_VALUE.承認済み,
        [f("visibility")]: publicAllowed ? VISIBILITY_VALUE.公開可 : VISIBILITY_VALUE.社内限定,
        // 承認リードタイム (K-05) の起点・終点を残す
        [f("approvedon")]: new Date().toISOString(),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: KB_DATASET_QUERY_KEY })
    },
  })
}

export type IncidentInput = {
  id?: string
  title: string
  detail: string
  status: IncidentStatus
  zone: Zone
  when: string
  where: string
  tagId: string | null
  /** 既存レコードの現在値。完了への遷移時だけクローズ日時を打刻するために使う */
  closedOn?: string | null
}

export type KnowledgeInput = {
  id?: string
  title: string
  summary: string
  symptom: string
  countermeasure: string
  status: KnowledgeStatus
  visibility: Visibility
  occurrenceCount: number
  tagId: string | null
  approvedOn?: string | null
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: INCIDENT_QUERY_KEY })
  void queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY })
  void queryClient.invalidateQueries({ queryKey: KB_DATASET_QUERY_KEY })
}

export function useSaveIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: IncidentInput) => {
      const item: Record<string, unknown> = {
        [f("name")]: input.title,
        [f("detail")]: input.detail,
        [f("status")]: INCIDENT_STATUS_VALUE[input.status],
        [f("zone")]: ZONE_VALUE[input.zone],
        [f("when")]: input.when,
        [f("where")]: input.where,
      }
      // クローズ日時は MTTC (K-02) の実測値。完了に入った瞬間だけ打刻し、再保存では上書きしない
      if (input.status === "完了" && !input.closedOn) item[f("closedon")] = new Date().toISOString()
      if (input.status !== "完了") item[f("closedon")] = null

      if (input.id) {
        // 単一値ナビゲーションプロパティは null を送ると関連付けを解除できる
        item[`${f("tagid")}@odata.bind`] = input.tagId ? `/${ENTITY_SETS.tag}(${input.tagId})` : null
        await updateRecord(ENTITY_SETS.incident, input.id, item)
        return
      }

      item[f("knowledgegenerated")] = false
      // 起票日時は業務日時列。createdon は投入日時なので KPI の起点に使えない
      item[f("reportedon")] = new Date().toISOString()
      if (input.tagId) item[`${f("tagid")}@odata.bind`] = `/${ENTITY_SETS.tag}(${input.tagId})`
      await createRecord(ENTITY_SETS.incident, item)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useDeleteIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRecord(ENTITY_SETS.incident, id),
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useSaveKnowledge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: KnowledgeInput) => {
      const item: Record<string, unknown> = {
        [f("name")]: input.title,
        [f("summary")]: input.summary,
        [f("symptom")]: input.symptom,
        [f("countermeasure")]: input.countermeasure,
        [f("status")]: KNOWLEDGE_STATUS_VALUE[input.status],
        [f("visibility")]: VISIBILITY_VALUE[input.visibility],
        [f("occurrencecount")]: input.occurrenceCount,
      }
      // 承認リードタイム (K-05) の終点。承認に入った瞬間だけ打刻する
      if (input.status === "承認済み" && !input.approvedOn) item[f("approvedon")] = new Date().toISOString()
      if (input.status !== "承認済み") item[f("approvedon")] = null

      if (input.id) {
        item[`${f("tagid")}@odata.bind`] = input.tagId ? `/${ENTITY_SETS.tag}(${input.tagId})` : null
        await updateRecord(ENTITY_SETS.knowledge, input.id, item)
        return
      }

      // ナレッジ生成日時も業務日時列として明示的に持つ
      item[f("generatedon")] = new Date().toISOString()
      if (input.tagId) item[`${f("tagid")}@odata.bind`] = `/${ENTITY_SETS.tag}(${input.tagId})`
      await createRecord(ENTITY_SETS.knowledge, item)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useDeleteKnowledge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRecord(ENTITY_SETS.knowledge, id),
    onSuccess: () => invalidateAll(queryClient),
  })
}

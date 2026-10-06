import { getContext } from "@microsoft/power-apps/app"
import { MicrosoftDataverseService } from "@/generated/services/MicrosoftDataverseService"

// pac code add-data-source -a shared_commondataserviceforapps で生成される
// 単一・非型付けサービスの薄いラッパー。
// organization を省略すると Invalid organization URL 'null' provided で失敗するため、
// 常に *WithOrganization 系を使う。

const PREFER = "return=representation"
const READ_PREFER = 'odata.include-annotations="*"'
const ACCEPT = "application/json"

export type DataverseRow = Record<string, unknown>

let cachedOrgUrl: string | undefined

async function getOrgUrl(): Promise<string> {
  if (cachedOrgUrl) return cachedOrgUrl
  const ctx = await getContext()
  const orgUrl = ctx.app.dataverseOrgUrl
  if (!orgUrl) throw new Error("Dataverse org URL を取得できません。")
  cachedOrgUrl = orgUrl
  return orgUrl
}

function unwrap<T>(result: { success?: boolean; data?: T; error?: { message?: string } }): T {
  if (result.success === false) {
    throw new Error(result.error?.message ?? "Unknown Dataverse connector error")
  }
  return result.data as T
}

export const DataverseService = {
  async ListRecords(entityName: string, select?: string[], filter?: string) {
    const org = await getOrgUrl()
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      org,
      entityName,
      READ_PREFER,
      ACCEPT,
      undefined,
      undefined,
      select?.join(","),
      filter,
    )
    return unwrap<{ value?: DataverseRow[] }>(result).value ?? []
  },
  async GetItem(entityName: string, recordId: string, select?: string[]) {
    const org = await getOrgUrl()
    const result = await MicrosoftDataverseService.GetItemWithOrganization(
      READ_PREFER,
      ACCEPT,
      org,
      entityName,
      recordId,
      undefined,
      undefined,
      select?.join(","),
    )
    return unwrap<DataverseRow>(result)
  },
  async CreateRecord(entityName: string, body: DataverseRow) {
    const org = await getOrgUrl()
    const result = await MicrosoftDataverseService.CreateRecordWithOrganization(
      PREFER,
      ACCEPT,
      org,
      entityName,
      body,
    )
    return unwrap<void>(result)
  },
  async UpdateRecord(entityName: string, recordId: string, body: DataverseRow) {
    const org = await getOrgUrl()
    const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      PREFER,
      ACCEPT,
      org,
      entityName,
      recordId,
      body,
    )
    return unwrap<DataverseRow>(result)
  },
  async DeleteRecord(entityName: string, recordId: string) {
    const org = await getOrgUrl()
    const result = await MicrosoftDataverseService.DeleteRecordWithOrganization(org, entityName, recordId)
    return unwrap<void>(result)
  },
  /**
   * Dataverse 検索（関連性検索）。entities は論理名（例: "<prefix>_project", "systemuser"）。
   * テーブルを検索の対象にしておく必要がある（dataverse スキルの setup_dataverse_search.py）。
   * 結果は ID とスコアが中心で、列の値は環境によって含まれないため、ID で ListRecords し直す。
   * 使い方: references/dataverse-search.md
   */
  async Search(entities: string[], term: string, top = 10) {
    const result = await MicrosoftDataverseService.GetRelevantRows({ search: term, entities, top, searchtype: "simple", searchmode: "any" })
    return (unwrap<{ value?: DataverseRow[] }>(result).value ?? [])
      .map((row) => ({ id: String(row["@search.objectid"] ?? ""), entity: String(row["@search.entityname"] ?? ""), score: Number(row["@search.score"] ?? 0) }))
      .filter((hit) => hit.id)
  },
}

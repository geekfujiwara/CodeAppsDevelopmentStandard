import { getContext } from "@microsoft/power-apps/app"
import { MicrosoftDataverseService } from "@/generated/services/MicrosoftDataverseService"

// npx power-apps add-data-source --api-id shared_commondataserviceforapps で生成される
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
}

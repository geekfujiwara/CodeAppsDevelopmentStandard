import { getContext } from "@microsoft/power-apps/app"

// 生成サービスは `add_data_source.py --connector dataverse` で作られる。テンプレートから生成した直後（データソース追加前）でも
// ビルドできるよう、静的 import ではなく import.meta.glob で遅延読み込みする（無ければ DEMO 表示に切り替える）
const generated = import.meta.glob("../generated/services/MicrosoftDataverseService.ts")
/** Dataverse のデータソースが追加済みか（未追加なら DEMO = ブラウザ保存で動かす） */
export const isDataverseConfigured = Object.keys(generated).length > 0

type Result<T> = { success?: boolean; data?: T; error?: { message?: string } }
type Service = {
  ListRecordsWithOrganization(organization: string, entityName: string, prefer?: string, accept?: string, metadataFull?: boolean, includeMipLabel?: boolean, select?: string, filter?: string, orderby?: string): Promise<Result<unknown>>
  GetItemWithOrganization(prefer: string, accept: string, organization: string, entityName: string, recordId: string, metadataFull?: boolean, includeMipLabel?: boolean, select?: string): Promise<Result<unknown>>
  CreateRecordWithOrganization(prefer: string, accept: string, organization: string, entityName: string, item: Record<string, unknown>): Promise<Result<unknown>>
  UpdateRecordWithOrganization(prefer: string, accept: string, organization: string, entityName: string, recordId: string, item: Record<string, unknown>): Promise<Result<unknown>>
  DeleteRecordWithOrganization(organization: string, entityName: string, recordId: string): Promise<Result<unknown>>
}
let servicePromise: Promise<Service> | undefined
function dataverse(): Promise<Service> {
  const load = Object.values(generated)[0]
  if (!load) return Promise.reject(new Error("Dataverse のデータソースが追加されていません（add_data_source.py --connector dataverse）"))
  servicePromise ??= load().then(m => (m as { MicrosoftDataverseService: Service }).MicrosoftDataverseService)
  return servicePromise
}

// npx pa app add data-source --connector shared_commondataserviceforapps で生成される
// 単一・非型付けサービスの薄いラッパー（.github/skills/code-apps/templates/dataverse-client.ts 準拠）。
// organization を省略すると Invalid organization URL 'null' provided で失敗するため、常に *WithOrganization 系を使う。

const PREFER = "return=representation"
const READ_PREFER = 'odata.include-annotations="*"'
const ACCEPT = "application/json"

export type DataverseRow = Record<string, unknown>

let cachedOrgUrl: string | undefined

async function getOrgUrl(): Promise<string> {
  if (cachedOrgUrl) return cachedOrgUrl
  const ctx = await getContext()
  const orgUrl = ctx.app.dataverseOrgUrl || import.meta.env.VITE_DATAVERSE_URL?.trim()
  if (!orgUrl) throw new Error("Dataverse org URL を取得できません。.env の VITE_DATAVERSE_URL を確認してください。")
  cachedOrgUrl = orgUrl
  return orgUrl
}

function unwrap<T>(result: Result<unknown>): T {
  if (result.success === false) {
    throw new Error(result.error?.message ?? "Unknown Dataverse connector error")
  }
  return result.data as T
}

export const DataverseService = {
  async ListRecords(entitySet: string, select?: string[], filter?: string, orderby?: string) {
    const org = await getOrgUrl()
    const result = await (await dataverse()).ListRecordsWithOrganization(
      org,
      entitySet,
      READ_PREFER,
      ACCEPT,
      undefined,
      undefined,
      select?.join(","),
      filter,
      orderby,
    )
    return unwrap<{ value?: DataverseRow[] }>(result).value ?? []
  },
  async GetItem(entitySet: string, recordId: string, select?: string[]) {
    const org = await getOrgUrl()
    const result = await (await dataverse()).GetItemWithOrganization(READ_PREFER, ACCEPT, org, entitySet, recordId, undefined, undefined, select?.join(","))
    return unwrap<DataverseRow>(result)
  },
  async CreateRecord(entitySet: string, body: DataverseRow) {
    const org = await getOrgUrl()
    const result = await (await dataverse()).CreateRecordWithOrganization(PREFER, ACCEPT, org, entitySet, body)
    return unwrap<void>(result)
  },
  async UpdateRecord(entitySet: string, recordId: string, body: DataverseRow) {
    const org = await getOrgUrl()
    const result = await (await dataverse()).UpdateRecordWithOrganization(PREFER, ACCEPT, org, entitySet, recordId, body)
    return unwrap<DataverseRow>(result)
  },
  async DeleteRecord(entitySet: string, recordId: string) {
    const org = await getOrgUrl()
    const result = await (await dataverse()).DeleteRecordWithOrganization(org, entitySet, recordId)
    return unwrap<void>(result)
  },
}

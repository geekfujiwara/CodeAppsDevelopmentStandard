import { getContext } from "@microsoft/power-apps/app"
import { PUBLISHER_PREFIX } from "@/config"

export type Row = Record<string, unknown>
type OperationResult<T> = { success: boolean; data?: T; error?: { message?: string } }

interface GeneratedDataverseService {
  ListRecordsWithOrganization(
    organization: string, entityName: string, prefer?: string, accept?: string,
    metadataFull?: boolean, includeMipLabel?: boolean, select?: string, filter?: string,
    orderby?: string, expand?: string, fetchXml?: string, top?: number, skiptoken?: string,
  ): Promise<OperationResult<Row>>
  CreateRecordWithOrganization(
    prefer: string, accept: string, organization: string, entityName: string, item: Row,
  ): Promise<OperationResult<void>>
  UpdateRecordWithOrganization(
    prefer: string, accept: string, organization: string, entityName: string, recordId: string, item: Row,
  ): Promise<OperationResult<Row>>
  DeleteRecordWithOrganization(organization: string, entityName: string, recordId: string): Promise<OperationResult<void>>
}

const generatedServices = import.meta.glob<{ MicrosoftDataverseService: GeneratedDataverseService }>(
  "../generated/services/MicrosoftDataverseService.ts",
)
const READ_PREFER = 'odata.include-annotations="*",odata.maxpagesize=5000'
const WRITE_PREFER = "return=representation"
const ACCEPT = "application/json"
const MAX_PAGES = 20

let servicePromise: Promise<GeneratedDataverseService> | undefined

async function service(): Promise<GeneratedDataverseService> {
  if (!/^[a-z][a-z0-9]{1,7}$/.test(PUBLISHER_PREFIX)) {
    throw new Error("VITE_PUBLISHER_PREFIX に Dataverse 発行者プレフィックスを設定してください。")
  }
  const load = Object.values(generatedServices)[0]
  if (!load) {
    throw new Error("Dataverse 未接続です。add_data_source.py --connector dataverse を実行して再デプロイしてください。")
  }
  servicePromise ??= load().then(module => module.MicrosoftDataverseService)
  return servicePromise
}

async function orgUrl(): Promise<string> {
  const context = await getContext()
  const organization = context.app.dataverseOrgUrl
  if (!organization) throw new Error("Power Apps ホストから Dataverse 組織 URL を取得できません。")
  return organization
}

function assertSuccess(result: OperationResult<unknown>): void {
  if (!result.success) throw new Error(result.error?.message ?? "Dataverse の呼び出しに失敗しました。")
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export interface ListOptions {
  select?: string[]
  filter?: string
  top?: number
}

export async function listRecords(entityName: string, options: ListOptions = {}): Promise<Row[]> {
  const svc = await service()
  const organization = await orgUrl()
  const rows: Row[] = []
  const seenTokens = new Set<string>()
  let skiptoken: string | undefined
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await svc.ListRecordsWithOrganization(
      organization, entityName, READ_PREFER, ACCEPT, undefined, undefined,
      options.select?.join(","), options.filter, undefined, undefined, undefined, options.top, skiptoken,
    )
    assertSuccess(result)
    if (!Array.isArray(result.data?.value) || !result.data.value.every(isRow)) {
      throw new Error(`Dataverse から ${entityName} の一覧を取得できませんでした。`)
    }
    rows.push(...result.data.value)
    if (options.top && rows.length >= options.top) return rows.slice(0, options.top)
    const nextLink = result.data["@odata.nextLink"]
    if (nextLink === undefined || nextLink === null) return rows
    if (typeof nextLink !== "string") throw new Error("Dataverse のページ継続リンクが不正です。")
    const nextToken = new URL(nextLink, organization).searchParams.get("$skiptoken")
    if (!nextToken || seenTokens.has(nextToken)) throw new Error("Dataverse のページ継続トークンが進みません。")
    seenTokens.add(nextToken)
    skiptoken = nextToken
  }
  throw new Error(`${entityName} が ${MAX_PAGES} ページを超えました。不完全な一覧の表示を中止しました。`)
}

export async function createRecord(entityName: string, body: Row): Promise<void> {
  const svc = await service()
  assertSuccess(await svc.CreateRecordWithOrganization(WRITE_PREFER, ACCEPT, await orgUrl(), entityName, body))
}

export async function updateRecord(entityName: string, id: string, body: Row): Promise<void> {
  const svc = await service()
  assertSuccess(await svc.UpdateRecordWithOrganization(WRITE_PREFER, ACCEPT, await orgUrl(), entityName, id, body))
}

export async function deleteRecord(entityName: string, id: string): Promise<void> {
  const svc = await service()
  assertSuccess(await svc.DeleteRecordWithOrganization(await orgUrl(), entityName, id))
}

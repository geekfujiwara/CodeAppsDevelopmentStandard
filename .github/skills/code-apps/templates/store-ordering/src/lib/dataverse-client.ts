import { getContext } from "@microsoft/power-apps/app"

// `pa app add data-source --connector shared_commondataserviceforapps` が生成するサービスを遅延解決する。
// 静的 import にすると、データソース追加前の初回 build（= 初回 push）が型エラーで失敗する。
const generatedServices = import.meta.glob("../generated/services/MicrosoftDataverseService.ts")

type OperationResult<T> = { success?: boolean; data?: T; error?: { message?: string } }
type Row = Record<string, unknown>

interface GeneratedDataverseService {
  ListRecordsWithOrganization(
    organization: string, entityName: string, prefer?: string, accept?: string,
    metadataFull?: boolean, includeMipLabel?: boolean, select?: string, filter?: string,
    orderby?: string, expand?: string, fetchXml?: string, top?: number, skiptoken?: string,
  ): Promise<OperationResult<Row>>
  GetItemWithOrganization(
    prefer: string, accept: string, organization: string, entityName: string, recordId: string,
    metadataFull?: boolean, includeMipLabel?: boolean, select?: string, expand?: string,
  ): Promise<OperationResult<Row>>
  CreateRecordWithOrganization(
    prefer: string, accept: string, organization: string, entityName: string, item: Row,
  ): Promise<OperationResult<void>>
  UpdateRecordWithOrganization(
    prefer: string, accept: string, organization: string, entityName: string, recordId: string, item: Row,
  ): Promise<OperationResult<Row>>
  DeleteRecordWithOrganization(organization: string, entityName: string, recordId: string): Promise<OperationResult<void>>
}

export type DataverseRow = Row

export class DataSourceMissingError extends Error {
  constructor() {
    super("Dataverse データソースが未追加です。add_data_source.py --connector dataverse を実行してから再デプロイしてください。")
    this.name = "DataSourceMissingError"
  }
}

export const isDataSourceConfigured = Object.keys(generatedServices).length > 0

const READ_PREFER = 'odata.include-annotations="*"'
const WRITE_PREFER = "return=representation"
const ACCEPT = "application/json"
const MAX_PAGES = 20

let servicePromise: Promise<GeneratedDataverseService> | undefined
let orgUrlPromise: Promise<string> | undefined

function service(): Promise<GeneratedDataverseService> {
  const load = Object.values(generatedServices)[0]
  if (!load) return Promise.reject(new DataSourceMissingError())
  servicePromise ??= load().then((module) =>
    (module as { MicrosoftDataverseService: GeneratedDataverseService }).MicrosoftDataverseService,
  )
  return servicePromise
}

function orgUrl(): Promise<string> {
  orgUrlPromise ??= (async () => {
    const configured = import.meta.env.VITE_DATAVERSE_URL?.trim()
    if (configured) return configured
    const context = await getContext()
    const fromContext = context.app.dataverseOrgUrl
    if (!fromContext) throw new Error("Dataverse の組織 URL を取得できません。.env の VITE_DATAVERSE_URL を設定してください。")
    return fromContext
  })()
  return orgUrlPromise
}

function unwrap<T>(result: OperationResult<T>): T {
  if (result.success === false) throw new Error(result.error?.message ?? "Dataverse の呼び出しに失敗しました。")
  return result.data as T
}

function nextSkipToken(page: Row): string | undefined {
  const next = page["@odata.nextLink"]
  if (typeof next !== "string") return undefined
  return new URL(next).searchParams.get("$skiptoken") ?? undefined
}

export interface ListOptions {
  select?: string[]
  filter?: string
  orderby?: string
  top?: number
}

export async function listRecords(entitySet: string, options: ListOptions = {}): Promise<Row[]> {
  const [svc, org] = await Promise.all([service(), orgUrl()])
  const rows: Row[] = []
  let skiptoken: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = unwrap(await svc.ListRecordsWithOrganization(
      org, entitySet, READ_PREFER, ACCEPT, undefined, undefined,
      options.select?.join(","), options.filter, options.orderby, undefined, undefined, options.top, skiptoken,
    ))
    rows.push(...((data?.value as Row[] | undefined) ?? []))
    skiptoken = options.top ? undefined : nextSkipToken(data ?? {})
    if (!skiptoken) break
  }
  return rows
}

export async function getRecord(entitySet: string, id: string, select?: string[]): Promise<Row> {
  const [svc, org] = await Promise.all([service(), orgUrl()])
  return unwrap(await svc.GetItemWithOrganization(READ_PREFER, ACCEPT, org, entitySet, id, undefined, undefined, select?.join(",")))
}

export async function createRecord(entitySet: string, body: Row): Promise<void> {
  const [svc, org] = await Promise.all([service(), orgUrl()])
  unwrap(await svc.CreateRecordWithOrganization(WRITE_PREFER, ACCEPT, org, entitySet, body))
}

export async function updateRecord(entitySet: string, id: string, body: Row): Promise<void> {
  const [svc, org] = await Promise.all([service(), orgUrl()])
  unwrap(await svc.UpdateRecordWithOrganization(WRITE_PREFER, ACCEPT, org, entitySet, id, body))
}

export async function deleteRecord(entitySet: string, id: string): Promise<void> {
  const [svc, org] = await Promise.all([service(), orgUrl()])
  unwrap(await svc.DeleteRecordWithOrganization(org, entitySet, id))
}

export async function currentEntraObjectId(): Promise<string | undefined> {
  const context = await getContext()
  return context.user.objectId
}

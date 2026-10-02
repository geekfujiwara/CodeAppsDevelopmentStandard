import { getContext } from "@microsoft/power-apps/app"

const generatedServices = import.meta.glob("../generated/services/MicrosoftDataverseService.ts")

type OperationResult<T> = { success?: boolean; data?: T; error?: { message?: string } }

interface GeneratedDataverseService {
  ListRecordsWithOrganization(
    organization: string,
    entityName: string,
    prefer?: string,
    accept?: string,
    metadataFull?: boolean,
    includeMipLabel?: boolean,
    select?: string,
    filter?: string,
    orderby?: string,
    expand?: string,
    fetchXml?: string,
    top?: number,
    skiptoken?: string,
  ): Promise<OperationResult<DataverseRow>>
  CreateRecordWithOrganization(
    prefer: string,
    accept: string,
    organization: string,
    entityName: string,
    item: DataverseRow,
  ): Promise<OperationResult<void>>
  UpdateRecordWithOrganization(
    prefer: string,
    accept: string,
    organization: string,
    entityName: string,
    recordId: string,
    item: DataverseRow,
  ): Promise<OperationResult<DataverseRow>>
}

const WRITE_PREFER = "return=representation"
const READ_PREFER = 'odata.include-annotations="*"'
const ACCEPT = "application/json"

export type DataverseRow = Record<string, unknown>

const ENTITY_SET_NAMES = {
  ${PUBLISHER_PREFIX}_worktype: "${PUBLISHER_PREFIX}_worktypes",
  ${PUBLISHER_PREFIX}_project: "${PUBLISHER_PREFIX}_projects",
  ${PUBLISHER_PREFIX}_task: "${PUBLISHER_PREFIX}_tasks",
  ${PUBLISHER_PREFIX}_dailyreport: "${PUBLISHER_PREFIX}_dailyreports",
  ${PUBLISHER_PREFIX}_kyactivity: "${PUBLISHER_PREFIX}_kyactivities",
  ${PUBLISHER_PREFIX}_incident: "${PUBLISHER_PREFIX}_incidents",
  ${PUBLISHER_PREFIX}_knowledge: "${PUBLISHER_PREFIX}_knowledges",
  ${PUBLISHER_PREFIX}_equipment: "${PUBLISHER_PREFIX}_equipments",
  ${PUBLISHER_PREFIX}_equipmentusage: "${PUBLISHER_PREFIX}_equipmentusages",
} as const

export type DataverseEntityName = keyof typeof ENTITY_SET_NAMES

export class DataSourceMissingError extends Error {
  constructor() {
    super("Dataverse データソースが未追加です。add_data_source.py --connector dataverse を実行してから再デプロイしてください。")
    this.name = "DataSourceMissingError"
  }
}

export const isDataSourceConfigured = Object.keys(generatedServices).length > 0

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
  if (result.success === false) throw new Error(result.error?.message ?? "Dataverse への接続に失敗しました。")
  return result.data as T
}

export const DataverseService = {
  async list(entityName: DataverseEntityName, select?: string[], filter?: string, orderBy?: string) {
    const [svc, org] = await Promise.all([service(), orgUrl()])
    const result = await svc.ListRecordsWithOrganization(
      org,
      ENTITY_SET_NAMES[entityName],
      READ_PREFER,
      ACCEPT,
      undefined,
      undefined,
      select?.join(","),
      filter,
      orderBy,
      undefined,
      undefined,
      500,
    )
    return unwrap<{ value?: DataverseRow[] }>(result).value ?? []
  },
  async create(entityName: DataverseEntityName, body: DataverseRow) {
    const [svc, org] = await Promise.all([service(), orgUrl()])
    return unwrap<void>(await svc.CreateRecordWithOrganization(
      WRITE_PREFER,
      ACCEPT,
      org,
      ENTITY_SET_NAMES[entityName],
      body,
    ))
  },
  async update(entityName: DataverseEntityName, recordId: string, body: DataverseRow) {
    const [svc, org] = await Promise.all([service(), orgUrl()])
    return unwrap<DataverseRow>(await svc.UpdateRecordWithOrganization(
      WRITE_PREFER,
      ACCEPT,
      org,
      ENTITY_SET_NAMES[entityName],
      recordId,
      body,
    ))
  },
}

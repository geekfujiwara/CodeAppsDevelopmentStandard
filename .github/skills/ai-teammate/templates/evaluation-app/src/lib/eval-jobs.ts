import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, num } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

export const EVAL_JOB_ENTITY_SET = `${p}_evaljobs`

export const EVAL_JOBS_KEY = ["eval-jobs"]

export const JF = {
  id: `${p}_evaljobid`,
  name: `${p}_name`,
  status: `${p}_status`,
  scope: `${p}_scope`,
  ruleKeys: `${p}_rulekeys`,
  fromDate: `${p}_fromdate`,
  toDate: `${p}_todate`,
  requestedBy: `${p}_requestedby`,
  requestedOn: `${p}_requestedon`,
  startedOn: `${p}_startedon`,
  completedOn: `${p}_completedon`,
  targetCount: `${p}_targetcount`,
  doneCount: `${p}_donecount`,
  message: `${p}_message`,
} as const

export const STATUS_PENDING = 1
export const STATUS_RUNNING = 2
export const STATUS_DONE = 3
export const STATUS_FAILED = 4
export const STATUS_CANCELLED = 5

const STATUS_LABELS: Record<number, string> = {
  [STATUS_PENDING]: "待機中",
  [STATUS_RUNNING]: "実行中",
  [STATUS_DONE]: "完了",
  [STATUS_FAILED]: "失敗",
  [STATUS_CANCELLED]: "キャンセル",
}

export const SCOPE_UNEVALUATED = 1
export const SCOPE_ALL = 2
export const SCOPE_PERIOD = 3

export const SCOPE_OPTIONS = [
  { value: SCOPE_UNEVALUATED, label: "未評価のみ", hint: "まだ結果が無い組み合わせだけを評価します。" },
  { value: SCOPE_ALL, label: "全件", hint: "既存の結果も上書きして、すべて評価し直します。" },
  { value: SCOPE_PERIOD, label: "期間指定", hint: "指定した会話日時の範囲だけを評価します。" },
] as const

export function statusLabel(value: number | null): string {
  return value === null ? "不明" : (STATUS_LABELS[value] ?? "不明")
}

export function scopeLabel(value: number | null): string {
  return SCOPE_OPTIONS.find((option) => option.value === value)?.label ?? "不明"
}

export type EvalJob = {
  id: string
  name: string
  status: number | null
  scope: number | null
  ruleKeys: string
  fromDate: string
  toDate: string
  requestedBy: string
  requestedOn: string
  startedOn: string
  completedOn: string
  targetCount: number | null
  doneCount: number | null
  message: string
  statusLabel: string
  scopeLabel: string
}

function toEvalJob(row: DataverseRow): EvalJob {
  const status = num(row, JF.status)
  const scope = num(row, JF.scope)
  return {
    id: str(row, JF.id),
    name: str(row, JF.name),
    status,
    scope,
    ruleKeys: str(row, JF.ruleKeys),
    fromDate: str(row, JF.fromDate),
    toDate: str(row, JF.toDate),
    requestedBy: str(row, JF.requestedBy),
    requestedOn: str(row, JF.requestedOn),
    startedOn: str(row, JF.startedOn),
    completedOn: str(row, JF.completedOn),
    targetCount: num(row, JF.targetCount),
    doneCount: num(row, JF.doneCount),
    message: str(row, JF.message),
    statusLabel: statusLabel(status),
    scopeLabel: scopeLabel(scope),
  }
}

export async function listEvalJobs(top = 100): Promise<EvalJob[]> {
  const rows = await DataverseService.ListRecords(EVAL_JOB_ENTITY_SET, {
    select: Object.values(JF),
    orderBy: `${JF.requestedOn} desc`,
    top,
  })
  return rows.map(toEvalJob)
}

export type EvalJobInput = {
  scope: number
  ruleKeys: string[]
  fromDate?: string
  toDate?: string
}

/**
 * アプリからパイプラインは起動できないので、行を書いて次の実行に拾わせる。
 * 状態はパイプライン側だけが進めるので、ここでは必ず待機中で作る。
 */
export async function queueEvalJob(input: EvalJobInput): Promise<void> {
  const requestedOn = new Date().toISOString()
  const body: DataverseRow = {
    [JF.name]: `job-${requestedOn}`,
    [JF.status]: STATUS_PENDING,
    [JF.scope]: input.scope,
    [JF.ruleKeys]: input.ruleKeys.join(","),
    [JF.requestedOn]: requestedOn,
  }
  if (input.scope === SCOPE_PERIOD) {
    if (input.fromDate) body[JF.fromDate] = new Date(input.fromDate).toISOString()
    if (input.toDate) body[JF.toDate] = new Date(input.toDate).toISOString()
  }
  await DataverseService.CreateRecord(EVAL_JOB_ENTITY_SET, body)
}

/** 統合するたびに積むと待ち行列が膨れるので、待機中のジョブが無いときだけ積む。 */
export async function queueUnlessPending(): Promise<boolean> {
  const jobs = await listEvalJobs(20)
  if (jobs.some((job) => job.status === STATUS_PENDING)) return false
  await queueEvalJob({ scope: SCOPE_UNEVALUATED, ruleKeys: [] })
  return true
}

/** 実行前なら取り消せる。実行中のものはパイプライン側が終端まで持っていく。 */
export async function cancelEvalJob(id: string): Promise<void> {
  await DataverseService.UpdateRecord(EVAL_JOB_ENTITY_SET, id, {
    [JF.status]: STATUS_CANCELLED,
    [JF.completedOn]: new Date().toISOString(),
    [JF.message]: "アプリから取り消されました",
  })
}

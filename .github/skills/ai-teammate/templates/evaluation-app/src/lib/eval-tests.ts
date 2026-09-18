import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, num, quote } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

export const TEST_RUN_ENTITY_SET = `${p}_evaltestruns`
export const TEST_RESULT_ENTITY_SET = `${p}_evaltestresults`

export const TEST_RUNS_KEY = ["eval-test-runs"]
export const TEST_RESULTS_KEY = ["eval-test-results"]

export const RUNF = {
  id: `${p}_evaltestrunid`,
  name: `${p}_name`,
  agentKeys: `${p}_agentkeys`,
  prompt: `${p}_prompt`,
  ruleKeys: `${p}_rulekeys`,
  status: `${p}_status`,
  requestedBy: `${p}_requestedby`,
  requestedOn: `${p}_requestedon`,
  completedOn: `${p}_completedon`,
  targetCount: `${p}_targetcount`,
  doneCount: `${p}_donecount`,
  note: `${p}_note`,
} as const

export const RESF = {
  id: `${p}_evaltestresultid`,
  name: `${p}_name`,
  runName: `${p}_runname`,
  agentKey: `${p}_agentkey`,
  prompt: `${p}_prompt`,
  status: `${p}_status`,
  response: `${p}_response`,
  toolCalls: `${p}_toolcalls`,
  durationMs: `${p}_durationms`,
  startedOn: `${p}_startedon`,
  completedOn: `${p}_completedon`,
  error: `${p}_error`,
  turnName: `${p}_turnname`,
  autoScore: `${p}_autoscore`,
  autoSummary: `${p}_autosummary`,
  humanVerdict: `${p}_humanverdict`,
  humanComment: `${p}_humancomment`,
  issueUrl: `${p}_issueurl`,
} as const

export const TEST_PENDING = 1
export const TEST_RUNNING = 2
export const TEST_DONE = 3
export const TEST_FAILED = 4
export const TEST_CANCELLED = 5

const TEST_STATUS_LABELS: Record<number, string> = {
  [TEST_PENDING]: "待機中",
  [TEST_RUNNING]: "実行中",
  [TEST_DONE]: "完了",
  [TEST_FAILED]: "失敗",
  [TEST_CANCELLED]: "キャンセル",
}

export function testStatusLabel(value: number | null): string {
  return value === null ? "不明" : (TEST_STATUS_LABELS[value] ?? "不明")
}

export const VERDICT_OK = 1
export const VERDICT_NG = 2

export type TestRun = {
  id: string
  name: string
  agentKeys: string[]
  prompt: string
  ruleKeys: string[]
  status: number | null
  statusLabel: string
  requestedBy: string
  requestedOn: string
  completedOn: string
  targetCount: number | null
  doneCount: number | null
  note: string
}

export type TestResult = {
  id: string
  name: string
  runName: string
  agentKey: string
  prompt: string
  status: number | null
  statusLabel: string
  response: string
  toolCallsJson: string
  durationMs: number | null
  startedOn: string
  completedOn: string
  error: string
  turnName: string
  autoScore: number | null
  autoSummary: string
  humanVerdict: number | null
  humanComment: string
  issueUrl: string
}

function splitKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toTestRun(row: DataverseRow): TestRun {
  const status = num(row, RUNF.status)
  return {
    id: str(row, RUNF.id),
    name: str(row, RUNF.name),
    agentKeys: splitKeys(str(row, RUNF.agentKeys)),
    prompt: str(row, RUNF.prompt),
    ruleKeys: splitKeys(str(row, RUNF.ruleKeys)),
    status,
    statusLabel: testStatusLabel(status),
    requestedBy: str(row, RUNF.requestedBy),
    requestedOn: str(row, RUNF.requestedOn),
    completedOn: str(row, RUNF.completedOn),
    targetCount: num(row, RUNF.targetCount),
    doneCount: num(row, RUNF.doneCount),
    note: str(row, RUNF.note),
  }
}

function toTestResult(row: DataverseRow): TestResult {
  const status = num(row, RESF.status)
  return {
    id: str(row, RESF.id),
    name: str(row, RESF.name),
    runName: str(row, RESF.runName),
    agentKey: str(row, RESF.agentKey),
    prompt: str(row, RESF.prompt),
    status,
    statusLabel: testStatusLabel(status),
    response: str(row, RESF.response),
    toolCallsJson: str(row, RESF.toolCalls),
    durationMs: num(row, RESF.durationMs),
    startedOn: str(row, RESF.startedOn),
    completedOn: str(row, RESF.completedOn),
    error: str(row, RESF.error),
    turnName: str(row, RESF.turnName),
    autoScore: num(row, RESF.autoScore),
    autoSummary: str(row, RESF.autoSummary),
    humanVerdict: num(row, RESF.humanVerdict),
    humanComment: str(row, RESF.humanComment),
    issueUrl: str(row, RESF.issueUrl),
  }
}

export async function listTestRuns(top = 100): Promise<TestRun[]> {
  const rows = await DataverseService.ListRecords(TEST_RUN_ENTITY_SET, {
    select: Object.values(RUNF),
    orderBy: `${RUNF.requestedOn} desc`,
    top,
  })
  return rows.map(toTestRun)
}

export async function getTestRun(id: string): Promise<TestRun> {
  const row = await DataverseService.GetItem(TEST_RUN_ENTITY_SET, id, Object.values(RUNF))
  return toTestRun(row)
}

export async function listTestResults(runName: string): Promise<TestResult[]> {
  if (!runName) return []
  const rows = await DataverseService.ListRecords(TEST_RESULT_ENTITY_SET, {
    select: Object.values(RESF),
    filter: `${RESF.runName} eq '${quote(runName)}'`,
    orderBy: `${RESF.agentKey} asc`,
    top: 100,
  })
  return rows.map(toTestResult)
}

export type TestRunInput = {
  prompt: string
  agentKeys: string[]
  ruleKeys: string[]
  requestedBy: string
  note: string
}

/**
 * Queues one run plus one pending row per teammate. Each teammate's own worker claims its row, so
 * the app never has to reach an agent endpoint directly and a teammate that is down simply leaves
 * its row pending instead of failing the whole comparison.
 */
export async function createTestRun(input: TestRunInput): Promise<string> {
  const runName = `test-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`
  const requestedOn = new Date().toISOString()

  await DataverseService.CreateRecord(TEST_RUN_ENTITY_SET, {
    [RUNF.name]: runName,
    [RUNF.agentKeys]: input.agentKeys.join(","),
    [RUNF.prompt]: input.prompt,
    [RUNF.ruleKeys]: input.ruleKeys.join(","),
    [RUNF.status]: TEST_PENDING,
    [RUNF.requestedBy]: input.requestedBy,
    [RUNF.requestedOn]: requestedOn,
    [RUNF.targetCount]: input.agentKeys.length,
    [RUNF.doneCount]: 0,
    [RUNF.note]: input.note,
  })

  for (const agentKey of input.agentKeys) {
    await DataverseService.CreateRecord(TEST_RESULT_ENTITY_SET, {
      [RESF.name]: `${runName}-${agentKey}`,
      [RESF.runName]: runName,
      [RESF.agentKey]: agentKey,
      [RESF.prompt]: input.prompt,
      [RESF.status]: TEST_PENDING,
    })
  }

  return runName
}

export async function setTestResultVerdict(
  id: string,
  verdict: number | null,
  comment: string,
): Promise<void> {
  await DataverseService.UpdateRecord(TEST_RESULT_ENTITY_SET, id, {
    [RESF.humanVerdict]: verdict,
    [RESF.humanComment]: comment,
  })
}

export async function setTestResultIssueUrl(id: string, url: string): Promise<void> {
  await DataverseService.UpdateRecord(TEST_RESULT_ENTITY_SET, id, { [RESF.issueUrl]: url })
}

export async function cancelTestRun(run: TestRun, results: TestResult[]): Promise<void> {
  await DataverseService.UpdateRecord(TEST_RUN_ENTITY_SET, run.id, {
    [RUNF.status]: TEST_CANCELLED,
  })
  for (const result of results) {
    if (result.status === TEST_PENDING) {
      await DataverseService.UpdateRecord(TEST_RESULT_ENTITY_SET, result.id, {
        [RESF.status]: TEST_CANCELLED,
      })
    }
  }
}

/** True while at least one teammate still owes an answer, so the page knows to keep polling. */
export function isRunActive(run: TestRun | undefined, results: TestResult[]): boolean {
  if (!run) return false
  if (run.status === TEST_CANCELLED) return false
  return results.some((result) => result.status === TEST_PENDING || result.status === TEST_RUNNING)
}

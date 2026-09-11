import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, num, quote } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

export const EVAL_TURN_ENTITY_SET = `${p}_evalturns`

export const EVAL_TURNS_KEY = ["eval-turns"]

export const F = {
  id: `${p}_evalturnid`,
  name: `${p}_name`,
  runId: `${p}_runid`,
  evaluatedOn: `${p}_evaluatedon`,
  occurredOn: `${p}_occurredon`,
  actor: `${p}_actor`,
  source: `${p}_source`,
  query: `${p}_query`,
  response: `${p}_response`,
  toolCalls: `${p}_toolcalls`,
  toolCount: `${p}_toolcount`,
  toolCallAccuracy: `${p}_toolcallaccuracy`,
  taskAdherence: `${p}_taskadherence`,
  toolCallAccuracyReason: `${p}_toolcallaccuracyreason`,
  taskAdherenceReason: `${p}_taskadherencereason`,
  humanComment: `${p}_humancomment`,
  humanVerdict: `${p}_humanverdict`,
  mergedInto: `${p}_mergedinto`,
  mergedFrom: `${p}_mergedfrom`,
  turnCount: `${p}_turncount`,
  conversation: `${p}_conversation`,
} as const

export const VERDICT_OK = 1
export const VERDICT_NG = 2

export type EvalTurn = {
  id: string
  name: string
  runId: string
  evaluatedOn: string
  occurredOn: string
  actor: string
  source: string
  query: string
  response: string
  toolCallsJson: string
  toolCount: number | null
  toolCallAccuracy: number | null
  taskAdherence: number | null
  toolCallAccuracyReason: string
  taskAdherenceReason: string
  humanComment: string
  humanVerdict: number | null
  /** 統合先ターンの name。値がある行は一覧に出さない */
  mergedInto: string
  mergedFromJson: string
  conversationJson: string
  turnCount: number | null
  /** 複数ターンをまとめて作った行か */
  isMerged: boolean
  /** ListTable の絞り込み用に文字列化したラベル */
  verdictLabel: string
  runLabel: string
  actorLabel: string
  sourceLabel: string
}

export type ToolCall = {
  name?: string
  /** エバリュエータの出力次第で文字列にもオブジェクトにもなる */
  arguments?: unknown
  tool_call_id?: string
  /** どの MCP サーバーのツールか。列を足す前に記録された行には無い */
  server?: string
}

export type ToolCallGroup = {
  server: string
  calls: ToolCall[]
}

const UNKNOWN_SERVER = "提供元不明"

/** 呼ばれた順序は保ったまま、提供元ごとにまとめる。 */
export function groupToolCalls(calls: ToolCall[]): ToolCallGroup[] {
  const groups: ToolCallGroup[] = []
  for (const call of calls) {
    const server = call.server?.trim() || UNKNOWN_SERVER
    const existing = groups.find((group) => group.server === server)
    if (existing) existing.calls.push(call)
    else groups.push({ server, calls: [call] })
  }
  return groups
}

const SOURCE_LABELS: Record<string, string> = {
  chat: "Teams チャット",
  mailbox: "メール",
  schedule: "定期実行",
}

export function sourceLabel(value: string): string {
  return SOURCE_LABELS[value] ?? (value || "不明")
}

export function formatToolArguments(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const SKILL_TOOLS = new Set(["read_skill", "save_skill"])

/** スキルを読んだ／書いた呼び出しから、対象のスキル名を取り出す。 */
export function skillNameOf(call: ToolCall): string | null {
  if (!call.name || !SKILL_TOOLS.has(call.name)) return null
  const args = call.arguments
  const parsed =
    typeof args === "string"
      ? (() => {
          try {
            return JSON.parse(args)
          } catch {
            return null
          }
        })()
      : args
  if (!parsed || typeof parsed !== "object") return null
  const value = (parsed as Record<string, unknown>).name
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function verdictLabel(value: number | null): string {
  if (value === VERDICT_OK) return "OK"
  if (value === VERDICT_NG) return "NG"
  return "未評価"
}

/** 低スコアの境界。1-5 のうち 2 以下は要確認とみなす。 */
export const LOW_SCORE = 2

export function needsAttention(turn: EvalTurn): boolean {
  if (turn.humanVerdict === VERDICT_NG) return true
  if (turn.toolCallAccuracy !== null && turn.toolCallAccuracy <= LOW_SCORE) return true
  return turn.taskAdherence !== null && turn.taskAdherence <= LOW_SCORE
}

export function parseToolCalls(json: string): ToolCall[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as ToolCall[]) : []
  } catch {
    return []
  }
}

function toEvalTurn(row: DataverseRow): EvalTurn {
  const humanVerdict = num(row, F.humanVerdict)
  const runId = str(row, F.runId)
  const actor = str(row, F.actor)
  const source = str(row, F.source)
  const turnCount = num(row, F.turnCount)
  const mergedFromJson = str(row, F.mergedFrom)
  return {
    id: str(row, F.id),
    name: str(row, F.name),
    runId,
    evaluatedOn: str(row, F.evaluatedOn),
    occurredOn: str(row, F.occurredOn),
    actor,
    source,
    query: str(row, F.query),
    response: str(row, F.response),
    toolCallsJson: str(row, F.toolCalls),
    toolCount: num(row, F.toolCount),
    toolCallAccuracy: num(row, F.toolCallAccuracy),
    taskAdherence: num(row, F.taskAdherence),
    toolCallAccuracyReason: str(row, F.toolCallAccuracyReason),
    taskAdherenceReason: str(row, F.taskAdherenceReason),
    humanComment: str(row, F.humanComment),
    humanVerdict,
    mergedInto: str(row, F.mergedInto),
    mergedFromJson,
    conversationJson: str(row, F.conversation),
    turnCount,
    isMerged: mergedFromJson.length > 0 || (turnCount ?? 1) > 1,
    verdictLabel: verdictLabel(humanVerdict),
    runLabel: runId || "(なし)",
    actorLabel: actor || "(不明)",
    sourceLabel: sourceLabel(source),
  }
}

export async function getEvalTurn(id: string): Promise<EvalTurn> {
  const row = await DataverseService.GetItem(EVAL_TURN_ENTITY_SET, id, Object.values(F))
  return toEvalTurn(row)
}

export type TurnFilter = { search: string; actor: string; includeMerged?: boolean }

export const EMPTY_TURN_FILTER: TurnFilter = { search: "", actor: "" }

export function turnsQueryKey(filter: TurnFilter = EMPTY_TURN_FILTER) {
  return [...EVAL_TURNS_KEY, filter.search, filter.actor, filter.includeMerged === true]
}

function buildFilter({ search, actor, includeMerged }: TurnFilter): string | undefined {
  const clauses: string[] = []
  if (actor) {
    clauses.push(`${F.actor} eq '${quote(actor)}'`)
  }
  if (!includeMerged) {
    // 統合された元ターンは、統合先の 1 行として見せるので一覧には出さない。
    clauses.push(`${F.mergedInto} eq null`)
  }

  const term = search.trim()
  if (term) {
    const t = quote(term)
    // Tool calls are included so a search for a tool or server name finds the turns that used it.
    clauses.push(
      `(contains(${F.query},'${t}') or contains(${F.response},'${t}')` +
        ` or contains(${F.actor},'${t}') or contains(${F.toolCalls},'${t}'))`,
    )
  }

  return clauses.length > 0 ? clauses.join(" and ") : undefined
}

export async function listEvalTurns(
  filter: TurnFilter = EMPTY_TURN_FILTER,
  top = 500,
): Promise<EvalTurn[]> {
  const rows = await DataverseService.ListRecords(EVAL_TURN_ENTITY_SET, {
    select: Object.values(F),
    filter: buildFilter(filter),
    orderBy: `${F.occurredOn} desc`,
    top,
  })
  return rows.map(toEvalTurn)
}

export const TURN_ACTORS_KEY = ["eval-turn-actors"]

/** 絞り込み候補は表示中の行ではなく Dataverse 全体から作る。 */
export async function listTurnActors(): Promise<string[]> {
  const rows = await DataverseService.ListRecords(EVAL_TURN_ENTITY_SET, {
    select: [F.actor],
    top: 5000,
  })
  const actors = new Set<string>()
  for (const row of rows) {
    const actor = str(row, F.actor)
    if (actor) actors.add(actor)
  }
  return [...actors].sort()
}

export async function saveHumanLabel(
  id: string,
  verdict: number | null,
  comment: string,
): Promise<void> {
  await DataverseService.UpdateRecord(EVAL_TURN_ENTITY_SET, id, {
    [F.humanVerdict]: verdict,
    [F.humanComment]: comment,
  })
}

// --- 会話の統合 -------------------------------------------------------------

export const MERGE_CANDIDATES_KEY = ["eval-turn-merge-candidates"]

/** この間隔以内に続いたターンは同じ会話とみなす。 */
export const DEFAULT_GAP_MINUTES = 30

export const GAP_OPTIONS = [15, 30, 60, 180] as const

/** 統合ターンが会話の流れを保持するための 1 往復。 */
export type ConversationEntry = {
  name: string
  occurredOn: string
  query: string
  response: string
  toolCalls: ToolCall[]
}

export type MergeCandidate = {
  key: string
  actor: string
  actorLabel: string
  sourceLabel: string
  turns: EvalTurn[]
}

export function parseConversation(json: string): ConversationEntry[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as ConversationEntry[]) : []
  } catch {
    return []
  }
}

/** 統合ターンでも通常ターンでも、同じ形で会話の流れを取り出す。 */
export function conversationOf(turn: EvalTurn): ConversationEntry[] {
  const entries = parseConversation(turn.conversationJson)
  if (entries.length > 0) return entries
  return [
    {
      name: turn.name,
      occurredOn: turn.occurredOn,
      query: turn.query,
      response: turn.response,
      toolCalls: parseToolCalls(turn.toolCallsJson),
    },
  ]
}

function toTime(value: string): number {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * 同じ相手・同じ経路で続けざまに発生したターンを 1 つの会話として提案する。
 * すでに統合したもの・統合結果そのものは、入れ子を避けるため候補にしない。
 */
export function findMergeCandidates(
  turns: EvalTurn[],
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): MergeCandidate[] {
  const gap = gapMinutes * 60 * 1000
  const buckets = new Map<string, EvalTurn[]>()

  for (const turn of turns) {
    if (turn.mergedInto || turn.isMerged) continue
    const key = `${turn.actorLabel}\u0000${turn.sourceLabel}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(turn)
    else buckets.set(key, [turn])
  }

  const candidates: MergeCandidate[] = []
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) => toTime(a.occurredOn) - toTime(b.occurredOn))
    let group: EvalTurn[] = []
    const flush = () => {
      if (group.length >= 2) {
        candidates.push({
          key: `${key}\u0000${group[0].name}`,
          actor: group[0].actor,
          actorLabel: group[0].actorLabel,
          sourceLabel: group[0].sourceLabel,
          turns: group,
        })
      }
      group = []
    }
    for (const turn of sorted) {
      const previous = group[group.length - 1]
      if (previous && toTime(turn.occurredOn) - toTime(previous.occurredOn) > gap) flush()
      group.push(turn)
    }
    flush()
  }

  return candidates.sort((a, b) => toTime(b.turns[0].occurredOn) - toTime(a.turns[0].occurredOn))
}

/** Dataverse の列上限を超えると保存が丸ごと失敗するので、入り切らない分は切る。 */
function cap(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 20)}\n…（以下省略）`
}

function flatten(entries: ConversationEntry[], pick: (entry: ConversationEntry) => string): string {
  return entries
    .map((entry, index) => `【${index + 1} 回目】\n${pick(entry) || "(なし)"}`)
    .join("\n\n")
}

/**
 * 選んだターンを 1 つの会話として新しい行にまとめ、元の行には統合先を書いて一覧から隠す。
 * スコアは書かないので、統合ターンは未評価として次のパイプライン実行で採点される。
 */
export async function mergeTurns(turns: EvalTurn[]): Promise<string> {
  if (turns.length < 2) throw new Error("統合するには 2 件以上のターンが必要です。")

  const ordered = [...turns].sort((a, b) => toTime(a.occurredOn) - toTime(b.occurredOn))
  const entries: ConversationEntry[] = ordered.map((turn) => ({
    name: turn.name,
    occurredOn: turn.occurredOn,
    query: turn.query,
    response: turn.response,
    toolCalls: parseToolCalls(turn.toolCallsJson),
  }))
  const toolCalls = entries.flatMap((entry) => entry.toolCalls)
  const first = ordered[0]
  const name = `merged-${first.name}`.slice(0, 200)

  await DataverseService.CreateRecord(EVAL_TURN_ENTITY_SET, {
    [F.name]: name,
    [F.occurredOn]: new Date(first.occurredOn).toISOString(),
    [F.actor]: first.actor,
    [F.source]: first.source,
    [F.query]: cap(flatten(entries, (entry) => entry.query), 8000),
    [F.response]: cap(flatten(entries, (entry) => entry.response), 32000),
    [F.toolCalls]: cap(JSON.stringify(toolCalls), 100000),
    [F.toolCount]: toolCalls.length,
    [F.conversation]: cap(JSON.stringify(entries), 100000),
    [F.mergedFrom]: JSON.stringify(ordered.map((turn) => turn.name)),
    [F.turnCount]: ordered.length,
  })

  for (const turn of ordered) {
    await DataverseService.UpdateRecord(EVAL_TURN_ENTITY_SET, turn.id, { [F.mergedInto]: name })
  }

  return name
}

async function listTurnsByNames(names: string[]): Promise<EvalTurn[]> {
  if (names.length === 0) return []
  const filter = names.map((name) => `${F.name} eq '${quote(name)}'`).join(" or ")
  const rows = await DataverseService.ListRecords(EVAL_TURN_ENTITY_SET, {
    select: Object.values(F),
    filter,
    top: names.length,
  })
  return rows.map(toEvalTurn)
}

/** 統合をやめて元のターンを一覧に戻す。統合行は消えるので、その評価結果は残らない。 */
export async function unmergeTurn(turn: EvalTurn): Promise<void> {
  let names: string[] = []
  try {
    const parsed = JSON.parse(turn.mergedFromJson || "[]")
    if (Array.isArray(parsed)) names = parsed.filter((name): name is string => typeof name === "string")
  } catch {
    names = []
  }

  for (const source of await listTurnsByNames(names)) {
    await DataverseService.UpdateRecord(EVAL_TURN_ENTITY_SET, source.id, { [F.mergedInto]: null })
  }
  await DataverseService.DeleteRecord(EVAL_TURN_ENTITY_SET, turn.id)
}

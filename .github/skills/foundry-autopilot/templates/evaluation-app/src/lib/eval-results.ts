import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, num, quote, parseJsonArray } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

export const EVAL_RESULT_ENTITY_SET = `${p}_evalresults`

export const EVAL_RESULTS_KEY = ["eval-results"]

export const XF = {
  id: `${p}_evalresultid`,
  name: `${p}_name`,
  turnName: `${p}_turnname`,
  ruleKey: `${p}_rulekey`,
  ruleName: `${p}_rulename`,
  score: `${p}_score`,
  reason: `${p}_reason`,
  evidence: `${p}_evidence`,
  suggestions: `${p}_suggestions`,
  runId: `${p}_runid`,
  evaluatedOn: `${p}_evaluatedon`,
} as const

/** 判定の根拠。quote は原文の完全一致部分文字列なので、そのままハイライトに使える。 */
export type Evidence = {
  kind: "query" | "response" | "tool_call"
  quote: string
  note: string
  polarity: "positive" | "negative"
  /** 原文に見つからなかった引用はハイライトせず、文章としてだけ見せる。 */
  matched?: boolean
}

export type Suggestion = {
  title: string
  target: "skill" | "system_prompt" | "tool" | "other"
  detail: string
  example: string
}

export const SUGGESTION_TARGET_LABELS: Record<Suggestion["target"], string> = {
  skill: "スキル定義",
  system_prompt: "システムプロンプト",
  tool: "ツール",
  other: "その他",
}

export function suggestionTargetLabel(target: string): string {
  return SUGGESTION_TARGET_LABELS[target as Suggestion["target"]] ?? "その他"
}

export type EvalResult = {
  id: string
  name: string
  turnName: string
  ruleKey: string
  ruleName: string
  score: number | null
  reason: string
  evidence: Evidence[]
  suggestions: Suggestion[]
  runId: string
  evaluatedOn: string
}

function toEvalResult(row: DataverseRow): EvalResult {
  return {
    id: str(row, XF.id),
    name: str(row, XF.name),
    turnName: str(row, XF.turnName),
    ruleKey: str(row, XF.ruleKey),
    ruleName: str(row, XF.ruleName),
    score: num(row, XF.score),
    reason: str(row, XF.reason),
    evidence: parseJsonArray<Evidence>(str(row, XF.evidence)),
    suggestions: parseJsonArray<Suggestion>(str(row, XF.suggestions)),
    runId: str(row, XF.runId),
    evaluatedOn: str(row, XF.evaluatedOn),
  }
}

export function turnResultsQueryKey(turnName: string) {
  return [...EVAL_RESULTS_KEY, turnName]
}

/** 詳細ページ用。ターン ID は GUID ではなく geek_name の文字列で紐づいている。 */
export async function listResultsForTurn(turnName: string): Promise<EvalResult[]> {
  if (!turnName) return []
  const rows = await DataverseService.ListRecords(EVAL_RESULT_ENTITY_SET, {
    select: Object.values(XF),
    filter: `${XF.turnName} eq '${quote(turnName)}'`,
    top: 100,
  })
  return rows.map(toEvalResult)
}

export const RULE_RESULT_STATS_KEY = ["eval-result-stats"]

export type RuleStats = {
  ruleKey: string
  ruleName: string
  count: number
  average: number | null
  lowCount: number
}

/** コマンドセンターでルールごとの当たり具合を見るための集計。 */
export async function listRuleStats(): Promise<RuleStats[]> {
  const rows = await DataverseService.ListRecords(EVAL_RESULT_ENTITY_SET, {
    select: [XF.ruleKey, XF.ruleName, XF.score],
    top: 5000,
  })
  const buckets = new Map<string, { ruleName: string; scores: number[] }>()
  for (const row of rows) {
    const ruleKey = str(row, XF.ruleKey)
    if (!ruleKey) continue
    const bucket = buckets.get(ruleKey) ?? { ruleName: str(row, XF.ruleName), scores: [] }
    const score = num(row, XF.score)
    if (score !== null) bucket.scores.push(score)
    buckets.set(ruleKey, bucket)
  }
  return [...buckets.entries()].map(([ruleKey, bucket]) => ({
    ruleKey,
    ruleName: bucket.ruleName || ruleKey,
    count: bucket.scores.length,
    average:
      bucket.scores.length > 0
        ? bucket.scores.reduce((total, value) => total + value, 0) / bucket.scores.length
        : null,
    lowCount: bucket.scores.filter((score) => score <= 2).length,
  }))
}

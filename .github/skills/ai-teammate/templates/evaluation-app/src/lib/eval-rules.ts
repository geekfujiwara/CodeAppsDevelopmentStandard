import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, num, bool, quote } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

export const EVAL_RULE_ENTITY_SET = `${p}_evalrules`

export const EVAL_RULES_KEY = ["eval-rules"]

export const RF = {
  id: `${p}_evalruleid`,
  name: `${p}_name`,
  ruleKey: `${p}_rulekey`,
  summary: `${p}_summary`,
  prompt: `${p}_prompt`,
  scoreGuide: `${p}_scoreguide`,
  target: `${p}_target`,
  enabled: `${p}_enabled`,
  weight: `${p}_weight`,
  sortOrder: `${p}_sortorder`,
  builtIn: `${p}_builtin`,
} as const

export const TARGET_RESPONSE = 1
export const TARGET_TOOL_CALLS = 2
export const TARGET_BOTH = 3

export const TARGET_OPTIONS = [
  { value: TARGET_RESPONSE, label: "応答" },
  { value: TARGET_TOOL_CALLS, label: "ツール呼び出し" },
  { value: TARGET_BOTH, label: "応答とツール呼び出し" },
] as const

export function targetLabel(value: number | null): string {
  return TARGET_OPTIONS.find((option) => option.value === value)?.label ?? "不明"
}

export type EvalRule = {
  id: string
  name: string
  ruleKey: string
  summary: string
  prompt: string
  scoreGuide: string
  target: number | null
  enabled: boolean
  weight: number | null
  sortOrder: number | null
  builtIn: boolean
  /** ListTable の絞り込み用 */
  targetLabel: string
  enabledLabel: string
}

function toEvalRule(row: DataverseRow): EvalRule {
  const target = num(row, RF.target)
  const enabled = bool(row, RF.enabled)
  return {
    id: str(row, RF.id),
    name: str(row, RF.name),
    ruleKey: str(row, RF.ruleKey),
    summary: str(row, RF.summary),
    prompt: str(row, RF.prompt),
    scoreGuide: str(row, RF.scoreGuide),
    target,
    enabled,
    weight: num(row, RF.weight),
    sortOrder: num(row, RF.sortOrder),
    builtIn: bool(row, RF.builtIn),
    targetLabel: targetLabel(target),
    enabledLabel: enabled ? "有効" : "無効",
  }
}

export async function listEvalRules(): Promise<EvalRule[]> {
  const rows = await DataverseService.ListRecords(EVAL_RULE_ENTITY_SET, {
    select: Object.values(RF),
    orderBy: `${RF.sortOrder} asc`,
    top: 500,
  })
  return rows.map(toEvalRule)
}

export async function getEvalRule(id: string): Promise<EvalRule> {
  const row = await DataverseService.GetItem(EVAL_RULE_ENTITY_SET, id, Object.values(RF))
  return toEvalRule(row)
}

/** 詳細ページの評価結果からルールへ飛ぶために、ルールキーから引く。 */
export async function findEvalRuleByKey(ruleKey: string): Promise<EvalRule | null> {
  if (!ruleKey) return null
  const rows = await DataverseService.ListRecords(EVAL_RULE_ENTITY_SET, {
    select: [RF.id, RF.name, RF.ruleKey],
    filter: `${RF.ruleKey} eq '${quote(ruleKey)}'`,
    top: 1,
  })
  return rows.length > 0 ? toEvalRule(rows[0]) : null
}

export type EvalRuleInput = {
  name: string
  ruleKey: string
  summary: string
  prompt: string
  scoreGuide: string
  target: number
  enabled: boolean
  weight: number
  sortOrder: number
}

function toRow(input: EvalRuleInput): DataverseRow {
  return {
    [RF.name]: input.name,
    [RF.ruleKey]: input.ruleKey,
    [RF.summary]: input.summary,
    [RF.prompt]: input.prompt,
    [RF.scoreGuide]: input.scoreGuide,
    [RF.target]: input.target,
    [RF.enabled]: input.enabled,
    [RF.weight]: input.weight,
    [RF.sortOrder]: input.sortOrder,
  }
}

export async function createEvalRule(input: EvalRuleInput): Promise<void> {
  await DataverseService.CreateRecord(EVAL_RULE_ENTITY_SET, {
    ...toRow(input),
    [RF.builtIn]: false,
  })
}

export async function updateEvalRule(id: string, input: EvalRuleInput): Promise<void> {
  await DataverseService.UpdateRecord(EVAL_RULE_ENTITY_SET, id, toRow(input))
}

export async function deleteEvalRule(id: string): Promise<void> {
  await DataverseService.DeleteRecord(EVAL_RULE_ENTITY_SET, id)
}

/** 有効・無効の切り替えだけは一覧から直接できるようにする。 */
export async function setEvalRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await DataverseService.UpdateRecord(EVAL_RULE_ENTITY_SET, id, { [RF.enabled]: enabled })
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/

/** ルールキーはパイプラインが結果の主キーに使うので、後から変えられない前提で検証する。 */
export function validateRuleKey(value: string, existing: EvalRule[], selfId?: string): string | null {
  if (!value) return "ルールキーは必須です。"
  if (!KEY_PATTERN.test(value)) return "ルールキーは英小文字で始まり、英小文字・数字・_ のみが使えます。"
  if (existing.some((rule) => rule.ruleKey === value && rule.id !== selfId)) {
    return "同じルールキーが既にあります。"
  }
  return null
}

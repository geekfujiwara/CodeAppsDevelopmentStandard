// KPI 定義は spec/output/docs/design-requirements.md §8 と 1:1 で対応する（K-01〜K-10）。
export type KpiDirection = "up" | "down"
export type KpiTone = "good" | "warn" | "bad" | "neutral"

export type KpiResult = {
  id: string
  label: string
  /** 集計値。母数 0 などで算出不能なときは null */
  value: number | null
  unit: "%" | "日" | "件"
  target: number
  /** target に対して大きいほど良いか小さいほど良いか */
  direction: KpiDirection
  tone: KpiTone
  /** 分子/分母など、値の根拠を 1 行で示す */
  detail: string
  hint: string
}

export type KpiIncident = {
  id: string
  status: string
  createdOn: string
  closedOn: string | null
  knowledgeGenerated: boolean
  categoryName: string | null
  /** 図面改訂に紐づいているか（図面起点で辿れたかの判定に使う） */
  drawingRevisionId: string | null
}

/** 出典種別。Dataverse の Choice ラベルと同じ文字列を使う */
export const SOURCE_TYPE_INCIDENT = "問い合わせ"
export const SOURCE_TYPE_DOCUMENT = "文書"
export const SOURCE_TYPE_BIZ_SYSTEM = "業務システム"
export const SOURCE_TYPE_FILE_SERVER = "ファイルサーバー"

/** 自前 MCP Server 経由で参照する外部データソース（図面・設計書 / 故障管理 DB） */
export const EXTERNAL_SOURCE_TYPES = [SOURCE_TYPE_FILE_SERVER, SOURCE_TYPE_BIZ_SYSTEM] as const

export type KpiKnowledge = {
  id: string
  status: string
  visibility: string
  occurrenceCount: number
  createdOn: string
  approvedOn: string | null
  sourceCount: number
  /** 出典の種別一覧（重複あり）。何を突き合わせて作ったナレッジかを示す */
  sourceTypes: string[]
  categoryName: string | null
}

export type KpiAnswer = {
  id: string
  incidentId: string | null
  createdOn: string
  missingInfo: string | null
  /** エージェントが根拠付きで回答できたか（偽 = 回答不能として返した） */
  isAnswerable: boolean
  /** エージェント生成か、人が書いた回答か */
  isAiGenerated: boolean
}

export type KpiTagExtraction = {
  id: string
  resolved: boolean
}

export type KpiInput = {
  incidents: KpiIncident[]
  knowledge: KpiKnowledge[]
  answers: KpiAnswer[]
  tagExtractions: KpiTagExtraction[]
}

export const STATUS_CLOSED = "完了"
export const KNOWLEDGE_APPROVED = "承認済み"
export const KNOWLEDGE_PENDING = "未承認"
export const VISIBILITY_PUBLIC = "公開可"

/** 未承認のまま滞留していると警告する日数（K-06） */
export const STALE_APPROVAL_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

function diffDays(from: string, to: string): number | null {
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return (end - start) / DAY_MS
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return (numerator / denominator) * 100
}

function toneOf(value: number | null, target: number, direction: KpiDirection): KpiTone {
  if (value === null) return "neutral"
  const achieved = direction === "up" ? value >= target : value <= target
  if (achieved) return "good"
  // 目標から 20% 以内の乖離は警告、それ以上は赤信号
  const gap = direction === "up" ? (target - value) / target : (value - target) / target
  return gap <= 0.2 ? "warn" : "bad"
}

function build(
  base: Omit<KpiResult, "tone">,
): KpiResult {
  return { ...base, tone: toneOf(base.value, base.target, base.direction) }
}

export function computePrimaryKpis(input: KpiInput): KpiResult[] {
  const { incidents, knowledge } = input

  const closed = incidents.filter((i) => i.status === STATUS_CLOSED)
  const converted = closed.filter((i) => i.knowledgeGenerated)
  const closedWithDate = closed
    .map((i) => (i.closedOn ? diffDays(i.createdOn, i.closedOn) : null))
    .filter((v): v is number => v !== null && v >= 0)
  const withSource = knowledge.filter((k) => k.sourceCount > 0)
  const approved = knowledge.filter((k) => k.status === KNOWLEDGE_APPROVED)
  const reused = approved.filter((k) => k.occurrenceCount >= 2)

  return [
    build({
      id: "K-01",
      label: "ナレッジ化率",
      value: ratio(converted.length, closed.length),
      unit: "%",
      target: 80,
      direction: "up",
      detail: `${converted.length} / ${closed.length} 件（完了した問い合わせ）`,
      hint: "クローズした問い合わせのうち、ナレッジが自動生成された割合",
    }),
    build({
      id: "K-02",
      label: "平均クローズ日数",
      value: average(closedWithDate),
      unit: "日",
      target: 3,
      direction: "down",
      detail: `対象 ${closedWithDate.length} 件`,
      hint: "起票からクローズまでの平均日数（MTTC）",
    }),
    build({
      id: "K-03",
      label: "根拠付与率",
      value: ratio(withSource.length, knowledge.length),
      unit: "%",
      target: 100,
      direction: "up",
      detail: `${withSource.length} / ${knowledge.length} 件（全ナレッジ）`,
      hint: "出典が1件以上あるナレッジの割合。100%未満は根拠なし回答が発生している赤信号",
    }),
    build({
      id: "K-04",
      label: "ナレッジ再利用率",
      value: ratio(reused.length, approved.length),
      unit: "%",
      target: 40,
      direction: "up",
      detail: `${reused.length} / ${approved.length} 件（承認済み）`,
      hint: "複数回発生した事象をカバーできている承認済みナレッジの割合",
    }),
  ]
}

export function computeOperationalKpis(input: KpiInput, now: Date = new Date()): KpiResult[] {
  const { incidents, knowledge, answers, tagExtractions } = input

  const approvalLeadTimes = knowledge
    .map((k) => (k.approvedOn ? diffDays(k.createdOn, k.approvedOn) : null))
    .filter((v): v is number => v !== null && v >= 0)

  const pending = knowledge.filter((k) => k.status === KNOWLEDGE_PENDING)
  const approved = knowledge.filter((k) => k.status === KNOWLEDGE_APPROVED)
  const publishable = approved.filter((k) => k.visibility === VISIBILITY_PUBLIC)
  const unanswerable = answers.filter((a) => !a.isAnswerable)
  const resolvedTags = tagExtractions.filter((t) => t.resolved)

  const incidentCreatedOn = new Map(incidents.map((i) => [i.id, i.createdOn]))
  const firstAnswerAt = new Map<string, string>()
  for (const a of answers) {
    if (!a.incidentId) continue
    const current = firstAnswerAt.get(a.incidentId)
    if (!current || Date.parse(a.createdOn) < Date.parse(current)) {
      firstAnswerAt.set(a.incidentId, a.createdOn)
    }
  }
  const firstResponseDays = [...firstAnswerAt.entries()]
    .map(([incidentId, answeredOn]) => {
      const created = incidentCreatedOn.get(incidentId)
      return created ? diffDays(created, answeredOn) : null
    })
    .filter((v): v is number => v !== null && v >= 0)

  const nowIso = now.toISOString()
  const stale = pending.filter((k) => (diffDays(k.createdOn, nowIso) ?? 0) > STALE_APPROVAL_DAYS)

  return [
    build({
      id: "K-05",
      label: "承認リードタイム",
      value: average(approvalLeadTimes),
      unit: "日",
      target: 5,
      direction: "down",
      detail: `対象 ${approvalLeadTimes.length} 件`,
      hint: "ナレッジ生成から承認までの平均日数",
    }),
    build({
      id: "K-06",
      label: "未承認ナレッジ滞留",
      value: pending.length,
      unit: "件",
      target: 5,
      direction: "down",
      detail: `うち ${STALE_APPROVAL_DAYS} 日超: ${stale.length} 件`,
      hint: "レビュー待ちの滞留件数。承認のボトルネックを示す",
    }),
    build({
      id: "K-07",
      label: "公開可率",
      value: ratio(publishable.length, approved.length),
      unit: "%",
      target: 30,
      direction: "up",
      detail: `${publishable.length} / ${approved.length} 件（承認済み）`,
      hint: "顧客向けサイトに出せるナレッジの割合",
    }),
    build({
      id: "K-08",
      label: "回答不能率",
      value: ratio(unanswerable.length, answers.length),
      unit: "%",
      target: 15,
      direction: "down",
      detail: `${unanswerable.length} / ${answers.length} 件（全回答）`,
      hint: "根拠不足で回答できなかった割合。0%が続く場合は根拠なし回答を疑う",
    }),    build({
      id: "K-09",
      label: "タグ解決率",
      value: ratio(resolvedTags.length, tagExtractions.length),
      unit: "%",
      target: 90,
      direction: "up",
      detail: `${resolvedTags.length} / ${tagExtractions.length} 件（タグ抽出）`,
      hint: "図面から抽出したタグが機器マスタに名寄せできた割合",
    }),
    build({
      id: "K-10",
      label: "初回応答日数",
      value: average(firstResponseDays),
      unit: "日",
      target: 1,
      direction: "down",
      detail: `対象 ${firstResponseDays.length} 件`,
      hint: "起票から最初の回答までの平均日数",
    }),
  ]
}

/**
 * 自動化 KPI（K-11〜K-14）。
 *
 * 図面起点アーキテクチャでは「エージェントが外部データソースを突き合わせて
 * 自力で答えられたか」が価値の中心になるため、蓄積量ではなく自動化度を測る。
 */
export function computeAutomationKpis(input: KpiInput): KpiResult[] {
  const { incidents, knowledge, answers } = input

  const answeredIncidentIds = new Set(answers.map((a) => a.incidentId).filter((v): v is string => !!v))
  const autoAnsweredIncidentIds = new Set(
    answers.filter((a) => a.isAiGenerated && a.isAnswerable).map((a) => a.incidentId).filter((v): v is string => !!v),
  )
  const crossReferenced = knowledge.filter((k) => new Set(k.sourceTypes).size >= 2)
  const externalGrounded = knowledge.filter((k) =>
    k.sourceTypes.some((t) => (EXTERNAL_SOURCE_TYPES as readonly string[]).includes(t)),
  )
  const drawingLinked = incidents.filter((i) => i.drawingRevisionId !== null)

  return [
    build({
      id: "K-11",
      label: "自動回答率",
      value: ratio(autoAnsweredIncidentIds.size, answeredIncidentIds.size),
      unit: "%",
      target: 70,
      direction: "up",
      detail: `${autoAnsweredIncidentIds.size} / ${answeredIncidentIds.size} 件（回答済みの問い合わせ）`,
      hint: "エージェントが根拠付きで回答できた割合。人が書き足した回答は分子に含めない",
    }),
    build({
      id: "K-12",
      label: "根拠の横断度",
      value: ratio(crossReferenced.length, knowledge.length),
      unit: "%",
      target: 60,
      direction: "up",
      detail: `${crossReferenced.length} / ${knowledge.length} 件（全ナレッジ）`,
      hint: "2 種類以上の出典を突き合わせて作られたナレッジの割合。単一資料の丸写しを検出する",
    }),
    build({
      id: "K-13",
      label: "外部データソース参照率",
      value: ratio(externalGrounded.length, knowledge.length),
      unit: "%",
      target: 80,
      direction: "up",
      detail: `${externalGrounded.length} / ${knowledge.length} 件（全ナレッジ）`,
      hint: "図面・設計書（Azure Files）または故障管理 DB（Azure SQL）を根拠に含むナレッジの割合",
    }),
    build({
      id: "K-14",
      label: "図面紐付け率",
      value: ratio(drawingLinked.length, incidents.length),
      unit: "%",
      target: 80,
      direction: "up",
      detail: `${drawingLinked.length} / ${incidents.length} 件（全問い合わせ）`,
      hint: "図面改訂に紐づいた問い合わせの割合。低いと図面起点で辿れず回答根拠が弱くなる",
    }),
  ]
}

export type DailyAnswerPoint = {
  /** 表示用の MM/DD */
  date: string
  iso: string
  reported: number
  autoAnswered: number
  unanswerable: number
  humanAnswered: number
}

export type DailyAnswerTrend = {
  points: DailyAnswerPoint[]
  /** 集計の基準日（最新データ日）。データが過去に寄っていても推移が読めるようにする */
  anchorIso: string
}

function dayKey(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * 自動で回答できた / できなかった問い合わせの日次推移（K-11 の推移版）。
 *
 * 基準日は「データ上の最新日」。デモデータや移行直後でも推移が空にならないようにする。
 */
export function computeDailyAnswerTrend(
  input: KpiInput,
  days = 30,
  now: Date = new Date(),
): DailyAnswerTrend {
  const { incidents, answers } = input

  const allDays = [
    ...incidents.map((i) => dayKey(i.createdOn)),
    ...answers.map((a) => dayKey(a.createdOn)),
  ].filter((v): v is string => v !== null)

  const latest = allDays.length > 0 ? allDays.reduce((a, b) => (a > b ? a : b)) : now.toISOString().slice(0, 10)
  const anchor = new Date(`${latest}T00:00:00Z`)

  const buckets = new Map<string, DailyAnswerPoint>()
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getTime() - i * DAY_MS)
    const iso = d.toISOString().slice(0, 10)
    buckets.set(iso, {
      iso,
      date: `${iso.slice(5, 7)}/${iso.slice(8, 10)}`,
      reported: 0,
      autoAnswered: 0,
      unanswerable: 0,
      humanAnswered: 0,
    })
  }

  const bump = (iso: string | null, field: keyof Omit<DailyAnswerPoint, "date" | "iso">) => {
    const key = iso && dayKey(iso)
    if (!key) return
    const bucket = buckets.get(key)
    if (bucket) bucket[field] += 1
  }

  for (const i of incidents) bump(i.createdOn, "reported")
  for (const a of answers) {
    if (!a.isAnswerable) bump(a.createdOn, "unanswerable")
    else if (a.isAiGenerated) bump(a.createdOn, "autoAnswered")
    else bump(a.createdOn, "humanAnswered")
  }

  return { points: [...buckets.values()], anchorIso: latest }
}

export type SourceTypeBreakdown = { sourceType: string; count: number }

/** 出典の種別内訳。どのデータソースが回答を支えているかを見る（K-13 の内訳） */
export function computeSourceTypeBreakdown(knowledge: KpiKnowledge[]): SourceTypeBreakdown[] {
  const order = [SOURCE_TYPE_FILE_SERVER, SOURCE_TYPE_BIZ_SYSTEM, SOURCE_TYPE_DOCUMENT, SOURCE_TYPE_INCIDENT]
  const counts = new Map<string, number>(order.map((t) => [t, 0]))
  for (const k of knowledge) {
    for (const t of k.sourceTypes) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([sourceType]) => sourceType.length > 0)
    .map(([sourceType, count]) => ({ sourceType, count }))
}

export type MonthlyTrendPoint = {
  month: string
  created: number
  closed: number
  knowledge: number
}
/** 起票数・クローズ数・ナレッジ化数の月次推移（蓄積が起票に追随できているかを見る） */
export function computeMonthlyTrend(input: KpiInput, months = 6, now: Date = new Date()): MonthlyTrendPoint[] {
  const buckets = new Map<string, MonthlyTrendPoint>()
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    buckets.set(key, { month: key.slice(2), created: 0, closed: 0, knowledge: 0 })
  }

  const bump = (iso: string | null, field: "created" | "closed" | "knowledge") => {
    if (!iso) return
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return
    const d = new Date(t)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    const bucket = buckets.get(key)
    if (bucket) bucket[field] += 1
  }

  for (const i of input.incidents) {
    bump(i.createdOn, "created")
    bump(i.closedOn, "closed")
  }
  for (const k of input.knowledge) {
    bump(k.createdOn, "knowledge")
  }

  return [...buckets.values()]
}

export type FunnelStage = { stage: string; count: number }

/** 未承認 → 要確認 → 承認済み → 顧客公開可 の承認パイプライン（ボトルネック検出） */
export function computeApprovalFunnel(knowledge: KpiKnowledge[]): FunnelStage[] {
  const approved = knowledge.filter((k) => k.status === KNOWLEDGE_APPROVED)
  return [
    { stage: "未承認", count: knowledge.filter((k) => k.status === KNOWLEDGE_PENDING).length },
    { stage: "要確認", count: knowledge.filter((k) => k.status === "要確認").length },
    { stage: "承認済み", count: approved.length },
    { stage: "公開可", count: approved.filter((k) => k.visibility === VISIBILITY_PUBLIC).length },
  ]
}

export type CategoryBreakdown = {
  category: string
  total: number
  reused: number
  reuseRate: number | null
}

/** 設備カテゴリ別のナレッジ件数と再利用率（横展開の余地を見る / F-41） */
export function computeCategoryBreakdown(knowledge: KpiKnowledge[], top = 6): CategoryBreakdown[] {
  const map = new Map<string, { total: number; reused: number }>()
  for (const k of knowledge) {
    const key = k.categoryName ?? "未分類"
    const entry = map.get(key) ?? { total: 0, reused: 0 }
    entry.total += 1
    if (k.occurrenceCount >= 2) entry.reused += 1
    map.set(key, entry)
  }
  return [...map.entries()]
    .map(([category, { total, reused }]) => ({
      category,
      total,
      reused,
      reuseRate: ratio(reused, total),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, top)
}

export function formatKpi(kpi: KpiResult): string {
  if (kpi.value === null) return "—"
  const digits = kpi.unit === "件" ? 0 : 1
  return `${kpi.value.toFixed(digits)}${kpi.unit}`
}

export function formatTarget(kpi: KpiResult): string {
  const digits = kpi.unit === "件" ? 0 : 1
  const comparator = kpi.direction === "up" ? "≥" : "≤"
  return `目標 ${comparator} ${kpi.target.toFixed(digits)}${kpi.unit}`
}

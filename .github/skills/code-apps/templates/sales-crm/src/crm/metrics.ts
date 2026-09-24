import type { Activity, Opportunity, Period, Target } from "@/crm/api"
import { ActivityStatus, OpportunityStage, STALL_DAYS, TargetType } from "@/crm/schema"

export type Health = "achieved" | "on-track" | "at-risk" | "off-track" | "no-target"
export type BlockerKind = "overdue-close" | "stalled" | "no-next-step" | "overdue-task"

export interface Blocker {
  key: string
  kind: BlockerKind
  severity: 1 | 2 | 3
  label: string
  ownerId?: string
  opportunity?: Opportunity
  activity?: Activity
}

export interface Summary {
  target: number
  won: number
  weighted: number
  openInPeriod: number
  forecast: number
  gap: number
  attainment: number
  forecastRate: number
  coverage: number
  health: Health
  openDeals: Opportunity[]
  blockers: Blocker[]
}

const DAY_MS = 86_400_000

export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

const day = (value?: string) => value?.slice(0, 10)

export const isOpen = (o: Opportunity) => o.stage !== OpportunityStage.Won && o.stage !== OpportunityStage.Lost
export const weightedAmount = (o: Opportunity) => (o.amount * Math.min(Math.max(o.probability, 0), 100)) / 100

export function inPeriod(value: string | undefined, period: Period): boolean {
  const d = day(value)
  return !!d && d >= period.start && d <= period.end
}

// Dataverse の「現在」フラグは更新漏れが起きやすいため、今日の日付を含む期間を正とする
export function resolveCurrentPeriod(periods: Period[], today = todayIso()): Period | undefined {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  return sorted.find((p) => p.start <= today && today <= p.end) ?? sorted.filter((p) => p.start <= today).at(-1) ?? sorted[0]
}

export function targetsFor(targets: Target[], period: Period): Target[] {
  return targets.filter((t) => t.periodId === period.id || (t.fiscalYear === period.fiscalYear && t.quarter === period.quarter))
}

export function individualTarget(targets: Target[], period: Period, ownerId: string): number {
  return targetsFor(targets, period)
    .filter((t) => t.type === TargetType.Individual && t.ownerId === ownerId)
    .reduce((sum, t) => sum + t.amount, 0)
}

export function organizationTarget(targets: Target[], period: Period, ownerIds?: Set<string>): number {
  const inScope = targetsFor(targets, period)
  if (!ownerIds) {
    const department = inScope.filter((t) => t.type === TargetType.Department).reduce((s, t) => s + t.amount, 0)
    if (department > 0) return department
  }
  return inScope
    .filter((t) => t.type === TargetType.Individual && (!ownerIds || (t.ownerId && ownerIds.has(t.ownerId))))
    .reduce((s, t) => s + t.amount, 0)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS)
}

export function lastTouch(o: Opportunity, activities: Activity[], today = todayIso()): string | undefined {
  const touches = activities
    .filter((a) => a.opportunityId === o.id)
    .map((a) => {
      const due = day(a.dueDate)
      return due && due <= today ? due : day(a.createdOn)
    })
    .concat(day(o.modifiedOn))
    .filter((d): d is string => !!d)
    .sort()
  return touches.at(-1)
}

export function detectBlockers(opportunities: Opportunity[], activities: Activity[], now = new Date()): Blocker[] {
  const today = todayIso(now)
  const blockers: Blocker[] = []
  for (const o of opportunities.filter(isOpen)) {
    const close = day(o.closeDate)
    if (close && close < today) {
      blockers.push({ key: `${o.id}:close`, kind: "overdue-close", severity: 3, ownerId: o.ownerId, opportunity: o,
        label: `クローズ予定日を ${daysBetween(close, today)} 日超過` })
    }
    const touched = lastTouch(o, activities, today)
    const idle = touched ? daysBetween(touched, today) : Number.POSITIVE_INFINITY
    if (idle >= STALL_DAYS) {
      blockers.push({ key: `${o.id}:stall`, kind: "stalled", severity: 2, ownerId: o.ownerId, opportunity: o,
        label: Number.isFinite(idle) ? `${idle} 日間 活動なし` : "活動の記録なし" })
    }
    if (!o.nextStep?.trim()) {
      blockers.push({ key: `${o.id}:next`, kind: "no-next-step", severity: 1, ownerId: o.ownerId, opportunity: o, label: "次のアクションが未設定" })
    }
  }
  for (const a of activities) {
    if (a.status === ActivityStatus.Completed || !a.dueDate || new Date(a.dueDate) >= now) continue
    blockers.push({ key: `${a.id}:task`, kind: "overdue-task", severity: 2, ownerId: a.ownerId, activity: a,
      opportunity: opportunities.find((o) => o.id === a.opportunityId), label: `期限切れの活動「${a.name}」` })
  }
  return blockers.sort((x, y) => y.severity - x.severity)
}

export function healthOf(target: number, won: number, forecast: number): Health {
  if (target <= 0) return "no-target"
  if (won >= target) return "achieved"
  if (forecast >= target) return "on-track"
  if (forecast >= target * 0.8) return "at-risk"
  return "off-track"
}

export function summarize(input: {
  period: Period
  target: number
  opportunities: Opportunity[]
  activities: Activity[]
  now?: Date
}): Summary {
  const { period, target, opportunities, activities } = input
  const won = opportunities
    .filter((o) => o.stage === OpportunityStage.Won && inPeriod(o.actualCloseDate ?? o.closeDate, period))
    .reduce((s, o) => s + o.amount, 0)
  const openDeals = opportunities.filter(isOpen)
  const openInPeriodDeals = openDeals.filter((o) => inPeriod(o.closeDate, period))
  const weighted = openInPeriodDeals.reduce((s, o) => s + weightedAmount(o), 0)
  const openInPeriod = openInPeriodDeals.reduce((s, o) => s + o.amount, 0)
  const forecast = won + weighted
  const gap = Math.max(target - won, 0)
  return {
    target, won, weighted, openInPeriod, forecast, gap,
    attainment: target > 0 ? won / target : 0,
    forecastRate: target > 0 ? forecast / target : 0,
    coverage: gap > 0 ? openInPeriod / gap : openInPeriod > 0 ? Number.POSITIVE_INFINITY : 0,
    health: healthOf(target, won, forecast),
    openDeals,
    blockers: detectBlockers(opportunities, activities, input.now),
  }
}

export interface NextAction { opportunity: Opportunity; reason: string; action: "meeting" | "email" | "update" }

// 確度で見込みを分類する（Commit ≥ 70% / Best case 40〜69% / Pipeline < 40%）
export type ForecastCategory = "commit" | "bestCase" | "pipeline"
export const FORECAST_LABELS: Record<ForecastCategory, string> = { commit: "Commit（確度70%以上）", bestCase: "Best case（40〜69%）", pipeline: "Pipeline（40%未満）" }
export const forecastCategory = (o: Opportunity): ForecastCategory => (o.probability >= 70 ? "commit" : o.probability >= 40 ? "bestCase" : "pipeline")

export function forecastBreakdown(opportunities: Opportunity[], period: Period): Record<ForecastCategory, { amount: number; count: number }> {
  const result = { commit: { amount: 0, count: 0 }, bestCase: { amount: 0, count: 0 }, pipeline: { amount: 0, count: 0 } }
  for (const o of opportunities.filter((x) => isOpen(x) && inPeriod(x.closeDate, period))) {
    const bucket = result[forecastCategory(o)]
    bucket.amount += o.amount
    bucket.count += 1
  }
  return result
}

export interface WeeklyMovement {
  since: string
  won: Opportunity[]
  lost: Opportunity[]
  updated: Opportunity[]
  newActivities: number
}

// 直近 7 日の変化。スナップショットを持たないため、クローズ日・更新日・活動作成日から判定する
export function weeklyMovement(opportunities: Opportunity[], activities: Activity[], now = new Date()): WeeklyMovement {
  const since = todayIso(new Date(now.getTime() - 7 * DAY_MS))
  const recent = (value?: string) => !!day(value) && day(value)! >= since
  const closedAt = (o: Opportunity) => o.actualCloseDate ?? o.modifiedOn
  return {
    since,
    won: opportunities.filter((o) => o.stage === OpportunityStage.Won && recent(closedAt(o))),
    lost: opportunities.filter((o) => o.stage === OpportunityStage.Lost && recent(closedAt(o))),
    updated: opportunities.filter((o) => isOpen(o) && recent(o.modifiedOn)),
    newActivities: activities.filter((a) => recent(a.createdOn)).length,
  }
}

export function nextBestActions(deals: Opportunity[], blockers: Blocker[], period: Period): NextAction[] {
  const byDeal = new Map<string, Blocker[]>()
  for (const b of blockers) if (b.opportunity) byDeal.set(b.opportunity.id, [...(byDeal.get(b.opportunity.id) ?? []), b])
  return deals
    .filter(isOpen)
    .sort((a, b) => Number(inPeriod(b.closeDate, period)) - Number(inPeriod(a.closeDate, period)) || weightedAmount(b) - weightedAmount(a))
    .slice(0, 6)
    .map((o) => {
      const kinds = new Set((byDeal.get(o.id) ?? []).map((b) => b.kind))
      if (kinds.has("overdue-close")) return { opportunity: o, reason: "クローズ予定日を過ぎています。決裁者と見通しを確認しましょう", action: "meeting" }
      if (kinds.has("stalled")) return { opportunity: o, reason: "しばらく接点がありません。フォローアップを送りましょう", action: "email" }
      if (kinds.has("no-next-step")) return { opportunity: o, reason: "次のアクションを決めて記録しましょう", action: "update" }
      if (o.stage === OpportunityStage.Negotiation) return { opportunity: o, reason: "条件合意に向けて決裁者との場を設定しましょう", action: "meeting" }
      if (o.stage === OpportunityStage.Proposal) return { opportunity: o, reason: "提案のレビュー日程を押さえましょう", action: "meeting" }
      return { opportunity: o, reason: "課題とニーズを確認するヒアリングを設定しましょう", action: "meeting" }
    })
}

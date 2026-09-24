import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, CalendarPlus, ClipboardPlus, Flag, Gauge, MessageSquare, Target, TrendingUp, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CoworkButton } from "@/components/crm/cowork-button"
import { DataState } from "@/components/crm/data-state"
import { HealthBadge } from "@/components/crm/health-badge"
import { KpiCard } from "@/components/crm/kpi-card"
import { PageHeader } from "@/components/crm/page-header"
import { RecordDialog } from "@/components/crm/record-dialog"
import type { FormValues } from "@/crm/api"
import { formatCompact, formatCoverage, formatMoney, formatPercent } from "@/crm/format"
import { nextBusinessSlot, openExternal, teamsChatUrl, teamsMeetingUrl } from "@/crm/links"
import {
  FORECAST_LABELS, forecastBreakdown, individualTarget, organizationTarget, resolveCurrentPeriod, summarize, targetsFor, weeklyMovement,
  type Blocker, type ForecastCategory, type Summary,
} from "@/crm/metrics"
import { coworkPrompts } from "@/crm/prompts"
import { ActivityStatus, ActivityType, col, STAGE_OPTIONS, TargetType } from "@/crm/schema"
import { useActivities, useCurrentUser, useOpportunities, usePeriods, useTargets, useUserMap } from "@/hooks/use-crm"
import { cn } from "@/lib/utils"

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm"
const SEVERITY = { 3: "bg-rose-600", 2: "bg-amber-500", 1: "bg-sky-500" } as const

type Scope = "org" | "team"

export default function Dashboard() {
  const opportunities = useOpportunities()
  const activities = useActivities()
  const targets = useTargets()
  const periods = usePeriods()
  const users = useUserMap()
  const { me } = useCurrentUser()
  const [periodId, setPeriodId] = useState<string>()
  const [scope, setScope] = useState<Scope>("org")
  const [support, setSupport] = useState<FormValues>()

  const period = useMemo(() => {
    const list = periods.data ?? []
    return list.find((p) => p.id === periodId) ?? resolveCurrentPeriod(list)
  }, [periods.data, periodId])

  const view = useMemo(() => {
    if (!period) return undefined
    const opps = opportunities.data ?? []
    const acts = activities.data ?? []
    const allTargets = targets.data ?? []
    const team = me && scope === "team"
      ? new Set([me.id, ...[...users.values()].filter((u) => u.managerId === me.id).map((u) => u.id)])
      : undefined
    const inScope = (ownerId?: string) => !team || (!!ownerId && team.has(ownerId))
    const scopedOpps = opps.filter((o) => inScope(o.ownerId))
    const scopedActs = acts.filter((a) => inScope(a.ownerId))
    const memberIds = new Set<string>()
    for (const t of targetsFor(allTargets, period)) if (t.type === TargetType.Individual && t.ownerId && inScope(t.ownerId)) memberIds.add(t.ownerId)
    for (const o of scopedOpps) if (o.ownerId) memberIds.add(o.ownerId)
    const members = [...memberIds].map((id) => ({
      id,
      name: users.get(id)?.name ?? "（不明なユーザー）",
      email: users.get(id)?.email,
      summary: summarize({
        period,
        target: individualTarget(allTargets, period, id),
        opportunities: scopedOpps.filter((o) => o.ownerId === id),
        activities: scopedActs.filter((a) => a.ownerId === id),
      }),
    })).sort((a, b) => a.summary.forecastRate - b.summary.forecastRate)
    const org = summarize({ period, target: organizationTarget(allTargets, period, team), opportunities: scopedOpps, activities: scopedActs })
    const byStage = STAGE_OPTIONS.map((s) => {
      const deals = scopedOpps.filter((o) => o.stage === s.value)
      return { ...s, count: deals.length, amount: deals.reduce((sum, o) => sum + o.amount, 0) }
    })
    return { members, org, byStage, forecast: forecastBreakdown(scopedOpps, period), weekly: weeklyMovement(scopedOpps, scopedActs) }
  }, [period, opportunities.data, activities.data, targets.data, users, me, scope])

  const isLoading = opportunities.isLoading || activities.isLoading || targets.isLoading || periods.isLoading
  const error = opportunities.error ?? activities.error ?? targets.error ?? periods.error
  const needSupport = view?.members.filter((m) => m.summary.health === "off-track" || m.summary.health === "at-risk").length ?? 0
  const scopeLabel = scope === "team" ? "自分のチーム" : "組織全体"

  const startSupport = (b: Blocker) => setSupport({
    [col("name")]: `支援: ${b.opportunity?.name ?? b.activity?.name ?? "商談"}`,
    [col("type")]: ActivityType.Task,
    [col("status")]: ActivityStatus.NotStarted,
    [col("opportunityid")]: b.opportunity?.id ?? null,
    [col("description")]: `障害: ${b.label}\n担当: ${users.get(b.ownerId ?? "")?.name ?? ""}\n支援内容: `,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="チーム ダッシュボード"
        description="チームと組織の達成状況を把握し、メンバーの障害を取り除く"
        actions={
          <>
            <select className={selectClass} value={period?.id ?? ""} onChange={(e) => setPeriodId(e.target.value)} aria-label="期間">
              {(periods.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={selectClass} value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="範囲" disabled={!me}>
              <option value="org">組織全体</option>
              <option value="team">自分のチーム</option>
            </select>
            <CoworkButton prompt={coworkPrompts.managerReview(`${period?.name ?? "今期"}の${scopeLabel}`)} label="Cowork で 1on1 準備" />
          </>
        }
      />

      <DataState isLoading={isLoading} error={error}>
        {view && period ? (
          <>
            <OrgKpis org={view.org} memberCount={view.members.length} needSupport={needSupport} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>メンバー別の達成状況</CardTitle>
                  <CardDescription>{period.name}・着地見込み = 受注 + 確度加重パイプライン</CardDescription>
                </CardHeader>
                <CardContent className="h-72 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={view.members.map((m) => ({ name: m.name, 目標: m.summary.target, 受注: m.summary.won, 見込み: m.summary.weighted }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v: number) => formatCompact(v)} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => formatMoney(Number(v))} />
                      <Legend />
                      <Bar dataKey="目標" fill="var(--color-muted-foreground)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="受注" stackId="actual" fill="#059669" />
                      <Bar dataKey="見込み" stackId="actual" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>見込みの内訳と今週の動き（{scopeLabel}）</CardTitle>
                  <CardDescription>{period.name} クローズ予定の進行中商談を確度で分類、1on1 の話題に使う</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {(Object.keys(FORECAST_LABELS) as ForecastCategory[]).map((k) => (
                      <div key={k} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0">{FORECAST_LABELS[k]}</span>
                        <span className="tabular-nums text-muted-foreground">{view.forecast[k].count} 件</span>
                        <span className="w-32 text-right font-medium tabular-nums">{formatMoney(view.forecast[k].amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-3 text-sm">
                    <p className="mb-2 text-xs text-muted-foreground">直近 7 日（{view.weekly.since} 〜）</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Movement label="受注" value={`${view.weekly.won.length} 件`} hint={formatMoney(view.weekly.won.reduce((s, o) => s + o.amount, 0))} />
                      <Movement label="失注" value={`${view.weekly.lost.length} 件`} hint={formatMoney(view.weekly.lost.reduce((s, o) => s + o.amount, 0))} />
                      <Movement label="更新された商談" value={`${view.weekly.updated.length} 件`} />
                      <Movement label="記録された活動" value={`${view.weekly.newActivities} 件`} />
                    </div>
                  </div>
                  <div className="border-t pt-3">
                    <p className="mb-2 text-xs text-muted-foreground">ステージ別（全期間）</p>
                    {view.byStage.map((s) => (
                      <div key={s.value} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0">{s.label}</span>
                        <span className="tabular-nums text-muted-foreground">{s.count} 件</span>
                        <span className="w-32 text-right font-medium tabular-nums">{formatMoney(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>メンバー</CardTitle>
                <CardDescription>着地見込みの低い順。要支援のメンバーから声をかけましょう</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>メンバー</TableHead><TableHead>状態</TableHead>
                      <TableHead className="text-right">目標</TableHead><TableHead className="text-right">受注</TableHead>
                      <TableHead className="text-right">着地見込み</TableHead><TableHead className="text-right">カバレッジ</TableHead>
                      <TableHead className="text-right">障害</TableHead><TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell><HealthBadge health={m.summary.health} /></TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(m.summary.target)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(m.summary.won)}<span className="ml-1 text-xs text-muted-foreground">{formatPercent(m.summary.attainment)}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(m.summary.forecast)}<span className="ml-1 text-xs text-muted-foreground">{formatPercent(m.summary.forecastRate)}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{formatCoverage(m.summary.coverage)}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.summary.blockers.length}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button variant="ghost" size="sm" disabled={!m.email} title="1on1 を設定"
                            onClick={() => openExternal(teamsMeetingUrl({ to: [m.email], subject: `1on1: ${period.name} の達成に向けて`, body: `着地見込み ${formatPercent(m.summary.forecastRate)}・障害 ${m.summary.blockers.length} 件について`, start: nextBusinessSlot() }))}>
                            <CalendarPlus className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" disabled={!m.email} title="Teams で声をかける"
                            onClick={() => openExternal(teamsChatUrl([m.email], `${period.name}の状況を教えてください。手伝えることはありますか？`))}>
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {view.members.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">この期間の目標・商談を持つメンバーがいません</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />障害ボード</CardTitle>
                <CardDescription>期限超過・停滞・次アクション未設定・期限切れ活動。深刻度の高い順</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {view.org.blockers.slice(0, 15).map((b) => {
                  const owner = users.get(b.ownerId ?? "")
                  return (
                    <div key={b.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", SEVERITY[b.severity])} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium [overflow-wrap:anywhere]">
                          {b.opportunity ? <Link className="hover:underline" to={`/opportunities/${b.opportunity.id}`}>{b.opportunity.name}</Link> : b.activity?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{b.label}・担当 {owner?.name ?? "—"}{b.opportunity ? `・${formatMoney(b.opportunity.amount)}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" disabled={!owner?.email}
                          onClick={() => openExternal(teamsMeetingUrl({ to: [owner?.email], subject: `支援: ${b.opportunity?.name ?? b.label}`, body: b.label, start: nextBusinessSlot() }))}>
                          <CalendarPlus className="h-4 w-4" />1on1
                        </Button>
                        <Button variant="outline" size="sm" disabled={!owner?.email}
                          onClick={() => openExternal(teamsChatUrl([owner?.email], `「${b.opportunity?.name ?? b.activity?.name}」で${b.label}のようです。手伝えることはありますか？`))}>
                          <MessageSquare className="h-4 w-4" />声かけ
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => startSupport(b)}>
                          <ClipboardPlus className="h-4 w-4" />支援を記録
                        </Button>
                        <CoworkButton label="支援プラン" prompt={coworkPrompts.blockerSupport(owner?.name ?? "担当", b.opportunity?.name ?? b.activity?.name ?? "", b.label)} />
                      </div>
                    </div>
                  )
                })}
                {view.org.blockers.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">障害はありません</p>}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">会計期間が登録されていません。「売上目標」と会計期間のデータを登録してください。</CardContent></Card>
        )}
      </DataState>

      <RecordDialog entity="activity" open={!!support} onOpenChange={(o) => !o && setSupport(undefined)} initial={support} title="支援を記録" />
    </div>
  )
}

function Movement({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">{hint}</p>}
    </div>
  )
}

function OrgKpis({ org, memberCount, needSupport }: { org: Summary; memberCount: number; needSupport: number }) {
  const tone = org.health === "achieved" || org.health === "on-track" ? "good" : org.health === "at-risk" ? "warn" : "bad"
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="受注実績 / 目標" icon={Target} value={formatMoney(org.won)} progress={org.attainment}
        hint={`目標 ${formatMoney(org.target)}・達成率 ${formatPercent(org.attainment)}`} />
      <KpiCard label="着地見込み" icon={TrendingUp} value={formatPercent(org.forecastRate)} tone={tone}
        hint={`${formatMoney(org.forecast)}（残り ${formatMoney(org.gap)}）`} />
      <KpiCard label="パイプライン カバレッジ" icon={Gauge} value={formatCoverage(org.coverage)}
        tone={org.coverage >= 3 ? "good" : org.coverage >= 1 ? "warn" : "bad"} hint={`今期クローズ予定 ${formatMoney(org.openInPeriod)}（目安 3x）`} />
      <KpiCard label="要支援メンバー / 障害" icon={needSupport > 0 ? Flag : Users} value={`${needSupport} / ${memberCount} 名`}
        tone={needSupport > 0 ? "warn" : "good"} hint={`障害 ${org.blockers.length} 件`} />
    </div>
  )
}

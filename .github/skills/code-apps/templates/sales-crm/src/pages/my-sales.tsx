import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarClock, CalendarPlus, CheckCircle2, Mail, NotebookPen, Pencil, Target, TrendingUp, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CoworkButton } from "@/components/crm/cowork-button"
import { DataState } from "@/components/crm/data-state"
import { HealthBadge } from "@/components/crm/health-badge"
import { KpiCard } from "@/components/crm/kpi-card"
import { PageHeader } from "@/components/crm/page-header"
import { RecordDialog } from "@/components/crm/record-dialog"
import type { FormValues } from "@/crm/api"
import { formatDate, formatDateTime, formatMoney, formatPercent, optionLabel } from "@/crm/format"
import { nextBusinessSlot, openExternal, outlookMailUrl, outlookMeetingUrl } from "@/crm/links"
import { individualTarget, nextBestActions, resolveCurrentPeriod, summarize, weightedAmount } from "@/crm/metrics"
import { coworkPrompts } from "@/crm/prompts"
import { ACTIVITY_TYPE_OPTIONS, ActivityStatus, ActivityType, col, STAGE_OPTIONS } from "@/crm/schema"
import { useAccounts, useActivities, useContacts, useCurrentUser, useOpportunities, usePatchActivity, usePeriods, useTargets, useUserMap } from "@/hooks/use-crm"

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm"

export default function MySales() {
  const navigate = useNavigate()
  const opportunities = useOpportunities()
  const activities = useActivities()
  const targets = useTargets()
  const periods = usePeriods()
  const contacts = useContacts()
  const accounts = useAccounts()
  const users = useUserMap()
  const { me } = useCurrentUser()
  const patchActivity = usePatchActivity()
  const [memberId, setMemberId] = useState<string>()
  const [report, setReport] = useState<FormValues>()

  const period = useMemo(() => resolveCurrentPeriod(periods.data ?? []), [periods.data])
  const owners = useMemo(() => {
    const ids = new Set([...(opportunities.data ?? []).map((o) => o.ownerId), ...(targets.data ?? []).map((t) => t.ownerId)])
    return [...ids].filter((id): id is string => !!id).map((id) => ({ id, name: users.get(id)?.name ?? id }))
  }, [opportunities.data, targets.data, users])
  const ownerId = memberId ?? me?.id ?? owners[0]?.id

  const view = useMemo(() => {
    if (!period || !ownerId) return undefined
    const mine = (opportunities.data ?? []).filter((o) => o.ownerId === ownerId)
    const myActs = (activities.data ?? []).filter((a) => a.ownerId === ownerId)
    const summary = summarize({ period, target: individualTarget(targets.data ?? [], period, ownerId), opportunities: mine, activities: myActs })
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    const todo = myActs
      .filter((a) => a.status !== ActivityStatus.Completed && a.dueDate && new Date(a.dueDate) <= endOfToday)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    return { summary, actions: nextBestActions(mine, summary.blockers, period), todo }
  }, [period, ownerId, opportunities.data, activities.data, targets.data])

  const contactOf = (id?: string) => contacts.data?.find((c) => c.id === id)
  const accountOf = (id?: string) => accounts.data?.find((a) => a.id === id)

  const completeTask = async (id: string) => {
    try {
      await patchActivity.mutateAsync({ id, body: { [col("status")]: ActivityStatus.Completed } })
      toast.success("活動を完了にしました")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新に失敗しました")
    }
  }

  const isLoading = opportunities.isLoading || activities.isLoading || targets.isLoading || periods.isLoading
  const error = opportunities.error ?? activities.error ?? targets.error ?? periods.error
  const s = view?.summary

  return (
    <div className="space-y-6">
      <PageHeader
        title="営業ホーム"
        description={`${period?.name ?? ""} の目標達成に向けて、今日やること`}
        actions={
          <>
            {owners.length > 1 && (
              <select className={selectClass} value={ownerId ?? ""} onChange={(e) => setMemberId(e.target.value)} aria-label="表示するメンバー">
                {owners.map((o) => <option key={o.id} value={o.id}>{o.id === me?.id ? `${o.name}（自分）` : o.name}</option>)}
              </select>
            )}
            <Button size="sm" onClick={() => setReport({ [col("type")]: ActivityType.Meeting, [col("status")]: ActivityStatus.Completed, [col("duedate")]: null })}>
              <NotebookPen className="h-4 w-4" />活動を報告
            </Button>
            <CoworkButton prompt={coworkPrompts.dailyReport} label="Cowork で日報" />
          </>
        }
      />

      <DataState isLoading={isLoading} error={error}>
        {view && s && period ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="受注実績" icon={Target} value={formatMoney(s.won)} progress={s.attainment} hint={`目標 ${formatMoney(s.target)}・達成率 ${formatPercent(s.attainment)}`} />
              <KpiCard label="目標まで残り" icon={Wallet} value={formatMoney(s.gap)} tone={s.gap === 0 ? "good" : "warn"} hint={s.gap === 0 ? "達成しました" : "受注までの残額"} />
              <KpiCard label="着地見込み" icon={TrendingUp} value={formatPercent(s.forecastRate)}
                tone={s.health === "achieved" || s.health === "on-track" ? "good" : s.health === "at-risk" ? "warn" : "bad"} hint={formatMoney(s.forecast)} />
              <KpiCard label="期限切れ・今日の活動" icon={CalendarClock} value={`${view.todo.length} 件`} tone={view.todo.length > 0 ? "warn" : "good"} hint={`障害 ${s.blockers.length} 件`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Card className="min-w-0">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <CardTitle className="flex items-center gap-2">達成への道筋 <HealthBadge health={s.health} /></CardTitle>
                    <CardDescription>今期クローズ予定・確度加重の大きい順に、次の一手を提案します</CardDescription>
                  </div>
                  <CoworkButton prompt={coworkPrompts.gapPlan(formatMoney(s.gap))} label="Cowork で達成プラン" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {view.actions.map(({ opportunity: o, reason, action }) => {
                    const contact = contactOf(o.contactId)
                    const account = accountOf(o.accountId)
                    const subject = `${account?.name ?? ""} ${o.name}`.trim()
                    return (
                      <div key={o.id} className="space-y-2 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button type="button" className="min-w-0 text-left text-sm font-semibold hover:underline [overflow-wrap:anywhere]" onClick={() => navigate(`/opportunities/${o.id}`)}>
                            {o.name}
                          </button>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{optionLabel(STAGE_OPTIONS, o.stage)}</Badge>
                            <span className="tabular-nums">{formatMoney(o.amount)} × {o.probability}% = {formatMoney(weightedAmount(o))}</span>
                            <span>{formatDate(o.closeDate)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{reason}</p>
                        <div className="flex flex-wrap gap-1">
                          <Button variant={action === "meeting" ? "default" : "outline"} size="sm" disabled={!contact?.email}
                            title={contact?.email ? undefined : "主担当者のメールが未登録です"}
                            onClick={() => openExternal(outlookMeetingUrl({ to: [contact?.email], subject: `【打合せ】${subject}`, body: o.nextStep ?? "", start: nextBusinessSlot() }))}>
                            <CalendarPlus className="h-4 w-4" />日程調整
                          </Button>
                          <Button variant={action === "email" ? "default" : "outline"} size="sm" disabled={!contact?.email}
                            onClick={() => openExternal(outlookMailUrl({ to: [contact?.email], subject: `【ご連絡】${subject}`, body: `${contact?.name ?? ""} 様\n\nいつもお世話になっております。\n${o.nextStep ? `${o.nextStep}の件でご連絡いたしました。\n` : ""}\nよろしくお願いいたします。` }))}>
                            <Mail className="h-4 w-4" />メール下書き
                          </Button>
                          <Button variant={action === "update" ? "default" : "outline"} size="sm" onClick={() => navigate(`/opportunities/${o.id}`)}>
                            <Pencil className="h-4 w-4" />商談を更新
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {view.actions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">進行中の商談がありません。リードから商談を作りましょう。</p>}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>期限切れ・今日の活動</CardTitle>
                  <CardDescription>終わったら完了にしましょう</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {view.todo.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium [overflow-wrap:anywhere]">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{optionLabel(ACTIVITY_TYPE_OPTIONS, a.type)}・{formatDateTime(a.dueDate)}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void completeTask(a.id)} disabled={patchActivity.isPending}>
                        <CheckCircle2 className="h-4 w-4" />完了
                      </Button>
                    </div>
                  ))}
                  {view.todo.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">期限切れの活動はありません</p>}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">表示できる目標・商談がありません。</CardContent></Card>
        )}
      </DataState>

      <RecordDialog entity="activity" open={!!report} onOpenChange={(o) => !o && setReport(undefined)} initial={report} title="活動を報告" />
    </div>
  )
}

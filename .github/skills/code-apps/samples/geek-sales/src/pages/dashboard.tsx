import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { useOpportunities, useCustomers, useActivities } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Users, Activity, Target, AlertTriangle, Calendar } from "lucide-react"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { IndustryOptions } from "@/types/dataverse"

export default function Dashboard() {
  const P = PUBLISHER_PREFIX
  const navigate = useNavigate()
  const { data: opportunities = [], isLoading: oppLoading } = useOpportunities()
  const { data: customers = [], isLoading: custLoading } = useCustomers()
  const { data: activities = [], isLoading: actLoading } = useActivities()

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const activeStages = [100000000, 100000001, 100000002, 100000003]
  const closedStages = [100000004, 100000005, 100000006]

  const kpis = useMemo(() => {
    const activeOpps = opportunities.filter(o => !closedStages.includes(o[`${P}_stage`] as number))
    const pipelineTotal = activeOpps.reduce((sum, o) => sum + ((o[`${P}_amount`] as number) || 0), 0)

    const thisMonthOpps = activeOpps.filter(o => {
      const closeDate = o[`${P}_expectedclosedate`] as string
      if (!closeDate) return false
      const d = new Date(closeDate)
      return d >= thisMonthStart && d <= thisMonthEnd
    })
    const weightedForecast = thisMonthOpps.reduce((sum, o) => {
      const amount = (o[`${P}_amount`] as number) || 0
      const prob = (o[`${P}_probability`] as number) || 0
      return sum + amount * prob / 100
    }, 0)

    const thisMonthActivities = activities.filter(a => {
      const dateStr = a[`${P}_activitydate`] as string
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d >= thisMonthStart && d <= thisMonthEnd
    })

    return {
      activeCount: activeOpps.length,
      pipelineTotal,
      weightedForecast,
      thisMonthActivityCount: thisMonthActivities.length,
    }
  }, [opportunities, activities, P])

  // Pipeline funnel data
  const funnelData = useMemo(() => {
    const stageLabels: Record<number, string> = { 100000000: "リード", 100000001: "提案", 100000002: "見積", 100000003: "交渉" }
    const stageColors: Record<number, string> = { 100000000: "#94a3b8", 100000001: "#3b82f6", 100000002: "#6366f1", 100000003: "#eab308" }
    return activeStages.map(stage => {
      const opps = opportunities.filter(o => (o[`${P}_stage`] as number) === stage)
      return {
        name: stageLabels[stage],
        count: opps.length,
        amount: opps.reduce((s, o) => s + ((o[`${P}_amount`] as number) || 0), 0),
        color: stageColors[stage],
      }
    })
  }, [opportunities, P])

  // Recent 5 activities
  const recentActivities = useMemo(() => {
    const customerMap = new Map(customers.map(c => [c[`${P}_customerid`] as string, c[`${P}_name`] as string]))
    return [...activities]
      .sort((a, b) => new Date(b[`${P}_activitydate`] as string).getTime() - new Date(a[`${P}_activitydate`] as string).getTime())
      .slice(0, 5)
      .map(a => ({
        ...a,
        customerName: customerMap.get(a[`_${P}_customerid_value`] as string) ?? "",
      }))
  }, [activities, customers, P])

  // Follow-up required: customers with last activity > 30 days ago
  const followUpCustomers = useMemo(() => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const lastActivityByCustomer = new Map<string, Date>()
    activities.forEach(a => {
      const cid = a[`_${P}_customerid_value`] as string
      if (!cid) return
      const dateStr = a[`${P}_activitydate`] as string
      if (!dateStr) return
      const d = new Date(dateStr)
      const existing = lastActivityByCustomer.get(cid)
      if (!existing || d > existing) lastActivityByCustomer.set(cid, d)
    })

    return customers
      .filter(c => {
        const lastActivity = lastActivityByCustomer.get(c[`${P}_customerid`] as string)
        return !lastActivity || lastActivity < thirtyDaysAgo
      })
      .map(c => {
        const lastActivity = lastActivityByCustomer.get(c[`${P}_customerid`] as string)
        const daysSince = lastActivity
          ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000)
          : null
        return { ...c, daysSince }
      })
      .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))
      .slice(0, 5)
  }, [customers, activities, P])

  // Closing this month
  const closingThisMonth = useMemo(() => {
    const customerMap = new Map(customers.map(c => [c[`${P}_customerid`] as string, c[`${P}_name`] as string]))
    return opportunities
      .filter(o => {
        const closeDate = o[`${P}_expectedclosedate`] as string
        if (!closeDate) return false
        const d = new Date(closeDate)
        const stage = o[`${P}_stage`] as number
        return d >= thisMonthStart && d <= thisMonthEnd && activeStages.includes(stage)
      })
      .slice(0, 5)
      .map(o => ({
        ...o,
        customerName: customerMap.get(o[`_${P}_customerid_value`] as string) ?? "",
      }))
  }, [opportunities, customers, P])

  const formatAmount = (n: number) => `¥${Math.round(n / 10000).toLocaleString()}万`
  const formatDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}` }
  const activityIcon: Record<number, string> = { 100000000: "🚶", 100000001: "📞", 100000002: "✉️", 100000003: "💻", 100000004: "📋" }

  if (oppLoading || custLoading || actLoading) return <LoadingSkeletonGrid />

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />アクティブ商談
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpis.activeCount}<span className="text-sm font-normal text-muted-foreground ml-1">件</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <Target className="h-4 w-4" />パイプライン
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(kpis.pipelineTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" />今月受注見込
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(kpis.weightedForecast)}</div>
            <div className="text-xs text-muted-foreground">確度加重平均</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <Activity className="h-4 w-4" />今月の活動
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpis.thisMonthActivityCount}<span className="text-sm font-normal text-muted-foreground ml-1">件</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel + Recent activities */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">パイプラインファネル</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 48 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={40} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => `${v}件`} />
                <Bar dataKey="count" radius={4} label={{ position: "right", formatter: (v: number) => `${v}件`, fontSize: 12 }}>
                  {funnelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">最近の活動</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentActivities.length === 0 && (
              <p className="text-sm text-muted-foreground">活動がありません</p>
            )}
            {recentActivities.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span>{activityIcon[(a[`${P}_type`] as number) ?? 100000000]}</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{a[`${P}_name`] as string}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.customerName}</div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {a[`${P}_activitydate`] ? formatDate(a[`${P}_activitydate`] as string) : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Follow-up + Closing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />要フォローアップ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {followUpCustomers.length === 0 && (
              <p className="text-sm text-muted-foreground">対象顧客なし</p>
            )}
            {followUpCustomers.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-1"
                onClick={() => navigate(`/customers/${c[`${P}_customerid`] as string}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium">{c[`${P}_name`] as string}</div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {IndustryOptions[c[`${P}_industry`] as number] ?? "—"}
                </Badge>
                <span className="text-xs text-red-500 shrink-0">
                  {c.daysSince !== null ? `${c.daysSince}日未連絡` : "活動なし"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />今月クローズ予定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {closingThisMonth.length === 0 && (
              <p className="text-sm text-muted-foreground">今月クローズ予定の商談なし</p>
            )}
            {closingThisMonth.map((o, i) => (
              <div
                key={i}
                className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-1"
                onClick={() => navigate(`/opportunities/${o[`${P}_opportunityid`] as string}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium">{o[`${P}_name`] as string}</div>
                  <div className="text-xs text-muted-foreground truncate">{o.customerName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium">{formatAmount((o[`${P}_amount`] as number) || 0)}</div>
                  <div className="text-xs text-muted-foreground">{o[`${P}_probability`] as number}%</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

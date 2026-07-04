import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useQuotes } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_COLOR,
  QUOTE_STATUS_WON,
  QUOTE_STATUS_LOST,
} from "@/types/dataverse"
import { FileText, TrendingUp, Percent, CalendarClock } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

const P = PUBLISHER_PREFIX

const f = {
  id:           `${P}_quoteid`,
  name:         `${P}_name`,
  quote_number: `${P}_quote_number`,
  client:       `${P}_client`,
  status:       `${P}_status`,
  issue_date:   `${P}_issue_date`,
  expiry_date:  `${P}_expiry_date`,
  total:        `${P}_total`,
}

const STATUS_CHART_COLORS: Record<number, string> = {
  100000000: "#9ca3af",
  100000001: "#3b82f6",
  100000002: "#22c55e",
  100000003: "#ef4444",
}

const IN_PROGRESS_STATUSES = [100000000, 100000001]

function StatusBadge({ status }: { status: number }) {
  const label = QUOTE_STATUS_LABEL[status as keyof typeof QUOTE_STATUS_LABEL] ?? String(status)
  const color = QUOTE_STATUS_COLOR[status as keyof typeof QUOTE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: quotes = [], isLoading } = useQuotes()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const inProgress = quotes.filter(q => IN_PROGRESS_STATUSES.includes(q[f.status] as number)).length
    const monthWonAmount = quotes
      .filter(q => {
        if (q[f.status] !== QUOTE_STATUS_WON) return false
        const d = q[f.issue_date] as string | undefined
        if (!d) return false
        const date = new Date(d)
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear
      })
      .reduce((sum, q) => sum + ((q[f.total] as number) ?? 0), 0)
    const won = quotes.filter(q => q[f.status] === QUOTE_STATUS_WON).length
    const lost = quotes.filter(q => q[f.status] === QUOTE_STATUS_LOST).length
    const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0
    const soon = new Date()
    soon.setDate(soon.getDate() + 14)
    const soonStr = soon.toISOString().slice(0, 10)
    const todayStr = new Date().toISOString().slice(0, 10)
    const expiringSoon = quotes.filter(q => {
      if (q[f.status] !== 100000001) return false
      const d = q[f.expiry_date] as string | undefined
      return !!d && d >= todayStr && d <= soonStr
    }).length
    return { inProgress, monthWonAmount, winRate, expiringSoon }
  }, [quotes, thisMonth, thisYear])

  const monthlyChartData = useMemo(() => {
    const map = new Map<string, { 受注: number; その他: number }>()
    for (const q of quotes) {
      const d = q[f.issue_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7)
      const entry = map.get(key) ?? { 受注: 0, その他: 0 }
      const amount = (q[f.total] as number) ?? 0
      if (q[f.status] === QUOTE_STATUS_WON) entry.受注 += amount
      else entry.その他 += amount
      map.set(key, entry)
    }
    return [...map.entries()]
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
  }, [quotes])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    quotes.forEach(q => {
      const s = q[f.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: QUOTE_STATUS_LABEL[Number(k) as keyof typeof QUOTE_STATUS_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [quotes])

  const recentQuotes = useMemo(() => {
    return [...quotes]
      .sort((a, b) => {
        const aActive = IN_PROGRESS_STATUSES.includes(a[f.status] as number) ? 0 : 1
        const bActive = IN_PROGRESS_STATUSES.includes(b[f.status] as number) ? 0 : 1
        if (aActive !== bActive) return aActive - bActive
        const aDate = (a[f.issue_date] as string) ?? ""
        const bDate = (b[f.issue_date] as string) ?? ""
        return bDate.localeCompare(aDate)
      })
      .slice(0, 5)
  }, [quotes])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">見積・受注状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">見積・受注状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">進行中の見積</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.inProgress}</p>
              </div>
              <FileText className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の受注金額</p>
                <p className="text-2xl font-bold text-green-600">¥{kpi.monthWonAmount.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">受注率</p>
                <p className="text-3xl font-bold text-purple-600">{kpi.winRate}%</p>
              </div>
              <Percent className="h-10 w-10 text-purple-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">期限間近（14日以内）</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.expiringSoon}</p>
              </div>
              <CalendarClock className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 月別見積金額 */}
        <Card>
          <CardHeader>
            <CardTitle>月別見積金額（直近6ヶ月）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `¥${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `¥${Number(v ?? 0).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="受注" stackId="a" fill="#22c55e" />
                <Bar dataKey="その他" stackId="a" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ステータス別円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>ステータス別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {statusChartData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 直近の見積 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の見積</CardTitle>
          <CardDescription>進行中優先・発行日の新しい順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentQuotes.length === 0 ? (
            <p className="text-muted-foreground text-sm">見積がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">見積番号</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">取引先</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">合計金額</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">発行日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQuotes.map((quote, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/quotes/${String(quote[f.id] ?? "")}`)}
                    >
                      <td className="py-2 px-2 font-mono text-xs">{String(quote[f.quote_number] ?? "")}</td>
                      <td className="py-2 px-2 font-medium">{String(quote[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(quote[f.client] ?? "")}</td>
                      <td className="py-2 px-2">
                        {quote[f.status] != null && (
                          <StatusBadge status={quote[f.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        ¥{((quote[f.total] as number) ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(quote[f.issue_date] ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { usePurchaseRequests } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
} from "@/types/dataverse"
import { ShoppingBag, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react"
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
  id:           `${P}_requestid`,
  name:         `${P}_name`,
  category:     `${P}_category`,
  requester:    `${P}_requester`,
  department:   `${P}_department`,
  status:       `${P}_status`,
  priority:     `${P}_priority`,
  total:        `${P}_total_amount`,
  desired_date: `${P}_desired_date`,
}

const STATUS_CHART_COLORS: Record<number, string> = {
  100000000: "#9ca3af",
  100000001: "#3b82f6",
  100000002: "#22c55e",
  100000003: "#ef4444",
  100000004: "#a855f7",
  100000005: "#14b8a6",
}

function StatusBadge({ status }: { status: number }) {
  const label = REQUEST_STATUS_LABEL[status as keyof typeof REQUEST_STATUS_LABEL] ?? String(status)
  const color = REQUEST_STATUS_COLOR[status as keyof typeof REQUEST_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: number }) {
  const label = PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] ?? String(priority)
  const color = PRIORITY_COLOR[priority as keyof typeof PRIORITY_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const { data: requests = [], isLoading } = usePurchaseRequests()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const pending = requests.filter(r => r[f.status] === 100000001).length
    const approved = requests.filter(r => r[f.status] === 100000002).length
    const monthTotal = requests
      .filter(r => {
        const s = r[f.status] as number
        if (![100000002, 100000004, 100000005].includes(s)) return false
        const d = r[f.desired_date] as string | undefined
        if (!d) return false
        const date = new Date(d)
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear
      })
      .reduce((sum, r) => sum + ((r[f.total] as number) ?? 0), 0)
    const urgent = requests.filter(
      r => r[f.priority] === 100000003 && [100000001, 100000002].includes(r[f.status] as number)
    ).length
    return { pending, approved, monthTotal, urgent }
  }, [requests, thisMonth, thisYear])

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of requests) {
      const cat = (r[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [requests])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0, 100000004: 0, 100000005: 0,
    }
    requests.forEach(r => {
      const s = r[f.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: REQUEST_STATUS_LABEL[Number(k) as keyof typeof REQUEST_STATUS_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [requests])

  const recentRequests = useMemo(() => {
    return [...requests]
      .sort((a, b) => {
        const aPending = (a[f.status] as number) === 100000001 ? 0 : 1
        const bPending = (b[f.status] as number) === 100000001 ? 0 : 1
        if (aPending !== bPending) return aPending - bPending
        const aDate = (a[f.desired_date] as string) ?? ""
        const bDate = (b[f.desired_date] as string) ?? ""
        return aDate.localeCompare(bDate)
      })
      .slice(0, 5)
  }, [requests])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">購買依頼状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">購買依頼状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">申請中</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.pending}</p>
              </div>
              <ShoppingBag className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">承認済み（未発注）</p>
                <p className="text-3xl font-bold text-green-600">{kpi.approved}</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の購買合計</p>
                <p className="text-2xl font-bold text-purple-600">¥{kpi.monthTotal.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">緊急依頼</p>
                <p className="text-3xl font-bold text-red-600">{kpi.urgent}</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* カテゴリ別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>カテゴリ別依頼件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="件数" fill="hsl(var(--primary))" />
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

      {/* 直近の購買依頼 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の購買依頼</CardTitle>
          <CardDescription>申請中優先・希望納期順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm">購買依頼がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">依頼者</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">優先度</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">合計金額</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">希望納期</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((request, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{String(request[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(request[f.requester] ?? "")}</td>
                      <td className="py-2 px-2">
                        {request[f.status] != null && (
                          <StatusBadge status={request[f.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {request[f.priority] != null && (
                          <PriorityBadge priority={request[f.priority] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        ¥{((request[f.total] as number) ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(request[f.desired_date] ?? "")}
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

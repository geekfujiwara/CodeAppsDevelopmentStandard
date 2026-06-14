import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useTickets } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
} from "@/types/dataverse"
import { AlertCircle, Clock, CheckCircle, Zap } from "lucide-react"
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
  id:            `${P}_ticketid`,
  name:          `${P}_name`,
  requester:     `${P}_requester`,
  status:        `${P}_status`,
  priority:      `${P}_priority`,
  due_date:      `${P}_due_date`,
  resolved_date: `${P}_resolved_date`,
}

const STATUS_CHART_COLORS: Record<number, string> = {
  100000000: "#ef4444",
  100000001: "#3b82f6",
  100000002: "#eab308",
  100000003: "#22c55e",
  100000004: "#6b7280",
}

const PRIORITY_CHART_COLORS: Record<number, string> = {
  100000000: "#9ca3af",
  100000001: "#3b82f6",
  100000002: "#f97316",
  100000003: "#ef4444",
}

function StatusBadge({ status }: { status: number }) {
  const label = TICKET_STATUS_LABEL[status as keyof typeof TICKET_STATUS_LABEL] ?? String(status)
  const color = TICKET_STATUS_COLOR[status as keyof typeof TICKET_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
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
  const { data: tickets = [], isLoading } = useTickets()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const open = tickets.filter(t => t[f.status] === 100000000).length
    const inProgress = tickets.filter(t => t[f.status] === 100000001).length
    const resolvedThisMonth = tickets.filter(t => {
      if (t[f.status] !== 100000003) return false
      const rd = t[f.resolved_date] as string | undefined
      if (!rd) return false
      const d = new Date(rd)
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear
    }).length
    const critical = tickets.filter(
      t => t[f.priority] === 100000003 && t[f.status] !== 100000003 && t[f.status] !== 100000004
    ).length
    return { open, inProgress, resolvedThisMonth, critical }
  }, [tickets, thisMonth, thisYear])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0, 100000004: 0,
    }
    tickets.forEach(t => {
      const s = t[f.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts).map(([k, v]) => ({
      name: TICKET_STATUS_LABEL[Number(k) as keyof typeof TICKET_STATUS_LABEL],
      value: v,
      key: Number(k),
    }))
  }, [tickets])

  const priorityChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    tickets.forEach(t => {
      const p = t[f.priority] as number
      if (p in counts) counts[p]++
    })
    return Object.entries(counts).map(([k, v]) => ({
      name: PRIORITY_LABEL[Number(k) as keyof typeof PRIORITY_LABEL],
      value: v,
      key: Number(k),
    }))
  }, [tickets])

  const recentTickets = useMemo(() => tickets.slice(0, 5), [tickets])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">チケット状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">チケット状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">未対応</p>
                <p className="text-3xl font-bold text-red-600">{kpi.open}</p>
              </div>
              <AlertCircle className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">対応中</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.inProgress}</p>
              </div>
              <Clock className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">解決済み（今月）</p>
                <p className="text-3xl font-bold text-green-600">{kpi.resolvedThisMonth}</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">緊急チケット</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.critical}</p>
              </div>
              <Zap className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ステータス別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>ステータス別チケット数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="件数">
                  {statusChartData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 優先度別円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>優先度別チケット数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={priorityChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {priorityChartData.map((entry) => (
                    <Cell key={entry.key} fill={PRIORITY_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 最近のチケット */}
      <Card>
        <CardHeader>
          <CardTitle>最近のチケット</CardTitle>
          <CardDescription>直近 5 件</CardDescription>
        </CardHeader>
        <CardContent>
          {recentTickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">チケットがありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">申請者</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">優先度</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">期限</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTickets.map((ticket, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{String(ticket[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(ticket[f.requester] ?? "")}</td>
                      <td className="py-2 px-2">
                        {ticket[f.status] != null && (
                          <StatusBadge status={ticket[f.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {ticket[f.priority] != null && (
                          <PriorityBadge priority={ticket[f.priority] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(ticket[f.due_date] ?? "")}
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

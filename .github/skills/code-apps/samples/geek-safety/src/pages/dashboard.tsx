import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useIncidents } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  SEVERITY_LABEL,
  SEVERITY_COLOR,
  SEVERITY_SERIOUS,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_COLOR,
  INCIDENT_STATUS_RESOLVED,
} from "@/types/dataverse"
import { ShieldAlert, Flame, Wrench, CalendarClock } from "lucide-react"
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
  id:            `${P}_incidentid`,
  name:          `${P}_name`,
  site:          `${P}_site`,
  category:      `${P}_category`,
  severity:      `${P}_severity`,
  status:        `${P}_status`,
  reporter:      `${P}_reporter`,
  occurred_date: `${P}_occurred_date`,
}

const SEVERITY_CHART_COLORS: Record<number, string> = {
  100000000: "#eab308",
  100000001: "#f97316",
  100000002: "#ef4444",
  100000003: "#b91c1c",
}

function SeverityBadge({ severity }: { severity: number }) {
  const label = SEVERITY_LABEL[severity as keyof typeof SEVERITY_LABEL] ?? String(severity)
  const color = SEVERITY_COLOR[severity as keyof typeof SEVERITY_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: number }) {
  const label = INCIDENT_STATUS_LABEL[status as keyof typeof INCIDENT_STATUS_LABEL] ?? String(status)
  const color = INCIDENT_STATUS_COLOR[status as keyof typeof INCIDENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: incidents = [], isLoading } = useIncidents()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const monthReports = incidents.filter(r => {
      const d = r[f.occurred_date] as string | undefined
      if (!d) return false
      const date = new Date(d)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    }).length
    const serious = incidents.filter(
      r => SEVERITY_SERIOUS.includes(r[f.severity] as number) &&
        (r[f.status] as number) !== INCIDENT_STATUS_RESOLVED
    ).length
    const inProgress = incidents.filter(r => (r[f.status] as number) === 100000001).length
    const unresolved = incidents.filter(r => (r[f.status] as number) !== INCIDENT_STATUS_RESOLVED).length
    return { monthReports, serious, inProgress, unresolved }
  }, [incidents, thisMonth, thisYear])

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of incidents) {
      const cat = (r[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [incidents])

  const severityChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    incidents.forEach(r => {
      const s = r[f.severity] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: SEVERITY_LABEL[Number(k) as keyof typeof SEVERITY_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [incidents])

  const recentIncidents = useMemo(() => {
    return [...incidents]
      .sort((a, b) => {
        const aOpen = (a[f.status] as number) !== INCIDENT_STATUS_RESOLVED ? 0 : 1
        const bOpen = (b[f.status] as number) !== INCIDENT_STATUS_RESOLVED ? 0 : 1
        if (aOpen !== bOpen) return aOpen - bOpen
        const aDate = (a[f.occurred_date] as string) ?? ""
        const bDate = (b[f.occurred_date] as string) ?? ""
        return bDate.localeCompare(aDate)
      })
      .slice(0, 5)
  }, [incidents])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">安全衛生状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">安全衛生状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の報告</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.monthReports}</p>
              </div>
              <ShieldAlert className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">未解決の重大案件</p>
                <p className="text-3xl font-bold text-red-600">{kpi.serious}</p>
              </div>
              <Flame className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">対応中</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.inProgress}</p>
              </div>
              <Wrench className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">未解決（全体）</p>
                <p className="text-3xl font-bold text-purple-600">{kpi.unresolved}</p>
              </div>
              <CalendarClock className="h-10 w-10 text-purple-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 種別別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>種別別報告件数</CardTitle>
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

        {/* 重大度別円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>重大度別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={severityChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {severityChartData.map((entry) => (
                    <Cell key={entry.key} fill={SEVERITY_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 直近の報告 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の報告</CardTitle>
          <CardDescription>未解決優先・発生日の新しい順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentIncidents.length === 0 ? (
            <p className="text-muted-foreground text-sm">報告がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">拠点・場所</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">重大度</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">報告者</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">発生日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIncidents.map((incident, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/incidents/${String(incident[f.id] ?? "")}`)}
                    >
                      <td className="py-2 px-2 font-medium">{String(incident[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(incident[f.site] ?? "")}</td>
                      <td className="py-2 px-2">
                        {incident[f.severity] != null && (
                          <SeverityBadge severity={incident[f.severity] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {incident[f.status] != null && (
                          <StatusBadge status={incident[f.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{String(incident[f.reporter] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(incident[f.occurred_date] ?? "")}
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

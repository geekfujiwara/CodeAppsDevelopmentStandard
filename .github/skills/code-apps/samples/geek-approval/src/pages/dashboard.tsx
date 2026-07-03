import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useApprovalRequests } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  REQUEST_STAGE_LABEL,
  REQUEST_STAGE_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PENDING_STAGES,
} from "@/types/dataverse"
import { ClipboardCheck, FileText, CheckCircle, AlertTriangle } from "lucide-react"
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
  id:           `${P}_approval_requestid`,
  name:         `${P}_name`,
  category:     `${P}_category`,
  applicant:    `${P}_applicant`,
  department:   `${P}_department`,
  stage:        `${P}_stage`,
  priority:     `${P}_priority`,
  amount:       `${P}_amount`,
  request_date: `${P}_request_date`,
}

const STAGE_CHART_COLORS: Record<number, string> = {
  100000000: "#9ca3af",
  100000001: "#3b82f6",
  100000002: "#6366f1",
  100000003: "#22c55e",
  100000004: "#ef4444",
}

function StageBadge({ stage }: { stage: number }) {
  const label = REQUEST_STAGE_LABEL[stage as keyof typeof REQUEST_STAGE_LABEL] ?? String(stage)
  const color = REQUEST_STAGE_COLOR[stage as keyof typeof REQUEST_STAGE_COLOR] ?? "bg-gray-100 text-gray-600"
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
  const navigate = useNavigate()
  const { data: requests = [], isLoading } = useApprovalRequests()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const pending = requests.filter(r => PENDING_STAGES.includes(r[f.stage] as number)).length
    const monthRequests = requests.filter(r => {
      const d = r[f.request_date] as string | undefined
      if (!d) return false
      const date = new Date(d)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    })
    const monthCount = monthRequests.length
    const monthAmount = monthRequests.reduce((sum, r) => sum + ((r[f.amount] as number) ?? 0), 0)
    const urgent = requests.filter(
      r => r[f.priority] === 100000003 && PENDING_STAGES.includes(r[f.stage] as number)
    ).length
    return { pending, monthCount, monthAmount, urgent }
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

  const stageChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0, 100000004: 0,
    }
    requests.forEach(r => {
      const s = r[f.stage] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: REQUEST_STAGE_LABEL[Number(k) as keyof typeof REQUEST_STAGE_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [requests])

  const recentRequests = useMemo(() => {
    return [...requests]
      .sort((a, b) => {
        const aPending = PENDING_STAGES.includes(a[f.stage] as number) ? 0 : 1
        const bPending = PENDING_STAGES.includes(b[f.stage] as number) ? 0 : 1
        if (aPending !== bPending) return aPending - bPending
        const aDate = (a[f.request_date] as string) ?? ""
        const bDate = (b[f.request_date] as string) ?? ""
        return bDate.localeCompare(aDate)
      })
      .slice(0, 5)
  }, [requests])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">申請・承認状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">申請・承認状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">承認待ち</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.pending}</p>
              </div>
              <ClipboardCheck className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の申請</p>
                <p className="text-3xl font-bold text-indigo-600">{kpi.monthCount}</p>
              </div>
              <FileText className="h-10 w-10 text-indigo-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の申請金額</p>
                <p className="text-2xl font-bold text-green-600">¥{kpi.monthAmount.toLocaleString()}</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">緊急の承認待ち</p>
                <p className="text-3xl font-bold text-red-600">{kpi.urgent}</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 種別別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>種別別申請件数</CardTitle>
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

        {/* ステージ別円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>承認ステージ別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stageChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {stageChartData.map((entry) => (
                    <Cell key={entry.key} fill={STAGE_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 直近の申請 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の申請</CardTitle>
          <CardDescription>承認待ち優先・申請日の新しい順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm">申請がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">申請者</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">承認ステージ</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">優先度</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">金額</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">申請日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((request, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/requests/${String(request[f.id] ?? "")}`)}
                    >
                      <td className="py-2 px-2 font-medium">{String(request[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(request[f.applicant] ?? "")}</td>
                      <td className="py-2 px-2">
                        {request[f.stage] != null && (
                          <StageBadge stage={request[f.stage] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {request[f.priority] != null && (
                          <PriorityBadge priority={request[f.priority] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        ¥{((request[f.amount] as number) ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(request[f.request_date] ?? "")}
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

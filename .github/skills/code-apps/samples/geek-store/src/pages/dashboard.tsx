import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useStores, useAudits } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  AUDIT_STATUS_LABEL,
  AUDIT_STATUS_COLOR,
  AUDIT_COMPLETED,
  STORE_OPEN,
} from "@/types/dataverse"
import { Store, ClipboardList, Gauge, AlertTriangle } from "lucide-react"
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

const a = {
  id:         `${P}_store_auditid`,
  name:       `${P}_name`,
  store_ref:  `${P}_store_ref`,
  auditor:    `${P}_auditor`,
  status:     `${P}_status`,
  audit_date: `${P}_audit_date`,
  score:      `${P}_score`,
}

const st = {
  id:     `${P}_storeid`,
  name:   `${P}_name`,
  region: `${P}_region`,
  status: `${P}_status`,
}

const STATUS_CHART_COLORS: Record<number, string> = {
  100000000: "#3b82f6",
  100000001: "#f97316",
  100000002: "#22c55e",
}

function StatusBadge({ status }: { status: number }) {
  const label = AUDIT_STATUS_LABEL[status as keyof typeof AUDIT_STATUS_LABEL] ?? String(status)
  const color = AUDIT_STATUS_COLOR[status as keyof typeof AUDIT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: audits = [], isLoading } = useAudits()
  const { data: stores = [] } = useStores()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const store of stores) {
      map.set(String(store[st.id] ?? ""), String(store[st.name] ?? ""))
    }
    return map
  }, [stores])

  const kpi = useMemo(() => {
    const openStores = stores.filter(store => (store[st.status] as number) === STORE_OPEN).length
    const monthAudits = audits.filter(r => {
      const d = r[a.audit_date] as string | undefined
      if (!d) return false
      const date = new Date(d)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    }).length
    const completed = audits.filter(r =>
      (r[a.status] as number) === AUDIT_COMPLETED && r[a.score] != null
    )
    const avgScore = completed.length > 0
      ? Math.round(completed.reduce((sum, r) => sum + ((r[a.score] as number) ?? 0), 0) / completed.length)
      : 0
    const lowScore = completed.filter(r => ((r[a.score] as number) ?? 0) < 70).length
    return { openStores, monthAudits, avgScore, lowScore }
  }, [stores, audits, thisMonth, thisYear])

  const regionChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const store of stores) {
      const region = (store[st.region] as string) || "未設定"
      map.set(region, (map.get(region) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((x, y) => y.value - x.value)
  }, [stores])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0,
    }
    audits.forEach(r => {
      const s = r[a.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: AUDIT_STATUS_LABEL[Number(k) as keyof typeof AUDIT_STATUS_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [audits])

  const recentAudits = useMemo(() => {
    return [...audits]
      .sort((x, y) => {
        const xOpen = (x[a.status] as number) !== AUDIT_COMPLETED ? 0 : 1
        const yOpen = (y[a.status] as number) !== AUDIT_COMPLETED ? 0 : 1
        if (xOpen !== yOpen) return xOpen - yOpen
        return String(y[a.audit_date] ?? "").localeCompare(String(x[a.audit_date] ?? ""))
      })
      .slice(0, 5)
  }, [audits])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">店舗運営状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">店舗運営状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">営業中の店舗</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.openStores}</p>
              </div>
              <Store className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の臨店</p>
                <p className="text-3xl font-bold text-indigo-600">{kpi.monthAudits}</p>
              </div>
              <ClipboardList className="h-10 w-10 text-indigo-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">平均スコア（完了分）</p>
                <p className="text-3xl font-bold text-green-600">{kpi.avgScore}</p>
              </div>
              <Gauge className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">要改善（70点未満）</p>
                <p className="text-3xl font-bold text-red-600">{kpi.lowScore}</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 地域別店舗数 */}
        <Card>
          <CardHeader>
            <CardTitle>地域別店舗数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={regionChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="店舗数" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 臨店ステータス円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>臨店ステータス別件数</CardTitle>
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

      {/* 直近の臨店 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の臨店チェック</CardTitle>
          <CardDescription>未完了優先・実施日の新しい順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentAudits.length === 0 ? (
            <p className="text-muted-foreground text-sm">臨店チェックがありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">店舗</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">巡回担当</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">スコア</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">実施日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAudits.map((audit, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/audits/${String(audit[a.id] ?? "")}`)}
                    >
                      <td className="py-2 px-2 font-medium">{String(audit[a.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {storeNameMap.get(String(audit[a.store_ref] ?? "")) || "—"}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{String(audit[a.auditor] ?? "")}</td>
                      <td className="py-2 px-2">
                        {audit[a.status] != null && (
                          <StatusBadge status={audit[a.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {audit[a.score] != null ? `${audit[a.score]} 点` : "—"}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(audit[a.audit_date] ?? "")}
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

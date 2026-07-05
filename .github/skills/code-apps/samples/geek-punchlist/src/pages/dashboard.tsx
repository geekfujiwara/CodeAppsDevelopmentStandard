import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useSites, usePunchItems } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ITEM_STATUS_LABEL,
  ITEM_STATUS_COLOR,
  ITEM_VERIFIED,
  SITE_INSPECTING,
} from "@/types/dataverse"
import { HardHat, ClipboardList, AlertTriangle, CheckCircle } from "lucide-react"
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
  id:         `${P}_punch_itemid`,
  name:       `${P}_name`,
  site_ref:   `${P}_site_ref`,
  location:   `${P}_location`,
  category:   `${P}_category`,
  contractor: `${P}_contractor`,
  status:     `${P}_status`,
  due_date:   `${P}_due_date`,
}

const st = {
  id:     `${P}_siteid`,
  name:   `${P}_name`,
  status: `${P}_status`,
}

const STATUS_CHART_COLORS: Record<number, string> = {
  100000000: "#ef4444",
  100000001: "#f97316",
  100000002: "#3b82f6",
  100000003: "#22c55e",
}

function StatusBadge({ status }: { status: number }) {
  const label = ITEM_STATUS_LABEL[status as keyof typeof ITEM_STATUS_LABEL] ?? String(status)
  const color = ITEM_STATUS_COLOR[status as keyof typeof ITEM_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: items = [], isLoading } = usePunchItems()
  const { data: sites = [] } = useSites()

  const siteNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const site of sites) {
      map.set(String(site[st.id] ?? ""), String(site[st.name] ?? ""))
    }
    return map
  }, [sites])

  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const inspectingSites = sites.filter(s => (s[st.status] as number) === SITE_INSPECTING).length
    const open = items.filter(r => (r[f.status] as number) !== ITEM_VERIFIED).length
    const overdue = items.filter(r =>
      (r[f.status] as number) !== ITEM_VERIFIED &&
      !!r[f.due_date] && String(r[f.due_date]) < today
    ).length
    const verified = items.filter(r => (r[f.status] as number) === ITEM_VERIFIED).length
    const completionRate = items.length > 0 ? Math.round((verified / items.length) * 100) : 0
    return { inspectingSites, open, overdue, completionRate }
  }, [sites, items])

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of items) {
      const cat = (r[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [items])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    items.forEach(r => {
      const s = r[f.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: ITEM_STATUS_LABEL[Number(k) as keyof typeof ITEM_STATUS_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [items])

  const urgentItems = useMemo(() => {
    return [...items]
      .filter(r => (r[f.status] as number) !== ITEM_VERIFIED)
      .sort((a, b) => String(a[f.due_date] ?? "9999").localeCompare(String(b[f.due_date] ?? "9999")))
      .slice(0, 5)
  }, [items])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">是正状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">是正状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">竣工検査中の現場</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.inspectingSites}</p>
              </div>
              <HardHat className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">未完了の指摘</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.open}</p>
              </div>
              <ClipboardList className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">期限超過</p>
                <p className="text-3xl font-bold text-red-600">{kpi.overdue}</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">完了率（確認済）</p>
                <p className="text-3xl font-bold text-green-600">{kpi.completionRate}%</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 分類別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>分類別指摘件数</CardTitle>
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

      {/* 期限の近い未完了指摘 */}
      <Card>
        <CardHeader>
          <CardTitle>期限の近い未完了指摘</CardTitle>
          <CardDescription>是正期限の近い順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {urgentItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">未完了の指摘がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">指摘内容</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">現場</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">場所</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">担当業者</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">是正期限</th>
                  </tr>
                </thead>
                <tbody>
                  {urgentItems.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate("/items")}
                    >
                      <td className="py-2 px-2 font-medium">{String(item[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {siteNameMap.get(String(item[f.site_ref] ?? "")) || "—"}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{String(item[f.location] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(item[f.contractor] ?? "")}</td>
                      <td className="py-2 px-2">
                        {item[f.status] != null && (
                          <StatusBadge status={item[f.status] as number} />
                        )}
                      </td>
                      <td className={`py-2 px-2 ${!!item[f.due_date] && String(item[f.due_date]) < today ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>
                        {String(item[f.due_date] ?? "—")}
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

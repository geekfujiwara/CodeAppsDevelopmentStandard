import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useCheckpoints, useMeasurements } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  CATEGORY_LABEL,
  TIME_SLOT_LABEL,
} from "@/types/dataverse"
import { judgeThreshold } from "@/lib/threshold"
import { Thermometer, CheckCircle, AlertTriangle, ClipboardX } from "lucide-react"
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
  id:             `${P}_measurementid`,
  checkpoint_ref: `${P}_checkpoint_ref`,
  value:          `${P}_value`,
  measured_date:  `${P}_measured_date`,
  time_slot:      `${P}_time_slot`,
  inspector:      `${P}_inspector`,
  action:         `${P}_action`,
}

const c = {
  id:       `${P}_checkpointid`,
  name:     `${P}_name`,
  category: `${P}_category`,
  unit:     `${P}_unit`,
  min:      `${P}_min_value`,
  max:      `${P}_max_value`,
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: measurements = [], isLoading } = useMeasurements()
  const { data: checkpoints = [] } = useCheckpoints()

  const checkpointMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const cp of checkpoints) map.set(String(cp[c.id] ?? ""), cp)
    return map
  }, [checkpoints])

  const judge = (m: Record<string, unknown>) => {
    const cp = checkpointMap.get(String(m[f.checkpoint_ref] ?? ""))
    return judgeThreshold(m[f.value] as number | null, (cp?.[c.min] as number | null) ?? null, (cp?.[c.max] as number | null) ?? null)
  }

  const today = new Date().toISOString().slice(0, 10)

  const kpi = useMemo(() => {
    const todayList = measurements.filter(m => String(m[f.measured_date] ?? "") === today)
    const todayCount = todayList.length
    const todayDeviated = todayList.filter(m => judge(m).deviated).length
    const todayOk = todayList.filter(m => judge(m).judgement === "ok").length
    const compliance = todayOk + todayDeviated > 0 ? Math.round((todayOk / (todayOk + todayDeviated)) * 100) : 100
    // 是正未記入の逸脱（全期間）
    const unresolvedDeviations = measurements.filter(m => judge(m).deviated && !String(m[f.action] ?? "").trim()).length
    return { todayCount, todayDeviated, compliance, unresolvedDeviations }
  }, [measurements, checkpointMap, today])

  const categoryChartData = useMemo(() => {
    const map = new Map<string, { total: number; deviated: number }>()
    for (const m of measurements) {
      const cp = checkpointMap.get(String(m[f.checkpoint_ref] ?? ""))
      const cat = cp?.[c.category] != null
        ? CATEGORY_LABEL[cp[c.category] as keyof typeof CATEGORY_LABEL] ?? "その他"
        : "その他"
      const entry = map.get(cat) ?? { total: 0, deviated: 0 }
      entry.total++
      if (judge(m).deviated) entry.deviated++
      map.set(cat, entry)
    }
    return [...map.entries()].map(([name, v]) => ({ name, 適合: v.total - v.deviated, 逸脱: v.deviated }))
  }, [measurements, checkpointMap])

  const resultChartData = useMemo(() => {
    let ok = 0, low = 0, high = 0
    for (const m of measurements) {
      const j = judge(m).judgement
      if (j === "ok") ok++
      else if (j === "low") low++
      else if (j === "high") high++
    }
    return [
      { name: "適合", value: ok, color: "#22c55e" },
      { name: "下限逸脱", value: low, color: "#3b82f6" },
      { name: "上限逸脱", value: high, color: "#ef4444" },
    ].filter(d => d.value > 0)
  }, [measurements, checkpointMap])

  const recentDeviations = useMemo(() => {
    return measurements
      .filter(m => judge(m).deviated)
      .sort((a, b) => String(b[f.measured_date] ?? "").localeCompare(String(a[f.measured_date] ?? "")))
      .slice(0, 5)
  }, [measurements, checkpointMap])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">衛生管理状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">衛生管理状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">本日の測定件数</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.todayCount}</p>
              </div>
              <Thermometer className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">本日の適合率</p>
                <p className="text-3xl font-bold text-green-600">{kpi.compliance}%</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">本日の逸脱</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.todayDeviated}</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">是正未記入の逸脱</p>
                <p className="text-3xl font-bold text-red-600">{kpi.unresolvedDeviations}</p>
              </div>
              <ClipboardX className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* カテゴリ別 適合/逸脱 */}
        <Card>
          <CardHeader>
            <CardTitle>カテゴリ別 適合/逸脱</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="適合" stackId="a" fill="#22c55e" />
                <Bar dataKey="逸脱" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 判定別円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>判定別件数（全期間）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={resultChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {resultChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 直近の逸脱 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の逸脱</CardTitle>
          <CardDescription>是正措置の記入が必要な測定（新しい順・上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentDeviations.length === 0 ? (
            <p className="text-muted-foreground text-sm">逸脱はありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">点検項目</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">測定値</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">判定</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">時間帯</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">是正措置</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">測定日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeviations.map((m, idx) => {
                    const cp = checkpointMap.get(String(m[f.checkpoint_ref] ?? ""))
                    const unit = String(cp?.[c.unit] ?? "")
                    const j = judge(m)
                    const hasAction = !!String(m[f.action] ?? "").trim()
                    return (
                      <tr
                        key={idx}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate("/measurements")}
                      >
                        <td className="py-2 px-2 font-medium">{String(cp?.[c.name] ?? "—")}</td>
                        <td className="py-2 px-2 text-right font-semibold">
                          {m[f.value] != null ? `${m[f.value]}${unit}` : "—"}
                        </td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${j.colorClass}`}>
                            {j.label}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {m[f.time_slot] != null ? TIME_SLOT_LABEL[m[f.time_slot] as keyof typeof TIME_SLOT_LABEL] ?? "" : ""}
                        </td>
                        <td className="py-2 px-2">
                          {hasAction
                            ? <span className="text-muted-foreground truncate">{String(m[f.action])}</span>
                            : <span className="text-rose-600 font-medium">未記入</span>}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{String(m[f.measured_date] ?? "")}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { ParetoChart } from "@/components/pareto-chart"
import { useInspections, useDefects } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, YIELD_WARNING_THRESHOLD } from "@/config"
import {
  INSPECTION_STATUS_LABEL,
  INSPECTION_STATUS_COLOR,
  INSPECTION_COMPLETED,
  computeYield,
} from "@/types/dataverse"
import { ClipboardCheck, Gauge, AlertTriangle, Bug } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"

const P = PUBLISHER_PREFIX

const f = {
  id:              `${P}_inspectionid`,
  name:            `${P}_name`,
  line:            `${P}_line`,
  product:         `${P}_product`,
  status:          `${P}_status`,
  inspection_date: `${P}_inspection_date`,
  inspected_qty:   `${P}_inspected_qty`,
  defect_qty:      `${P}_defect_qty`,
}

const d = {
  category: `${P}_category`,
  qty:      `${P}_qty`,
}

function StatusBadge({ status }: { status: number }) {
  const label = INSPECTION_STATUS_LABEL[status as keyof typeof INSPECTION_STATUS_LABEL] ?? String(status)
  const color = INSPECTION_STATUS_COLOR[status as keyof typeof INSPECTION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: inspections = [], isLoading } = useInspections()
  const { data: defects = [] } = useDefects()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const monthList = inspections.filter(r => {
      const dt = r[f.inspection_date] as string | undefined
      if (!dt) return false
      const date = new Date(dt)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    })
    const monthCount = monthList.length
    const monthDefects = monthList.reduce((sum, r) => sum + ((r[f.defect_qty] as number) ?? 0), 0)

    // 平均歩留まり = 完了検査の合計ベース（Σ良品 / Σ検査数）
    const completed = inspections.filter(r =>
      (r[f.status] as number) === INSPECTION_COMPLETED && ((r[f.inspected_qty] as number) ?? 0) > 0
    )
    const totalInspected = completed.reduce((sum, r) => sum + ((r[f.inspected_qty] as number) ?? 0), 0)
    const totalDefect = completed.reduce((sum, r) => sum + ((r[f.defect_qty] as number) ?? 0), 0)
    const avgYield = totalInspected > 0
      ? Math.round(((totalInspected - totalDefect) / totalInspected) * 1000) / 10
      : null

    // 要注意ライン数（完了検査のライン別歩留まりがしきい値未満）
    const lineMap = new Map<string, { inspected: number; defect: number }>()
    for (const r of completed) {
      const line = (r[f.line] as string) || "未設定"
      const entry = lineMap.get(line) ?? { inspected: 0, defect: 0 }
      entry.inspected += (r[f.inspected_qty] as number) ?? 0
      entry.defect += (r[f.defect_qty] as number) ?? 0
      lineMap.set(line, entry)
    }
    const warningLines = [...lineMap.values()].filter(v => {
      const y = computeYield(v.inspected, v.defect)
      return y != null && y < YIELD_WARNING_THRESHOLD
    }).length

    return { monthCount, monthDefects, avgYield, warningLines }
  }, [inspections, thisMonth, thisYear])

  /** 不良分類別の数量（パレート図用） */
  const paretoEntries = useMemo(() => {
    const map = new Map<string, number>()
    for (const defect of defects) {
      const cat = (defect[d.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + ((defect[d.qty] as number) ?? 0))
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [defects])

  /** ライン別歩留まり（完了検査ベース） */
  const lineYieldData = useMemo(() => {
    const map = new Map<string, { inspected: number; defect: number }>()
    for (const r of inspections) {
      if ((r[f.status] as number) !== INSPECTION_COMPLETED) continue
      const line = (r[f.line] as string) || "未設定"
      const entry = map.get(line) ?? { inspected: 0, defect: 0 }
      entry.inspected += (r[f.inspected_qty] as number) ?? 0
      entry.defect += (r[f.defect_qty] as number) ?? 0
      map.set(line, entry)
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, 歩留まり: computeYield(v.inspected, v.defect) ?? 0 }))
      .filter(row => row.歩留まり > 0)
      .sort((a, b) => a.歩留まり - b.歩留まり)
  }, [inspections])

  const recentInspections = useMemo(() => {
    return [...inspections]
      .sort((a, b) => {
        const aOpen = (a[f.status] as number) !== INSPECTION_COMPLETED ? 0 : 1
        const bOpen = (b[f.status] as number) !== INSPECTION_COMPLETED ? 0 : 1
        if (aOpen !== bOpen) return aOpen - bOpen
        return String(b[f.inspection_date] ?? "").localeCompare(String(a[f.inspection_date] ?? ""))
      })
      .slice(0, 5)
  }, [inspections])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">品質状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">品質状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の検査</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.monthCount}</p>
              </div>
              <ClipboardCheck className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">平均歩留まり（完了分）</p>
                <p className="text-3xl font-bold text-green-600">
                  {kpi.avgYield != null ? `${kpi.avgYield}%` : "—"}
                </p>
              </div>
              <Gauge className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の不良数</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.monthDefects}</p>
              </div>
              <Bug className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">要注意ライン（{YIELD_WARNING_THRESHOLD}%未満）</p>
                <p className="text-3xl font-bold text-red-600">{kpi.warningLines}</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 不良分類パレート図 */}
        <Card>
          <CardHeader>
            <CardTitle>不良分類パレート図</CardTitle>
            <CardDescription>赤 = 累積 80% までの重点対策対象</CardDescription>
          </CardHeader>
          <CardContent>
            <ParetoChart entries={paretoEntries} barName="不良数量" />
          </CardContent>
        </Card>

        {/* ライン別歩留まり */}
        <Card>
          <CardHeader>
            <CardTitle>ライン別歩留まり（完了分）</CardTitle>
            <CardDescription>低い順。{YIELD_WARNING_THRESHOLD}% 未満は赤表示</CardDescription>
          </CardHeader>
          <CardContent>
            {lineYieldData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">完了した検査がありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={lineYieldData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}%`, "歩留まり"]} />
                  <Bar dataKey="歩留まり" radius={[0, 4, 4, 0]}>
                    {lineYieldData.map((row, i) => (
                      <Cell key={i} fill={row.歩留まり < YIELD_WARNING_THRESHOLD ? "#ef4444" : "#22c55e"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 直近の検査 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の検査</CardTitle>
          <CardDescription>未完了優先・実施日の新しい順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentInspections.length === 0 ? (
            <p className="text-muted-foreground text-sm">検査記録がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ライン</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">品目</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">不良数</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">歩留まり</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">実施日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInspections.map((inspection, idx) => {
                    const inspectedQty = (inspection[f.inspected_qty] as number) ?? 0
                    const defectQty = (inspection[f.defect_qty] as number) ?? 0
                    const y = computeYield(inspectedQty, defectQty)
                    return (
                      <tr
                        key={idx}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate(`/inspections/${String(inspection[f.id] ?? "")}`)}
                      >
                        <td className="py-2 px-2 font-medium">{String(inspection[f.name] ?? "")}</td>
                        <td className="py-2 px-2 text-muted-foreground">{String(inspection[f.line] ?? "")}</td>
                        <td className="py-2 px-2 text-muted-foreground">{String(inspection[f.product] ?? "")}</td>
                        <td className="py-2 px-2">
                          {inspection[f.status] != null && (
                            <StatusBadge status={inspection[f.status] as number} />
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">{defectQty}</td>
                        <td className={`py-2 px-2 text-right ${y != null && y < YIELD_WARNING_THRESHOLD ? "font-semibold text-rose-600" : ""}`}>
                          {y != null ? `${y}%` : "—"}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {String(inspection[f.inspection_date] ?? "")}
                        </td>
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

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useEquipment, useWorkOrders } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  WORK_ORDER_TYPE_LABEL,
  WORK_ORDER_TYPE_OPTIONS,
  EQUIPMENT_STATUS_OPTIONS,
} from "@/types/dataverse"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

const P = PUBLISHER_PREFIX

const fe = {
  id:       `${P}_equipmentid`,
  name:     `${P}_name`,
  status:   `${P}_status`,
  category: `${P}_category`,
}

const fw = {
  id:           `${P}_work_orderid`,
  name:         `${P}_name`,
  equipment_id: `${P}_equipment_id`,
  work_type:    `${P}_work_type`,
  status:       `${P}_status`,
  planned_date: `${P}_planned_date`,
}

const TYPE_COLORS: Record<number, string> = {
  100000000: "#3b82f6",
  100000001: "#f97316",
  100000002: "#ef4444",
  100000003: "#9ca3af",
}

const PIE_COLORS = ["#22c55e", "#9ca3af", "#eab308", "#ef4444"]

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            レポートは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_REPORTS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function ReportsPage() {
  if (!FEATURE_REPORTS) return <DisabledFeatureCard />
  return <ReportsContent />
}

function ReportsContent() {
  const { data: equipment = [], isLoading: eqLoading } = useEquipment()
  const { data: workOrders = [], isLoading: woLoading } = useWorkOrders()
  const isLoading = eqLoading || woLoading

  // Equipment name map
  const equipmentMap = useMemo(() =>
    new Map(equipment.map(e => [String(e[fe.id] ?? ""), String(e[fe.name] ?? "")])),
    [equipment]
  )

  // 1. 設備別作業履歴
  const equipmentHistory = useMemo(() => {
    const map = new Map<string, { name: string; total: number; completed: number; emergency: number }>()
    for (const e of equipment) {
      const id = String(e[fe.id] ?? "")
      map.set(id, { name: String(e[fe.name] ?? ""), total: 0, completed: 0, emergency: 0 })
    }
    for (const w of workOrders) {
      const eqId = w[`_${P}_equipment_id_value`] as string | undefined
      if (!eqId || !map.has(eqId)) continue
      const entry = map.get(eqId)!
      entry.total++
      if (w[fw.status] === 100000002) entry.completed++
      if (w[fw.work_type] === 100000002) entry.emergency++
    }
    return [...map.values()].filter(v => v.total > 0).sort((a, b) => b.total - a.total)
  }, [equipment, workOrders])

  // 2. 月別作業件数（直近6ヶ月）
  const monthlyData = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i)
      return {
        label: format(d, "yyyy/MM"),
        start: startOfMonth(d),
        end:   endOfMonth(d),
      }
    })
    return months.map(m => {
      const row: Record<string, unknown> = { month: m.label }
      for (const opt of WORK_ORDER_TYPE_OPTIONS) {
        row[String(opt.value)] = workOrders.filter(w => {
          const pd = w[fw.planned_date] as string | undefined
          if (!pd) return false
          const d = new Date(pd)
          return d >= m.start && d <= m.end && w[fw.work_type] === opt.value
        }).length
      }
      return row
    })
  }, [workOrders])

  // 3. カテゴリ別設備状況
  const categoryStats = useMemo(() => {
    const map = new Map<string, { total: number; active: number; repair: number; inactive: number }>()
    for (const e of equipment) {
      const cat = (e[fe.category] as string) || "未分類"
      const status = e[fe.status] as number
      const entry = map.get(cat) ?? { total: 0, active: 0, repair: 0, inactive: 0 }
      entry.total++
      if (status === 100000000) entry.active++
      else if (status === 100000002) entry.repair++
      else if (status === 100000001) entry.inactive++
      map.set(cat, entry)
    }
    return [...map.entries()]
      .map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [equipment])

  // Equipment status for pie chart
  const equipStatusPieData = useMemo(() => {
    return EQUIPMENT_STATUS_OPTIONS.map(opt => ({
      name: opt.label,
      value: equipment.filter(e => e[fe.status] === opt.value).length,
    })).filter(d => d.value > 0)
  }, [equipment])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">レポート</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  // Suppress unused warning for equipmentMap if not used in JSX directly
  void equipmentMap

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">レポート</h1>
        <p className="text-sm text-muted-foreground mt-1">設備保全統計（クライアント集計）</p>
      </div>

      {/* 1. 設備別作業履歴 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">設備別作業履歴</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>設備名</TableHead>
                  <TableHead className="text-right">総作業数</TableHead>
                  <TableHead className="text-right">完了</TableHead>
                  <TableHead className="text-right">未完了</TableHead>
                  <TableHead className="text-right">緊急対応数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipmentHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  equipmentHistory.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right">{row.completed}</TableCell>
                      <TableCell className="text-right">{row.total - row.completed}</TableCell>
                      <TableCell className="text-right">{row.emergency}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 2. 月別作業件数 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">月別作業件数（直近 6 ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              {WORK_ORDER_TYPE_OPTIONS.map(opt => (
                <Bar
                  key={opt.value}
                  dataKey={String(opt.value)}
                  name={WORK_ORDER_TYPE_LABEL[opt.value as keyof typeof WORK_ORDER_TYPE_LABEL]}
                  stackId="a"
                  fill={TYPE_COLORS[opt.value] ?? "#6b7280"}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3. カテゴリ別設備状況 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カテゴリ別設備状況</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead className="text-right">設備数</TableHead>
                    <TableHead className="text-right">稼働中</TableHead>
                    <TableHead className="text-right">修理中</TableHead>
                    <TableHead className="text-right">停止</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        データがありません
                      </TableCell>
                    </TableRow>
                  ) : (
                    categoryStats.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{row.cat}</TableCell>
                        <TableCell className="text-right">{row.total}</TableCell>
                        <TableCell className="text-right">{row.active}</TableCell>
                        <TableCell className="text-right">{row.repair}</TableCell>
                        <TableCell className="text-right">{row.inactive}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* 設備ステータス円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">設備ステータス分布</CardTitle>
          </CardHeader>
          <CardContent>
            {equipStatusPieData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={equipStatusPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {equipStatusPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v) => [`${v} 台`, "台数"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

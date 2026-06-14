import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useExpenses } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/types/dataverse"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

const CHART_COLORS = [
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#f59e0b",
  "#34d399",
  "#f87171",
]

export default function Analytics() {
  const { data: expenses = [], isLoading } = useExpenses()

  const f = {
    amount:   `${PUBLISHER_PREFIX}_amount`,
    category: `${PUBLISHER_PREFIX}_category`,
    dept:     `${PUBLISHER_PREFIX}_department`,
    date:     `${PUBLISHER_PREFIX}_expensedate`,
    status:   `${PUBLISHER_PREFIX}_status`,
  }

  // カテゴリ別金額
  const categoryData = useMemo(() => {
    const totals: Record<number, number> = {}
    expenses.forEach((e) => {
      const cat = e[f.category] as number
      const amt = (e[f.amount] as number) ?? 0
      if (cat != null) {
        totals[cat] = (totals[cat] ?? 0) + amt
      }
    })
    return Object.entries(EXPENSE_CATEGORY_LABEL)
      .map(([value, label]) => ({
        name:  label,
        value: totals[Number(value)] ?? 0,
      }))
      .filter((d) => d.value > 0)
  }, [expenses, f.category, f.amount])

  // 月別申請金額（直近6ヶ月）
  const monthlyData = useMemo(() => {
    const now   = new Date()
    const months: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${d.getMonth() + 1}月`,
      })
    }

    const totals: Record<string, number> = {}
    expenses.forEach((e) => {
      const rawDate = (e[f.date] as string) || (e.createdon as string) || ""
      if (!rawDate) return
      const d   = new Date(rawDate)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const amt = (e[f.amount] as number) ?? 0
      totals[key] = (totals[key] ?? 0) + amt
    })

    return months.map((m) => ({ name: m.label, 金額: totals[m.key] ?? 0 }))
  }, [expenses, f.amount, f.date])

  // 部門別集計
  const deptData = useMemo(() => {
    const totals: Record<string, { count: number; total: number }> = {}
    expenses.forEach((e) => {
      const dept = (e[f.dept] as string) || "未設定"
      const amt  = (e[f.amount] as number) ?? 0
      if (!totals[dept]) totals[dept] = { count: 0, total: 0 }
      totals[dept].count++
      totals[dept].total += amt
    })
    return Object.entries(totals)
      .map(([dept, { count, total }]) => ({ dept, count, total }))
      .sort((a, b) => b.total - a.total)
  }, [expenses, f.dept, f.amount])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">分析</h1>
        <LoadingSkeletonGrid columns={2} count={2} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">分析</h1>

      {/* チャート行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* カテゴリ別 PieChart */}
        <Card>
          <CardHeader>
            <CardTitle>カテゴリ別金額構成</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {categoryData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 月別申請金額 BarChart */}
        <Card>
          <CardHeader>
            <CardTitle>月別申請金額推移（直近6ヶ月）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                <Bar dataKey="金額" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 部門別集計テーブル */}
      <Card>
        <CardHeader>
          <CardTitle>部門別集計</CardTitle>
        </CardHeader>
        <CardContent>
          {deptData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">データがありません</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">部門</th>
                    <th className="px-4 py-3 text-right font-medium">件数</th>
                    <th className="px-4 py-3 text-right font-medium">合計金額</th>
                    <th className="px-4 py-3 text-right font-medium">平均金額</th>
                  </tr>
                </thead>
                <tbody>
                  {deptData.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{row.dept}</td>
                      <td className="px-4 py-3 text-right">{row.count}</td>
                      <td className="px-4 py-3 text-right">¥{row.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        ¥{Math.round(row.total / row.count).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* サマリー */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">総申請件数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{expenses.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">総経費合計</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ¥{expenses.reduce((s, e) => s + ((e[f.amount] as number) ?? 0), 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">平均申請金額</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ¥{expenses.length > 0
                ? Math.round(
                    expenses.reduce((s, e) => s + ((e[f.amount] as number) ?? 0), 0) / expenses.length
                  ).toLocaleString()
                : 0}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

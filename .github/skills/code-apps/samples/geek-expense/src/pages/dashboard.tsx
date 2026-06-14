import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useExpenses } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_COLOR,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseStatus,
  type ExpenseCategory,
} from "@/types/dataverse"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { TrendingUp, Clock, FileText, AlertCircle } from "lucide-react"

function StatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EXPENSE_STATUS_COLOR[status]}`}>
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  )
}

export default function Dashboard() {
  const { data: expenses = [], isLoading } = useExpenses()

  const statusField  = `${PUBLISHER_PREFIX}_status`
  const amountField  = `${PUBLISHER_PREFIX}_amount`
  const titleField   = `${PUBLISHER_PREFIX}_title`
  const categoryField = `${PUBLISHER_PREFIX}_category`
  const dateField    = `${PUBLISHER_PREFIX}_expensedate`

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear  = now.getFullYear()

  const stats = useMemo(() => {
    const thisMonthExpenses = expenses.filter((e) => {
      const d = new Date(e[dateField] as string || e.createdon || "")
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth
    })

    const totalAmount = thisMonthExpenses.reduce(
      (sum, e) => sum + ((e[amountField] as number) || 0),
      0
    )
    const pendingCount = expenses.filter(
      (e) => (e[statusField] as number) === 100000001
    ).length
    const thisMonthCount = thisMonthExpenses.length
    const rejectedCount = expenses.filter(
      (e) => (e[statusField] as number) === 100000003
    ).length

    return { totalAmount, pendingCount, thisMonthCount, rejectedCount }
  }, [expenses, statusField, amountField, dateField, thisMonth, thisYear])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    expenses.forEach((e) => {
      const s = (e[statusField] as number) ?? 100000000
      counts[s] = (counts[s] ?? 0) + 1
    })
    return Object.entries(EXPENSE_STATUS_LABEL).map(([value, label]) => ({
      name: label,
      件数: counts[Number(value)] ?? 0,
    }))
  }, [expenses, statusField])

  const recentExpenses = useMemo(
    () => expenses.slice(0, 5),
    [expenses]
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              今月の経費合計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ¥{stats.totalAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              承認待ち件数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{stats.pendingCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              今月の申請件数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.thisMonthCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              差戻し件数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.rejectedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* ステータス別グラフ */}
      <Card>
        <CardHeader>
          <CardTitle>ステータス別件数</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="件数" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 最近の経費 */}
      <Card>
        <CardHeader>
          <CardTitle>最近の経費申請（直近5件）</CardTitle>
        </CardHeader>
        <CardContent>
          {recentExpenses.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">経費データがありません</p>
          ) : (
            <div className="divide-y divide-border">
              {recentExpenses.map((expense, idx) => {
                const status = (expense[statusField] as ExpenseStatus) ?? 100000000
                const category = expense[categoryField] as ExpenseCategory
                const amount = (expense[amountField] as number) ?? 0
                const title = (expense[titleField] as string) ?? "（件名なし）"
                return (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusBadge status={status} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{title}</p>
                        <p className="text-xs text-muted-foreground">
                          {category != null ? EXPENSE_CATEGORY_LABEL[category] : "—"}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold ml-4 shrink-0">
                      ¥{amount.toLocaleString()}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

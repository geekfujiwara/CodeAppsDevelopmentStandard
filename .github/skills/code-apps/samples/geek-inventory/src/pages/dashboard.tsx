import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useProducts, useStockMovements } from "@/hooks/use-dataverse"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { PUBLISHER_PREFIX } from "@/config"
import { MOVEMENT_TYPE_LABEL } from "@/types/dataverse"
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
  Package,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const P = PUBLISHER_PREFIX
const fp = {
  id:            `${P}_productid`,
  name:          `${P}_name`,
  category:      `${P}_category`,
  current_stock: `${P}_current_stock`,
  min_stock:     `${P}_min_stock`,
}
const fm = {
  type: `${P}_movement_type`,
  qty:  `${P}_quantity`,
  date: `${P}_movement_date`,
}

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#8b5cf6", "#ec4899"]

export default function Dashboard() {
  const { data: products, isLoading: loadingProducts } = useProducts()
  const { data: stockMovements, isLoading: loadingMovements } = useStockMovements()

  const kpis = useMemo(() => {
    if (!products) return { total: 0, outOfStock: 0, lowStock: 0, thisMonthInbound: 0 }

    const total = products.length
    const outOfStock = products.filter(
      (p) => (p[fp.current_stock] as number) === 0
    ).length
    const lowStock = products.filter((p) => {
      const cur = p[fp.current_stock] as number
      const min = p[fp.min_stock] as number
      return cur > 0 && min > 0 && cur <= min
    }).length

    const now = new Date()
    const thisMonthInbound = (stockMovements ?? [])
      .filter((m) => {
        if ((m[fm.type] as number) !== 100000000) return false
        const d = m[fm.date] as string
        if (!d) return false
        const date = new Date(d)
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
      })
      .reduce((sum, m) => sum + ((m[fm.qty] as number) ?? 0), 0)

    return { total, outOfStock, lowStock, thisMonthInbound }
  }, [products, stockMovements])

  const categoryStockData = useMemo(() => {
    if (!products) return []
    const map: Record<string, number> = {}
    for (const p of products) {
      const cat = (p[fp.category] as string) || "未分類"
      map[cat] = (map[cat] ?? 0) + ((p[fp.current_stock] as number) ?? 0)
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [products])

  const categoryCountData = useMemo(() => {
    if (!products) return []
    const map: Record<string, number> = {}
    for (const p of products) {
      const cat = (p[fp.category] as string) || "未分類"
      map[cat] = (map[cat] ?? 0) + 1
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [products])

  const lowStockProducts = useMemo(() => {
    if (!products) return []
    return products.filter((p) => {
      const cur = p[fp.current_stock] as number
      const min = p[fp.min_stock] as number
      return cur <= min
    })
  }, [products])

  if (loadingProducts || loadingMovements) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <LoadingSkeletonGrid columns={4} count={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">商品数</CardTitle>
            <Package className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{kpis.total}</div>
            <p className="text-xs text-muted-foreground mt-1">登録商品総数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">在庫切れ</CardTitle>
            <AlertCircle className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{kpis.outOfStock}</div>
            <p className="text-xs text-muted-foreground mt-1">在庫数 0 の商品</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">在庫少</CardTitle>
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{kpis.lowStock}</div>
            <p className="text-xs text-muted-foreground mt-1">最低在庫数以下の商品</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">今月入庫数</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{kpis.thisMonthInbound}</div>
            <p className="text-xs text-muted-foreground mt-1">今月の入庫合計数量</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BarChart: カテゴリ別現在庫数 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カテゴリ別現在庫数</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryStockData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                データがありません
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={categoryStockData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="在庫数" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* PieChart: カテゴリ別商品数 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カテゴリ別商品数</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryCountData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                データがありません
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categoryCountData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {categoryCountData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert Table */}
      {lowStockProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              在庫アラート（在庫切れ・在庫少）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品名</TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead className="text-right">現在庫数</TableHead>
                    <TableHead className="text-right">最低在庫数</TableHead>
                    <TableHead>状態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map((p, i) => {
                    const cur = p[fp.current_stock] as number
                    const min = p[fp.min_stock] as number
                    const isOut = cur === 0
                    return (
                      <TableRow
                        key={i}
                        className={cn(isOut && "bg-red-50 dark:bg-red-950/20")}
                      >
                        <TableCell className="font-medium">{p[fp.name] as string}</TableCell>
                        <TableCell>{(p[fp.category] as string) || "—"}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            isOut ? "text-red-600" : "text-orange-600"
                          )}
                        >
                          {cur}
                        </TableCell>
                        <TableCell className="text-right">{min}</TableCell>
                        <TableCell>
                          {isOut ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              <AlertCircle className="h-3 w-3" /> 在庫切れ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="h-3 w-3" /> 在庫少
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {lowStockProducts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            在庫アラートはありません
          </CardContent>
        </Card>
      )}

      {/* Legend note */}
      <p className="text-xs text-muted-foreground">
        ※ KPI カードの「在庫少」は現在庫数が最低在庫数以下（0 より大きい）の商品数を表示します。「今月入庫数」は区分「{MOVEMENT_TYPE_LABEL[100000000]}」の今月の数量合計です。
      </p>
    </div>
  )
}

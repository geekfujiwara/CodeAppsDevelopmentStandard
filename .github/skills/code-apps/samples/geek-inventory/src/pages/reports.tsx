import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useProducts, useStockMovements } from "@/hooks/use-dataverse"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { MOVEMENT_TYPE_LABEL } from "@/types/dataverse"
import { BarChart3, ShoppingBag } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

// Feature guard component
function DisabledFeatureCard({ title, envVar }: { title: string; envVar: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <BarChart3 className="h-12 w-12 text-muted-foreground opacity-40" />
          </div>
          <div className="text-xl font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground mt-2">
            このページは機能フラグで無効になっています。<br />
            有効にするには <code className="bg-muted px-1 rounded">{envVar}=true</code> を .env に設定してください。
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}

const P = PUBLISHER_PREFIX
const fp = {
  id:            `${P}_productid`,
  name:          `${P}_name`,
  category:      `${P}_category`,
  current_stock: `${P}_current_stock`,
  min_stock:     `${P}_min_stock`,
}
const fm = {
  product_id: `${P}_product_id`,
  type:       `${P}_movement_type`,
  qty:        `${P}_quantity`,
  date:       `${P}_movement_date`,
}

export default function Reports() {
  if (!FEATURE_REPORTS) {
    return <DisabledFeatureCard title="レポート" envVar="VITE_FEATURE_REPORTS" />
  }

  return <ReportsContent />
}

function ReportsContent() {
  const { data: products, isLoading: loadingProducts } = useProducts()
  const { data: movements, isLoading: loadingMovements } = useStockMovements()

  // 1. 在庫状況サマリー（カテゴリ別）
  const categorySummary = useMemo(() => {
    if (!products) return []
    const map: Record<string, { count: number; totalStock: number; outOfStock: number; lowStock: number }> = {}
    for (const p of products) {
      const cat = (p[fp.category] as string) || "未分類"
      if (!map[cat]) map[cat] = { count: 0, totalStock: 0, outOfStock: 0, lowStock: 0 }
      const cur = Number(p[fp.current_stock] ?? 0)
      const min = Number(p[fp.min_stock] ?? 0)
      map[cat].count++
      map[cat].totalStock += cur
      if (cur === 0) map[cat].outOfStock++
      else if (min > 0 && cur <= min) map[cat].lowStock++
    }
    return Object.entries(map).map(([category, v]) => ({ category, ...v }))
  }, [products])

  // 2. 月別入出庫数（過去6ヶ月）
  const monthlyMovements = useMemo(() => {
    if (!movements) return []
    const now = new Date()
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    const map: Record<string, { month: string; inbound: number; outbound: number }> = {}
    for (const m of months) {
      map[m] = { month: m, inbound: 0, outbound: 0 }
    }
    for (const mv of movements) {
      const d = mv[fm.date] as string
      if (!d) continue
      const month = d.substring(0, 7)
      if (!map[month]) continue
      const t = mv[fm.type] as number
      const qty = Number(mv[fm.qty] ?? 0)
      if (t === 100000000) map[month].inbound += qty
      else if (t === 100000001) map[month].outbound += qty
    }
    return months.map((m) => ({
      ...map[m],
      month: m.replace("-", "/"),
    }))
  }, [movements])

  // 3. 商品別入出庫履歴
  const productMovementSummary = useMemo(() => {
    if (!products || !movements) return []
    const map: Record<string, { name: string; inbound: number; outbound: number }> = {}
    for (const p of products) {
      const id = p[fp.id] as string
      map[id] = { name: p[fp.name] as string, inbound: 0, outbound: 0 }
    }
    for (const mv of movements) {
      const pid = (mv[`_${P}_product_id_value`] ?? mv[fm.product_id]) as string
      if (!pid || !map[pid]) continue
      const t = mv[fm.type] as number
      const qty = Number(mv[fm.qty] ?? 0)
      if (t === 100000000) map[pid].inbound += qty
      else if (t === 100000001) map[pid].outbound += qty
    }
    return Object.values(map)
      .filter((v) => v.inbound > 0 || v.outbound > 0)
      .map((v) => ({ ...v, net: v.inbound - v.outbound }))
      .sort((a, b) => (b.inbound + b.outbound) - (a.inbound + a.outbound))
  }, [products, movements])

  if (loadingProducts || loadingMovements) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">レポート</h1>
        <LoadingSkeletonGrid columns={2} count={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">レポート</h1>

      {/* 1. 在庫状況サマリー */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            在庫状況サマリー（カテゴリ別）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead className="text-right">商品数</TableHead>
                  <TableHead className="text-right">総在庫数</TableHead>
                  <TableHead className="text-right">在庫切れ</TableHead>
                  <TableHead className="text-right">在庫少</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorySummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  categorySummary.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{row.totalStock.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className={row.outOfStock > 0 ? "font-bold text-red-600" : ""}>{row.outOfStock}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={row.lowStock > 0 ? "font-bold text-orange-600" : ""}>{row.lowStock}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 2. 月別入出庫数（過去6ヶ月） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            月別入出庫数（過去6ヶ月）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyMovements.every((m) => m.inbound === 0 && m.outbound === 0) ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              データがありません
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyMovements} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="inbound"  name={MOVEMENT_TYPE_LABEL[100000000]} fill="#22c55e" stackId="a" />
                <Bar dataKey="outbound" name={MOVEMENT_TYPE_LABEL[100000001]} fill="#ef4444" stackId="b" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 3. 商品別入出庫履歴 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">商品別入出庫履歴</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品名</TableHead>
                  <TableHead className="text-right">入庫合計</TableHead>
                  <TableHead className="text-right">出庫合計</TableHead>
                  <TableHead className="text-right">純変動</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productMovementSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  productMovementSummary.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right text-green-600 font-semibold">+{row.inbound}</TableCell>
                      <TableCell className="text-right text-red-600 font-semibold">-{row.outbound}</TableCell>
                      <TableCell className={`text-right font-semibold ${row.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {row.net >= 0 ? "+" : ""}{row.net}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

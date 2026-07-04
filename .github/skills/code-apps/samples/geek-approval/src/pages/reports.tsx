import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useApprovalRequests } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { REQUEST_STAGE_LABEL, REQUEST_STAGE_OPTIONS } from "@/types/dataverse"

const BAR_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#14b8a6", "#6b7280"]

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
  const { data: requests = [], isLoading } = useApprovalRequests()
  const P = PUBLISHER_PREFIX
  const f = {
    stage:        `${P}_stage`,
    category:     `${P}_category`,
    department:   `${P}_department`,
    amount:       `${P}_amount`,
    request_date: `${P}_request_date`,
  }

  const stageData = useMemo(() =>
    REQUEST_STAGE_OPTIONS.map((opt) => {
      const items = requests.filter((r) => (r[f.stage] as number) === opt.value)
      return {
        name:  REQUEST_STAGE_LABEL[opt.value as keyof typeof REQUEST_STAGE_LABEL],
        件数:  items.length,
        合計金額: items.reduce((sum, r) => sum + ((r[f.amount] as number) ?? 0), 0),
      }
    }),
    [requests]
  )

  const categoryData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of requests) {
      const cat = (r[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + ((r[f.amount] as number) ?? 0))
    }
    return [...map.entries()]
      .map(([name, 金額]) => ({ name, 金額 }))
      .sort((a, b) => b.金額 - a.金額)
      .slice(0, 10)
  }, [requests])

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of requests) {
      const d = r[f.request_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7) // YYYY-MM
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([month, 件数]) => ({ month, 件数 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [requests])

  const deptData = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const r of requests) {
      const dept = (r[f.department] as string) || "未設定"
      const entry = map.get(dept) ?? { count: 0, total: 0 }
      entry.count++
      entry.total += (r[f.amount] as number) ?? 0
      map.set(dept, entry)
    }
    return [...map.entries()]
      .map(([dept, v]) => ({ dept, ...v, avg: v.count > 0 ? v.total / v.count : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [requests])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">レポート</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">レポート</h1>
        <p className="text-sm text-muted-foreground mt-1">申請統計（クライアント集計）</p>
      </div>

      {/* ステージ別サマリー */}
      <Card>
        <CardHeader><CardTitle className="text-base">承認ステージ別サマリー</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>承認ステージ</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">合計金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stageData.filter((r) => r.件数 > 0).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  stageData.filter((r) => r.件数 > 0).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.件数}</TableCell>
                      <TableCell className="text-right">
                        {row.合計金額 > 0
                          ? row.合計金額.toLocaleString("ja-JP", { style: "currency", currency: "JPY" })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 種別別申請金額 */}
      <Card>
        <CardHeader><CardTitle className="text-base">種別別申請金額（上位10件）</CardTitle></CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [Number(v ?? 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" }), "金額"]} />
                <Bar dataKey="金額" radius={[0, 4, 4, 0]}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 月別申請件数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別申請件数（直近12ヶ月）</CardTitle></CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="件数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 部門別集計 */}
      <Card>
        <CardHeader><CardTitle className="text-base">部門別申請集計</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>部門</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">合計金額</TableHead>
                  <TableHead className="text-right">平均金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deptData.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  deptData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.dept}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">
                        {row.total > 0 ? row.total.toLocaleString("ja-JP", { style: "currency", currency: "JPY" }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.avg > 0 ? row.avg.toLocaleString("ja-JP", { style: "currency", currency: "JPY" }) : "—"}
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

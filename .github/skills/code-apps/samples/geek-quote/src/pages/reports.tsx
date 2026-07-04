import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useQuotes } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_OPTIONS, QUOTE_STATUS_WON } from "@/types/dataverse"

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
  const { data: quotes = [], isLoading } = useQuotes()
  const P = PUBLISHER_PREFIX
  const f = {
    status:     `${P}_status`,
    client:     `${P}_client`,
    total:      `${P}_total`,
    issue_date: `${P}_issue_date`,
  }

  const statusData = useMemo(() =>
    QUOTE_STATUS_OPTIONS.map((opt) => {
      const items = quotes.filter((q) => (q[f.status] as number) === opt.value)
      return {
        name:  QUOTE_STATUS_LABEL[opt.value as keyof typeof QUOTE_STATUS_LABEL],
        件数:  items.length,
        合計金額: items.reduce((sum, q) => sum + ((q[f.total] as number) ?? 0), 0),
      }
    }),
    [quotes]
  )

  const clientData = useMemo(() => {
    const map = new Map<string, number>()
    for (const q of quotes) {
      if ((q[f.status] as number) !== QUOTE_STATUS_WON) continue
      const client = (q[f.client] as string) || "未設定"
      map.set(client, (map.get(client) ?? 0) + ((q[f.total] as number) ?? 0))
    }
    return [...map.entries()]
      .map(([name, 金額]) => ({ name, 金額 }))
      .sort((a, b) => b.金額 - a.金額)
      .slice(0, 10)
  }, [quotes])

  const monthlyData = useMemo(() => {
    const map = new Map<string, { won: number; total: number }>()
    for (const q of quotes) {
      const d = q[f.issue_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7)
      const entry = map.get(key) ?? { won: 0, total: 0 }
      entry.total++
      if ((q[f.status] as number) === QUOTE_STATUS_WON) entry.won++
      map.set(key, entry)
    }
    return [...map.entries()]
      .map(([month, v]) => ({
        month, ...v,
        rate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [quotes])

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
        <p className="text-sm text-muted-foreground mt-1">見積・受注統計（クライアント集計）</p>
      </div>

      {/* ステータス別サマリー */}
      <Card>
        <CardHeader><CardTitle className="text-base">ステータス別サマリー</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">合計金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusData.filter((r) => r.件数 > 0).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  statusData.filter((r) => r.件数 > 0).map((row, idx) => (
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

      {/* 取引先別受注金額 */}
      <Card>
        <CardHeader><CardTitle className="text-base">取引先別受注金額（上位10件）</CardTitle></CardHeader>
        <CardContent>
          {clientData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">受注データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={clientData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `¥${(Number(v) / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [Number(v ?? 0).toLocaleString("ja-JP", { style: "currency", currency: "JPY" }), "金額"]} />
                <Bar dataKey="金額" radius={[0, 4, 4, 0]}>
                  {clientData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 月別受注率 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別受注率（直近12ヶ月）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead className="text-right">見積件数</TableHead>
                  <TableHead className="text-right">受注件数</TableHead>
                  <TableHead className="text-right">受注率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  monthlyData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right">{row.won}</TableCell>
                      <TableCell className="text-right">{row.rate}%</TableCell>
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

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
import { useTickets } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
} from "@/types/dataverse"

const PIE_COLORS = ["#6b7280", "#3b82f6", "#f97316", "#ef4444"]

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
  const { data: tickets = [], isLoading } = useTickets()

  const P = PUBLISHER_PREFIX
  const f = {
    status:   `${P}_status`,
    priority: `${P}_priority`,
    category: `${P}_category`,
    assignee: `${P}_assignee`,
  }

  const statusData = useMemo(() =>
    TICKET_STATUS_OPTIONS.map((opt) => ({
      name:  TICKET_STATUS_LABEL[opt.value as keyof typeof TICKET_STATUS_LABEL],
      count: tickets.filter((t) => (t[f.status] as number) === opt.value).length,
    })),
    [tickets]
  )

  const priorityData = useMemo(() =>
    PRIORITY_OPTIONS.map((opt) => ({
      name:  PRIORITY_LABEL[opt.value as keyof typeof PRIORITY_LABEL],
      value: tickets.filter((t) => (t[f.priority] as number) === opt.value).length,
    })).filter((d) => d.value > 0),
    [tickets]
  )

  const categoryData = useMemo(() => {
    const map = new Map<string, { total: number; open: number; resolved: number }>()
    for (const t of tickets) {
      const cat = (t[f.category] as string) || "未分類"
      const status = t[f.status] as number
      const entry = map.get(cat) ?? { total: 0, open: 0, resolved: 0 }
      entry.total++
      if (status === 100000003 || status === 100000004) entry.resolved++
      else entry.open++
      map.set(cat, entry)
    }
    return [...map.entries()]
      .map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [tickets])

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
        <p className="text-sm text-muted-foreground mt-1">チケット統計（クライアント集計）</p>
      </div>

      {/* ステータス別棒グラフ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ステータス別チケット数</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v} 件`, "件数"]} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 優先度別円グラフ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">優先度別チケット数</CardTitle>
        </CardHeader>
        <CardContent>
          {priorityData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={priorityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {priorityData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip formatter={(v) => [`${v} 件`, "件数"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* カテゴリ別一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">カテゴリ別チケット数</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead className="text-right">総件数</TableHead>
                  <TableHead className="text-right">未解決</TableHead>
                  <TableHead className="text-right">解決済み</TableHead>
                  <TableHead className="text-right">解決率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  categoryData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.cat}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right">{row.open}</TableCell>
                      <TableCell className="text-right">{row.resolved}</TableCell>
                      <TableCell className="text-right">
                        {row.total > 0
                          ? `${((row.resolved / row.total) * 100).toFixed(0)}%`
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
    </div>
  )
}

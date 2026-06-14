import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useContracts } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_OPTIONS, CONTRACT_TYPE_LABEL, CONTRACT_TYPE_OPTIONS } from "@/types/dataverse"

const STATUS_COLORS = ["#22c55e", "#ef4444", "#eab308", "#6b7280", "#3b82f6"]

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
  const { data: contracts = [], isLoading } = useContracts()
  const P = PUBLISHER_PREFIX
  const f = {
    type:   `${P}_contract_type`,
    status: `${P}_status`,
    value:  `${P}_value`,
    end:    `${P}_end_date`,
    auto:   `${P}_auto_renewal`,
  }

  const statusData = useMemo(() =>
    CONTRACT_STATUS_OPTIONS.map((opt) => ({
      name:  CONTRACT_STATUS_LABEL[opt.value as keyof typeof CONTRACT_STATUS_LABEL],
      count: contracts.filter((c) => (c[f.status] as number) === opt.value).length,
    })),
    [contracts]
  )

  const typeData = useMemo(() =>
    CONTRACT_TYPE_OPTIONS.map((opt) => ({
      name:  CONTRACT_TYPE_LABEL[opt.value as keyof typeof CONTRACT_TYPE_LABEL],
      件数: contracts.filter((c) => (c[f.type] as number) === opt.value).length,
      総契約金額: contracts
        .filter((c) => (c[f.type] as number) === opt.value)
        .reduce((sum, c) => sum + ((c[f.value] as number) ?? 0), 0),
      有効: contracts.filter((c) => (c[f.type] as number) === opt.value && (c[f.status] as number) === 100000000).length,
      期限切れ: contracts.filter((c) => (c[f.type] as number) === opt.value && (c[f.status] as number) === 100000001).length,
    })),
    [contracts]
  )

  const now = new Date()
  const monthlyData = useMemo(() => {
    const months: { month: string; 期限切れ: number; 自動更新あり: number; 自動更新なし: number }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`
      const inMonth = contracts.filter((c) => {
        const end = c[f.end] as string
        if (!end) return false
        const ed = new Date(end)
        return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth() && (c[f.status] as number) === 100000000
      })
      months.push({
        month: label,
        期限切れ: inMonth.length,
        自動更新あり: inMonth.filter((c) => (c[f.auto] as number) === 100000000).length,
        自動更新なし: inMonth.filter((c) => (c[f.auto] as number) === 100000001).length,
      })
    }
    return months
  }, [contracts])

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
        <p className="text-sm text-muted-foreground mt-1">契約統計（クライアント集計）</p>
      </div>

      {/* 契約種別別サマリー */}
      <Card>
        <CardHeader><CardTitle className="text-base">契約種別別サマリー</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>種別</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">有効</TableHead>
                  <TableHead className="text-right">期限切れ</TableHead>
                  <TableHead className="text-right">総契約金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeData.filter((r) => r.件数 > 0).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  typeData.filter((r) => r.件数 > 0).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.件数}</TableCell>
                      <TableCell className="text-right">{row.有効}</TableCell>
                      <TableCell className="text-right">{row.期限切れ}</TableCell>
                      <TableCell className="text-right">
                        {row.総契約金額 > 0
                          ? `¥${row.総契約金額.toLocaleString()}`
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

      {/* ステータス別件数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">ステータス別件数</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v} 件`, "件数"]} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {statusData.map((_, i) => (
                  <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 今後12ヶ月の期限一覧 */}
      <Card>
        <CardHeader><CardTitle className="text-base">今後12ヶ月の期限一覧</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>年月</TableHead>
                  <TableHead className="text-right">期限件数</TableHead>
                  <TableHead className="text-right">自動更新あり</TableHead>
                  <TableHead className="text-right">自動更新なし</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.filter((r) => r.期限切れ > 0).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">今後12ヶ月に期限切れの契約はありません</TableCell></TableRow>
                ) : (
                  monthlyData.filter((r) => r.期限切れ > 0).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right font-medium">{row.期限切れ}</TableCell>
                      <TableCell className="text-right text-green-700">{row.自動更新あり}</TableCell>
                      <TableCell className="text-right text-red-700">{row.自動更新なし}</TableCell>
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

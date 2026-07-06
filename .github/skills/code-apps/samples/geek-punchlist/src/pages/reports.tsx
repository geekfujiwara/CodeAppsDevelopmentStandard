import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useSites, usePunchItems } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  ITEM_STATUS_LABEL,
  ITEM_STATUS_OPTIONS,
  ITEM_VERIFIED,
} from "@/types/dataverse"

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
  const { data: items = [], isLoading } = usePunchItems()
  const { data: sites = [] } = useSites()
  const P = PUBLISHER_PREFIX
  const f = {
    site_ref:   `${P}_site_ref`,
    contractor: `${P}_contractor`,
    status:     `${P}_status`,
    due_date:   `${P}_due_date`,
  }
  const st = {
    id:   `${P}_siteid`,
    name: `${P}_name`,
  }

  const today = new Date().toISOString().slice(0, 10)

  /** 業者別未完了件数（期限超過を含む） */
  const contractorData = useMemo(() => {
    const map = new Map<string, { open: number; overdue: number }>()
    for (const r of items) {
      if ((r[f.status] as number) === ITEM_VERIFIED) continue
      const contractor = (r[f.contractor] as string) || "未設定"
      const entry = map.get(contractor) ?? { open: 0, overdue: 0 }
      entry.open++
      if (!!r[f.due_date] && String(r[f.due_date]) < today) entry.overdue++
      map.set(contractor, entry)
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, 未完了: v.open, overdue: v.overdue }))
      .sort((a, b) => b.未完了 - a.未完了)
      .slice(0, 10)
  }, [items, today])

  /** ステータスサマリー */
  const statusData = useMemo(() =>
    ITEM_STATUS_OPTIONS.map(opt => ({
      name: ITEM_STATUS_LABEL[opt.value as keyof typeof ITEM_STATUS_LABEL],
      件数: items.filter(r => (r[f.status] as number) === opt.value).length,
    })),
    [items]
  )

  /** 現場別完了率 */
  const siteData = useMemo(() => {
    const map = new Map<string, { total: number; verified: number; overdue: number }>()
    for (const r of items) {
      const siteId = String(r[f.site_ref] ?? "")
      const entry = map.get(siteId) ?? { total: 0, verified: 0, overdue: 0 }
      entry.total++
      if ((r[f.status] as number) === ITEM_VERIFIED) entry.verified++
      else if (!!r[f.due_date] && String(r[f.due_date]) < today) entry.overdue++
      map.set(siteId, entry)
    }
    return [...map.entries()]
      .map(([siteId, v]) => {
        const site = sites.find(s => String(s[st.id] ?? "") === siteId)
        return {
          name: site ? String(site[st.name] ?? "") : "（現場未設定）",
          ...v,
          rate: v.total > 0 ? Math.round((v.verified / v.total) * 100) : 0,
        }
      })
      .sort((a, b) => a.rate - b.rate)
  }, [items, sites, today])

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
        <p className="text-sm text-muted-foreground mt-1">是正状況の統計（クライアント集計）</p>
      </div>

      {/* 業者別未完了件数 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">業者別未完了件数（上位10件）</CardTitle>
          <CardDescription>赤 = 期限超過を含む業者</CardDescription>
        </CardHeader>
        <CardContent>
          {contractorData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">未完了の指摘がありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={contractorData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="未完了" radius={[0, 4, 4, 0]}>
                  {contractorData.map((row, idx) => (
                    <Cell key={idx} fill={row.overdue > 0 ? "#ef4444" : BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ステータスサマリー */}
      <Card>
        <CardHeader><CardTitle className="text-base">ステータスサマリー</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusData.every(row => row.件数 === 0) ? (
                  <TableRow><TableCell colSpan={2} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  statusData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.件数}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 現場別完了率 */}
      <Card>
        <CardHeader><CardTitle className="text-base">現場別完了率（低い順）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>現場</TableHead>
                  <TableHead className="text-right">指摘数</TableHead>
                  <TableHead className="text-right">確認済</TableHead>
                  <TableHead className="text-right">期限超過</TableHead>
                  <TableHead className="text-right">完了率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteData.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  siteData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium max-w-[240px] truncate">{row.name}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right">{row.verified}</TableCell>
                      <TableCell className={`text-right ${row.overdue > 0 ? "font-semibold text-rose-600" : ""}`}>
                        {row.overdue}
                      </TableCell>
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

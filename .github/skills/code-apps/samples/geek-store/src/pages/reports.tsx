import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useStores, useAudits, useAuditItems } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { AUDIT_COMPLETED, RESULT_PASS, RESULT_FAIL } from "@/types/dataverse"

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
  const { data: audits = [], isLoading } = useAudits()
  const { data: stores = [] } = useStores()
  const { data: items = [] } = useAuditItems()
  const P = PUBLISHER_PREFIX
  const a = {
    id:         `${P}_store_auditid`,
    store_ref:  `${P}_store_ref`,
    status:     `${P}_status`,
    audit_date: `${P}_audit_date`,
    score:      `${P}_score`,
  }
  const st = {
    id:   `${P}_storeid`,
    name: `${P}_name`,
  }
  const it = {
    audit_ref: `${P}_audit_ref`,
    category:  `${P}_category`,
    result:    `${P}_result`,
  }

  /** 店舗別平均スコア（完了した臨店のみ） */
  const storeScoreData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>()
    for (const audit of audits) {
      if ((audit[a.status] as number) !== AUDIT_COMPLETED || audit[a.score] == null) continue
      const storeId = String(audit[a.store_ref] ?? "")
      const entry = map.get(storeId) ?? { sum: 0, count: 0 }
      entry.sum += (audit[a.score] as number) ?? 0
      entry.count++
      map.set(storeId, entry)
    }
    return [...map.entries()]
      .map(([storeId, v]) => {
        const store = stores.find(s => String(s[st.id] ?? "") === storeId)
        return {
          name: store ? String(store[st.name] ?? "") : "（不明）",
          平均スコア: v.count > 0 ? Math.round(v.sum / v.count) : 0,
          count: v.count,
        }
      })
      .sort((x, y) => x.平均スコア - y.平均スコア)
      .slice(0, 10)
  }, [audits, stores])

  /** カテゴリ別不合格率 */
  const categoryFailData = useMemo(() => {
    const map = new Map<string, { pass: number; fail: number }>()
    for (const item of items) {
      const result = item[it.result] as number
      if (result !== RESULT_PASS && result !== RESULT_FAIL) continue
      const cat = (item[it.category] as string) || "その他"
      const entry = map.get(cat) ?? { pass: 0, fail: 0 }
      if (result === RESULT_PASS) entry.pass++
      else entry.fail++
      map.set(cat, entry)
    }
    return [...map.entries()]
      .map(([category, v]) => ({
        category, ...v,
        total: v.pass + v.fail,
        failRate: v.pass + v.fail > 0 ? Math.round((v.fail / (v.pass + v.fail)) * 100) : 0,
      }))
      .sort((x, y) => y.failRate - x.failRate)
  }, [items])

  /** 月別臨店数 */
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const audit of audits) {
      const d = audit[a.audit_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([month, 件数]) => ({ month, 件数 }))
      .sort((x, y) => x.month.localeCompare(y.month))
      .slice(-12)
  }, [audits])

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
        <p className="text-sm text-muted-foreground mt-1">臨店チェック統計（クライアント集計）</p>
      </div>

      {/* 店舗別平均スコア */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">店舗別平均スコア（低い順・上位10件）</CardTitle>
          <CardDescription>完了した臨店チェックのみ集計。スコアの低い店舗から改善に着手する</CardDescription>
        </CardHeader>
        <CardContent>
          {storeScoreData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">完了した臨店チェックがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={storeScoreData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="平均スコア" radius={[0, 4, 4, 0]}>
                  {storeScoreData.map((row, idx) => (
                    <Cell key={idx} fill={row.平均スコア < 70 ? "#ef4444" : BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* カテゴリ別不合格率 */}
      <Card>
        <CardHeader><CardTitle className="text-base">カテゴリ別不合格率</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead className="text-right">判定数</TableHead>
                  <TableHead className="text-right">不合格</TableHead>
                  <TableHead className="text-right">不合格率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryFailData.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">判定済みの項目がありません</TableCell></TableRow>
                ) : (
                  categoryFailData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right">{row.fail}</TableCell>
                      <TableCell className={`text-right ${row.failRate >= 30 ? "font-semibold text-rose-600" : ""}`}>
                        {row.failRate}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 月別臨店数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別臨店数（直近12ヶ月）</CardTitle></CardHeader>
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
    </div>
  )
}

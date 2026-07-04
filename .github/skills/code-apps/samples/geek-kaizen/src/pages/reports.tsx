import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useSuggestions } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  STATUS_ADOPTED,
  STATUS_IMPLEMENTED,
  STATUS_DECLINED,
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
  const { data: suggestions = [], isLoading } = useSuggestions()
  const P = PUBLISHER_PREFIX
  const f = {
    category:      `${P}_category`,
    department:    `${P}_department`,
    status:        `${P}_status`,
    proposed_date: `${P}_proposed_date`,
  }

  const categoryData = useMemo(() => {
    const map = new Map<string, { total: number; adopted: number; declined: number }>()
    for (const s of suggestions) {
      const cat = (s[f.category] as string) || "未分類"
      const entry = map.get(cat) ?? { total: 0, adopted: 0, declined: 0 }
      entry.total++
      const st = s[f.status] as number
      if ([STATUS_ADOPTED, STATUS_IMPLEMENTED].includes(st)) entry.adopted++
      if (st === STATUS_DECLINED) entry.declined++
      map.set(cat, entry)
    }
    return [...map.entries()]
      .map(([category, v]) => ({
        category, ...v,
        rate: v.adopted + v.declined > 0 ? Math.round((v.adopted / (v.adopted + v.declined)) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [suggestions])

  const deptData = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of suggestions) {
      const dept = (s[f.department] as string) || "未設定"
      map.set(dept, (map.get(dept) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, 件数]) => ({ name, 件数 }))
      .sort((a, b) => b.件数 - a.件数)
      .slice(0, 10)
  }, [suggestions])

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of suggestions) {
      const d = s[f.proposed_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([month, 件数]) => ({ month, 件数 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [suggestions])

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
        <p className="text-sm text-muted-foreground mt-1">改善提案統計（クライアント集計）</p>
      </div>

      {/* 分野別採用率 */}
      <Card>
        <CardHeader><CardTitle className="text-base">分野別採用率</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分野</TableHead>
                  <TableHead className="text-right">提案数</TableHead>
                  <TableHead className="text-right">採用（実施含む）</TableHead>
                  <TableHead className="text-right">見送り</TableHead>
                  <TableHead className="text-right">採用率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryData.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  categoryData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right">{row.adopted}</TableCell>
                      <TableCell className="text-right">{row.declined}</TableCell>
                      <TableCell className="text-right">{row.rate}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 部門別提案数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">部門別提案数（上位10件）</CardTitle></CardHeader>
        <CardContent>
          {deptData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="件数" radius={[0, 4, 4, 0]}>
                  {deptData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 月別提案数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別提案数（直近12ヶ月）</CardTitle></CardHeader>
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

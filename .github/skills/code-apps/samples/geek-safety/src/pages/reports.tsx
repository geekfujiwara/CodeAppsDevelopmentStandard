import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useIncidents } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { SEVERITY_LABEL, SEVERITY_OPTIONS, SEVERITY_SERIOUS, INCIDENT_STATUS_RESOLVED } from "@/types/dataverse"

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
  const { data: incidents = [], isLoading } = useIncidents()
  const P = PUBLISHER_PREFIX
  const f = {
    site:          `${P}_site`,
    category:      `${P}_category`,
    severity:      `${P}_severity`,
    status:        `${P}_status`,
    occurred_date: `${P}_occurred_date`,
  }

  const severityData = useMemo(() =>
    SEVERITY_OPTIONS.map((opt) => {
      const items = incidents.filter((r) => (r[f.severity] as number) === opt.value)
      const resolved = items.filter((r) => (r[f.status] as number) === INCIDENT_STATUS_RESOLVED).length
      return {
        name:  SEVERITY_LABEL[opt.value as keyof typeof SEVERITY_LABEL],
        件数:  items.length,
        是正完了: resolved,
      }
    }),
    [incidents]
  )

  const siteData = useMemo(() => {
    const map = new Map<string, { count: number; serious: number; open: number }>()
    for (const r of incidents) {
      const site = (r[f.site] as string) || "未設定"
      const entry = map.get(site) ?? { count: 0, serious: 0, open: 0 }
      entry.count++
      if (SEVERITY_SERIOUS.includes(r[f.severity] as number)) entry.serious++
      if ((r[f.status] as number) !== INCIDENT_STATUS_RESOLVED) entry.open++
      map.set(site, entry)
    }
    return [...map.entries()]
      .map(([site, v]) => ({ site, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [incidents])

  const categoryData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of incidents) {
      const cat = (r[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, 件数]) => ({ name, 件数 }))
      .sort((a, b) => b.件数 - a.件数)
      .slice(0, 10)
  }, [incidents])

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of incidents) {
      const d = r[f.occurred_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([month, 件数]) => ({ month, 件数 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [incidents])

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
        <p className="text-sm text-muted-foreground mt-1">安全衛生統計（クライアント集計）</p>
      </div>

      {/* 重大度別サマリー */}
      <Card>
        <CardHeader><CardTitle className="text-base">重大度別サマリー</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>重大度</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">是正完了</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {severityData.filter((r) => r.件数 > 0).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  severityData.filter((r) => r.件数 > 0).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.件数}</TableCell>
                      <TableCell className="text-right">{row.是正完了}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 種別別報告件数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">種別別報告件数（上位10件）</CardTitle></CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="件数" radius={[0, 4, 4, 0]}>
                  {categoryData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 月別報告件数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別報告件数（直近12ヶ月）</CardTitle></CardHeader>
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

      {/* 拠点別集計 */}
      <Card>
        <CardHeader><CardTitle className="text-base">拠点別集計</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>拠点・場所</TableHead>
                  <TableHead className="text-right">報告件数</TableHead>
                  <TableHead className="text-right">重大案件</TableHead>
                  <TableHead className="text-right">未解決</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteData.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  siteData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.site}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{row.serious}</TableCell>
                      <TableCell className="text-right">{row.open}</TableCell>
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

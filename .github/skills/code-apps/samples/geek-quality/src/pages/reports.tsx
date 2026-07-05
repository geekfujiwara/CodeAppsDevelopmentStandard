import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { ParetoChart } from "@/components/pareto-chart"
import { useInspections, useDefects } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS, YIELD_WARNING_THRESHOLD } from "@/config"
import {
  INSPECTION_COMPLETED,
  DISPOSITION_LABEL,
  DISPOSITION_OPTIONS,
  computeYield,
} from "@/types/dataverse"

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
  const { data: inspections = [], isLoading } = useInspections()
  const { data: defects = [] } = useDefects()
  const P = PUBLISHER_PREFIX
  const f = {
    line:            `${P}_line`,
    status:          `${P}_status`,
    inspection_date: `${P}_inspection_date`,
    inspected_qty:   `${P}_inspected_qty`,
    defect_qty:      `${P}_defect_qty`,
  }
  const d = {
    category:    `${P}_category`,
    qty:         `${P}_qty`,
    disposition: `${P}_disposition`,
  }

  /** 不良分類パレート（全期間） */
  const paretoEntries = useMemo(() => {
    const map = new Map<string, number>()
    for (const defect of defects) {
      const cat = (defect[d.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + ((defect[d.qty] as number) ?? 0))
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [defects])

  /** ライン別集計（完了検査） */
  const lineData = useMemo(() => {
    const map = new Map<string, { count: number; inspected: number; defect: number }>()
    for (const r of inspections) {
      if ((r[f.status] as number) !== INSPECTION_COMPLETED) continue
      const line = (r[f.line] as string) || "未設定"
      const entry = map.get(line) ?? { count: 0, inspected: 0, defect: 0 }
      entry.count++
      entry.inspected += (r[f.inspected_qty] as number) ?? 0
      entry.defect += (r[f.defect_qty] as number) ?? 0
      map.set(line, entry)
    }
    return [...map.entries()]
      .map(([line, v]) => ({ line, ...v, yield: computeYield(v.inspected, v.defect) }))
      .sort((a, b) => (a.yield ?? 100) - (b.yield ?? 100))
  }, [inspections])

  /** 処置別集計 */
  const dispositionData = useMemo(() =>
    DISPOSITION_OPTIONS.map(opt => ({
      name: DISPOSITION_LABEL[opt.value as keyof typeof DISPOSITION_LABEL],
      数量: defects
        .filter(x => (x[d.disposition] as number) === opt.value)
        .reduce((sum, x) => sum + ((x[d.qty] as number) ?? 0), 0),
    })),
    [defects]
  )

  /** 月別不良率（完了検査、Σ不良 / Σ検査数） */
  const monthlyData = useMemo(() => {
    const map = new Map<string, { inspected: number; defect: number }>()
    for (const r of inspections) {
      if ((r[f.status] as number) !== INSPECTION_COMPLETED) continue
      const dt = r[f.inspection_date] as string | undefined
      if (!dt) continue
      const key = dt.slice(0, 7)
      const entry = map.get(key) ?? { inspected: 0, defect: 0 }
      entry.inspected += (r[f.inspected_qty] as number) ?? 0
      entry.defect += (r[f.defect_qty] as number) ?? 0
      map.set(key, entry)
    }
    return [...map.entries()]
      .map(([month, v]) => ({
        month,
        不良率: v.inspected > 0 ? Math.round((v.defect / v.inspected) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [inspections])

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
        <p className="text-sm text-muted-foreground mt-1">品質統計（クライアント集計）</p>
      </div>

      {/* 不良分類パレート図 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">不良分類パレート図（全期間）</CardTitle>
          <CardDescription>赤 = 累積 80% までの重点対策対象</CardDescription>
        </CardHeader>
        <CardContent>
          <ParetoChart entries={paretoEntries} barName="不良数量" height={300} />
        </CardContent>
      </Card>

      {/* ライン別集計 */}
      <Card>
        <CardHeader><CardTitle className="text-base">ライン別集計（完了検査）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ライン</TableHead>
                  <TableHead className="text-right">検査回数</TableHead>
                  <TableHead className="text-right">検査数</TableHead>
                  <TableHead className="text-right">不良数</TableHead>
                  <TableHead className="text-right">歩留まり</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineData.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">完了した検査がありません</TableCell></TableRow>
                ) : (
                  lineData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.line}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{row.inspected}</TableCell>
                      <TableCell className="text-right">{row.defect}</TableCell>
                      <TableCell className={`text-right ${row.yield != null && row.yield < YIELD_WARNING_THRESHOLD ? "font-semibold text-rose-600" : ""}`}>
                        {row.yield != null ? `${row.yield}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 処置別集計 */}
      <Card>
        <CardHeader><CardTitle className="text-base">処置別不良数量</CardTitle></CardHeader>
        <CardContent>
          {dispositionData.every(row => row.数量 === 0) ? (
            <p className="text-center text-muted-foreground py-8">処置が記録された不良がありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dispositionData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="数量" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 月別不良率 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別不良率（直近12ヶ月・完了検査）</CardTitle></CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v}%`, "不良率"]} />
                <Bar dataKey="不良率" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useEvents, useRegistrations } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  REGISTRATION_ATTENDED,
  REGISTRATION_CANCELLED,
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
  const { data: events = [], isLoading } = useEvents()
  const { data: registrations = [] } = useRegistrations()
  const P = PUBLISHER_PREFIX
  const f = {
    id:         `${P}_eventid`,
    name:       `${P}_name`,
    category:   `${P}_category`,
    start_date: `${P}_start_date`,
    capacity:   `${P}_capacity`,
  }
  const r = {
    event_ref: `${P}_event_ref`,
    status:    `${P}_status`,
  }

  /** イベントID → { 有効登録数, 出席数 } */
  const regByEvent = useMemo(() => {
    const map = new Map<string, { active: number; attended: number }>()
    for (const reg of registrations) {
      if ((reg[r.status] as number) === REGISTRATION_CANCELLED) continue
      const eventId = String(reg[r.event_ref] ?? "")
      const entry = map.get(eventId) ?? { active: 0, attended: 0 }
      entry.active++
      if ((reg[r.status] as number) === REGISTRATION_ATTENDED) entry.attended++
      map.set(eventId, entry)
    }
    return map
  }, [registrations])

  const categoryData = useMemo(() => {
    const map = new Map<string, { count: number; regs: number }>()
    for (const ev of events) {
      const cat = (ev[f.category] as string) || "未分類"
      const entry = map.get(cat) ?? { count: 0, regs: 0 }
      entry.count++
      entry.regs += regByEvent.get(String(ev[f.id] ?? ""))?.active ?? 0
      map.set(cat, entry)
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [events, regByEvent])

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const ev of events) {
      const d = ev[f.start_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([month, 件数]) => ({ month, 件数 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [events])

  const attendanceData = useMemo(() => {
    return events
      .map(ev => {
        const stats = regByEvent.get(String(ev[f.id] ?? "")) ?? { active: 0, attended: 0 }
        return {
          name: String(ev[f.name] ?? ""),
          date: String(ev[f.start_date] ?? ""),
          capacity: (ev[f.capacity] as number) ?? 0,
          ...stats,
          rate: stats.active > 0 ? Math.round((stats.attended / stats.active) * 100) : 0,
        }
      })
      .filter(row => row.active > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
  }, [events, regByEvent])

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
        <p className="text-sm text-muted-foreground mt-1">イベント統計（クライアント集計）</p>
      </div>

      {/* 分野別サマリー */}
      <Card>
        <CardHeader><CardTitle className="text-base">分野別サマリー</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分野</TableHead>
                  <TableHead className="text-right">開催数</TableHead>
                  <TableHead className="text-right">参加登録（有効）</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryData.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  categoryData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{row.regs}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 月別開催数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別開催数（直近12ヶ月）</CardTitle></CardHeader>
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
                <Bar dataKey="件数" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* イベント別出席率 */}
      <Card>
        <CardHeader><CardTitle className="text-base">イベント別出席率（直近10件）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>イベント</TableHead>
                  <TableHead>開催日</TableHead>
                  <TableHead className="text-right">定員</TableHead>
                  <TableHead className="text-right">登録</TableHead>
                  <TableHead className="text-right">出席</TableHead>
                  <TableHead className="text-right">出席率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceData.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">参加登録のあるイベントがありません</TableCell></TableRow>
                ) : (
                  attendanceData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium max-w-[240px] truncate">{row.name}</TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell className="text-right">{row.capacity > 0 ? row.capacity : "—"}</TableCell>
                      <TableCell className="text-right">{row.active}</TableCell>
                      <TableCell className="text-right">{row.attended}</TableCell>
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

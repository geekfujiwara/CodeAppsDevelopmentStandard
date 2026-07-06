import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useCheckpoints, useMeasurements } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import { TIME_SLOT_LABEL, TIME_SLOT_ORDER } from "@/types/dataverse"
import { judgeThreshold } from "@/lib/threshold"
import { cn } from "@/lib/utils"

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
  const { data: measurements = [], isLoading } = useMeasurements()
  const { data: checkpoints = [] } = useCheckpoints()
  const P = PUBLISHER_PREFIX
  const f = {
    checkpoint_ref: `${P}_checkpoint_ref`,
    value:          `${P}_value`,
    time_slot:      `${P}_time_slot`,
  }
  const c = {
    id:   `${P}_checkpointid`,
    name: `${P}_name`,
    min:  `${P}_min_value`,
    max:  `${P}_max_value`,
  }

  const checkpointMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const cp of checkpoints) map.set(String(cp[c.id] ?? ""), cp)
    return map
  }, [checkpoints])

  const judge = (m: Record<string, unknown>) => {
    const cp = checkpointMap.get(String(m[f.checkpoint_ref] ?? ""))
    return judgeThreshold(m[f.value] as number | null, (cp?.[c.min] as number | null) ?? null, (cp?.[c.max] as number | null) ?? null)
  }

  /** 項目別 適合率 */
  const itemData = useMemo(() => {
    const map = new Map<string, { total: number; deviated: number }>()
    for (const m of measurements) {
      const cpId = String(m[f.checkpoint_ref] ?? "")
      const entry = map.get(cpId) ?? { total: 0, deviated: 0 }
      entry.total++
      if (judge(m).deviated) entry.deviated++
      map.set(cpId, entry)
    }
    return [...map.entries()]
      .map(([cpId, v]) => ({
        name: String(checkpointMap.get(cpId)?.[c.name] ?? "（削除済み）"),
        total: v.total,
        deviated: v.deviated,
        rate: v.total > 0 ? Math.round(((v.total - v.deviated) / v.total) * 100) : 0,
      }))
      .sort((a, b) => a.rate - b.rate)
  }, [measurements, checkpointMap])

  /** 項目 × 時間帯 の逸脱数マトリクス */
  const matrix = useMemo(() => {
    const rowIds = [...new Set(measurements.map(m => String(m[f.checkpoint_ref] ?? "")))]
    const cell = new Map<string, { total: number; deviated: number }>()
    let maxDev = 0
    for (const m of measurements) {
      const key = `${String(m[f.checkpoint_ref] ?? "")}__${m[f.time_slot] ?? ""}`
      const e = cell.get(key) ?? { total: 0, deviated: 0 }
      e.total++
      if (judge(m).deviated) e.deviated++
      cell.set(key, e)
      if (e.deviated > maxDev) maxDev = e.deviated
    }
    const rows = rowIds
      .map(id => ({ id, name: String(checkpointMap.get(id)?.[c.name] ?? "（削除済み）") }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    return { rows, cell, maxDev }
  }, [measurements, checkpointMap])

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
        <p className="text-sm text-muted-foreground mt-1">衛生管理統計（クライアント集計）</p>
      </div>

      {/* 項目別適合率 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">点検項目別 適合率（低い順）</CardTitle>
          <CardDescription>適合率の低い項目から管理体制を見直す</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>点検項目</TableHead>
                  <TableHead className="text-right">測定数</TableHead>
                  <TableHead className="text-right">逸脱数</TableHead>
                  <TableHead className="text-right">適合率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemData.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">測定記録がありません</TableCell></TableRow>
                ) : (
                  itemData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className={`text-right ${row.deviated > 0 ? "font-semibold text-rose-600" : ""}`}>
                        {row.deviated}
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

      {/* 項目 × 時間帯 逸脱ヒートマップ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">項目 × 時間帯 逸脱ヒートマップ</CardTitle>
          <CardDescription>セルの数字は逸脱件数。色が濃いほど逸脱が集中（時間帯の傾向を把握）</CardDescription>
        </CardHeader>
        <CardContent>
          {matrix.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">測定記録がありません</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">点検項目</th>
                    {TIME_SLOT_ORDER.map(ts => (
                      <th key={ts} className="whitespace-nowrap px-3 py-2 text-center font-medium text-muted-foreground">
                        {TIME_SLOT_LABEL[ts as keyof typeof TIME_SLOT_LABEL]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map(row => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{row.name}</td>
                      {TIME_SLOT_ORDER.map(ts => {
                        const e = matrix.cell.get(`${row.id}__${ts}`) ?? { total: 0, deviated: 0 }
                        const ratio = matrix.maxDev > 0 ? e.deviated / matrix.maxDev : 0
                        const style = e.deviated > 0
                          ? { backgroundColor: `rgba(239, 68, 68, ${0.15 + 0.55 * ratio})` } : undefined
                        return (
                          <td key={ts} className={cn("px-3 py-2 text-center tabular-nums", e.total === 0 && "text-muted-foreground/40")} style={style}>
                            {e.total === 0 ? "·" : e.deviated > 0 ? `${e.deviated}/${e.total}` : `0/${e.total}`}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

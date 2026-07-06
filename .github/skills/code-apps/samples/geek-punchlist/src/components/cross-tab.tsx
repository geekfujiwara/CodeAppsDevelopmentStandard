import { useMemo } from "react"
import { cn } from "@/lib/utils"

/**
 * クロス集計マトリクス（ピボット表）。
 * entries（行キー×列キーの組）を件数集計し、値の大きさに応じたヒート色で表示する。
 * 行・列は出現キーから自動生成し、合計行・合計列を付ける。
 */
export function CrossTab({ entries, rowHeader = "行", heatColor = "59,130,246", emptyText = "データがありません" }: {
  entries: { row: string; col: string }[]
  rowHeader?: string
  /** ヒート色の RGB（"r,g,b" 形式）。値の比率で透明度を変える */
  heatColor?: string
  emptyText?: string
}) {
  const { rows, cols, counts, rowTotals, colTotals, max, total } = useMemo(() => {
    // 行キー・列キーに任意の文字列（空白含む）を許容するため、複合キーではなく二重 Map で集計する
    const counts = new Map<string, Map<string, number>>()
    const colSet = new Set<string>()
    for (const e of entries) {
      colSet.add(e.col)
      const rowMap = counts.get(e.row) ?? new Map<string, number>()
      rowMap.set(e.col, (rowMap.get(e.col) ?? 0) + 1)
      counts.set(e.row, rowMap)
    }
    const rows = [...counts.keys()].sort((a, b) => a.localeCompare(b, "ja"))
    const cols = [...colSet].sort((a, b) => a.localeCompare(b, "ja"))
    const rowTotals = new Map<string, number>()
    const colTotals = new Map<string, number>()
    let max = 0
    for (const [row, rowMap] of counts) {
      for (const [col, v] of rowMap) {
        rowTotals.set(row, (rowTotals.get(row) ?? 0) + v)
        colTotals.set(col, (colTotals.get(col) ?? 0) + v)
        if (v > max) max = v
      }
    }
    return { rows, cols, counts, rowTotals, colTotals, max, total: entries.length }
  }, [entries])

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }

  const cellStyle = (value: number) => {
    if (value === 0 || max === 0) return undefined
    const ratio = value / max
    return { backgroundColor: `rgba(${heatColor}, ${0.12 + 0.58 * ratio})` }
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">{rowHeader}</th>
            {cols.map(c => (
              <th key={c} className="whitespace-nowrap px-3 py-2 text-center font-medium text-muted-foreground">{c}</th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-muted-foreground">合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r} className="border-b last:border-b-0">
              <td className="whitespace-nowrap px-3 py-2 font-medium">{r}</td>
              {cols.map(c => {
                const v = counts.get(r)?.get(c) ?? 0
                const ratio = max > 0 ? v / max : 0
                return (
                  <td
                    key={c}
                    className={cn("px-3 py-2 text-center tabular-nums", v === 0 && "text-muted-foreground/40", ratio > 0.6 && "font-semibold")}
                    style={cellStyle(v)}
                  >
                    {v > 0 ? v : "·"}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-center font-semibold tabular-nums bg-muted/30">{rowTotals.get(r) ?? 0}</td>
            </tr>
          ))}
          {/* 合計行 */}
          <tr className="border-t bg-muted/30">
            <td className="px-3 py-2 font-semibold">合計</td>
            {cols.map(c => (
              <td key={c} className="px-3 py-2 text-center font-semibold tabular-nums">{colTotals.get(c) ?? 0}</td>
            ))}
            <td className="px-3 py-2 text-center font-bold tabular-nums">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

import { useMemo } from "react"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts"
import { toParetoData } from "@/lib/pareto"

/**
 * パレート図（棒: 件数/数量の降順、折れ線: 累積構成比 %）。
 * 「上位の少数分類が全体の大半を占める」を可視化し、対策の優先順位付けに使う。
 * 80% の水平線（ReferenceLine）で重点管理の目安を示す。
 */
export function ParetoChart({ entries, height = 260, barName = "件数", topBarColor = "#ef4444", barColor = "#3b82f6" }: {
  entries: { name: string; value: number }[]
  height?: number
  barName?: string
  /** 累積 80% までの分類（重点対策対象）の棒色 */
  topBarColor?: string
  barColor?: string
}) {
  const data = useMemo(() => toParetoData(entries), [entries])

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">データがありません</p>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v, name) => name === "累積構成比" ? [`${v}%`, name] : [v, name]} />
        <Legend />
        <ReferenceLine yAxisId="right" y={80} stroke="#9ca3af" strokeDasharray="4 4" />
        <Bar yAxisId="left" dataKey="value" name={barName} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => {
            // ひとつ前までの累積が 80% 未満の分類 = 重点対策対象を強調色にする
            const prevCumulative = i === 0 ? 0 : data[i - 1].cumulative
            return <Cell key={i} fill={prevCumulative < 80 ? topBarColor : barColor} />
          })}
        </Bar>
        <Line yAxisId="right" dataKey="cumulative" name="累積構成比" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

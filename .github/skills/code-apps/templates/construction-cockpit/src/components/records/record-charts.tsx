import type { ReactNode } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const AXIS = { fontSize: 11, fill: "#64748b" }

export function ChartCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-record-chart={title}>
      <h2 className="font-black">{title}</h2>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      <div className="mt-3 h-64">{children}</div>
    </article>
  )
}

function EmptyChart() {
  return <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700">表示できるデータがありません</div>
}

type Series<T> = { key: string; label: string; color: string; match: (item: T) => boolean }

function bucketKey(date: Date, unit: "day" | "week" | "month"): string {
  if (unit === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (unit === "week") day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
}

type Unit = "day" | "week" | "month"

/** 期間の粒度は記録の幅から自動で決める（〜45 日: 日、〜200 日: 週、それ以上: 月） */
function buildTimeBuckets<T>(items: T[], dateOf: (item: T) => string, series: Array<Series<T>>, amountOf: (item: T) => number = () => 1): { rows: Array<Record<string, number | string>>; unit: Unit } {
  const dated = items.map((item) => ({ item, date: new Date(dateOf(item)) })).filter(({ date }) => Number.isFinite(date.getTime()))
  if (!dated.length) return { rows: [], unit: "day" }
  const times = dated.map(({ date }) => date.getTime())
  const span = (Math.max(...times) - Math.min(...times)) / 86_400_000
  const unit: Unit = span <= 45 ? "day" : span <= 200 ? "week" : "month"
  const rows = new Map<string, Record<string, number | string>>()
  for (const { item, date } of dated) {
    const key = bucketKey(date, unit)
    const row = rows.get(key) ?? Object.fromEntries([["bucket", key], ...series.map((entry) => [entry.key, 0])])
    for (const entry of series) if (entry.match(item)) row[entry.key] = Number(row[entry.key]) + amountOf(item)
    rows.set(key, row)
  }
  return { rows: [...rows.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket))), unit }
}

const UNIT_LABEL: Record<Unit, string> = { day: "日別", week: "週別", month: "月別" }

export function StackedTrend<T>({ title, items, dateOf, series, amountOf, valueLabel = "件数" }: {
  title: string
  items: T[]
  dateOf: (item: T) => string
  series: Array<Series<T>>
  amountOf?: (item: T) => number
  valueLabel?: string
}) {
  const { rows, unit } = buildTimeBuckets(items, dateOf, series, amountOf)
  return (
    <ChartCard title={title} description={`${UNIT_LABEL[unit]}の${valueLabel}（絞り込み結果）`}>
      {!rows.length ? <EmptyChart /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="bucket" tick={AXIS} tickFormatter={(value: string) => value.slice(5)} minTickGap={12} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((entry) => <Bar key={entry.key} dataKey={entry.key} name={entry.label} stackId="total" fill={entry.color} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

export function LineTrend<T>({ title, items, dateOf, amountOf, valueLabel, color = "#0891b2", aggregate = "sum" }: {
  title: string
  items: T[]
  dateOf: (item: T) => string
  amountOf: (item: T) => number
  valueLabel: string
  color?: string
  aggregate?: "sum" | "average"
}) {
  const series = [{ key: "value", label: valueLabel, color, match: () => true }]
  const sums = buildTimeBuckets(items, dateOf, series, amountOf)
  const counts = buildTimeBuckets(items, dateOf, series)
  const rows = sums.rows.map((row, index) => ({ ...row, value: aggregate === "average" ? Math.round(Number(row.value) / Math.max(1, Number(counts.rows[index]?.value ?? 1))) : row.value }))
  return (
    <ChartCard title={title} description={`${UNIT_LABEL[sums.unit]}の${valueLabel}（絞り込み結果）`}>
      {!rows.length ? <EmptyChart /> : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="bucket" tick={AXIS} tickFormatter={(value: string) => value.slice(5)} minTickGap={12} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="value" name={valueLabel} stroke={color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

type Keyed = Record<number, string> | Record<string, string>

export function Breakdown<T>({ title, items, groupOf, labels, colors, variant = "pie", limit = 10 }: {
  title: string
  items: T[]
  groupOf: (item: T) => string | number
  labels?: Keyed
  colors?: Keyed
  variant?: "pie" | "bar"
  limit?: number
}) {
  const labelOf = labels as Record<string, string> | undefined
  const colorOf = colors as Record<string, string> | undefined
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = String(groupOf(item) || "")
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const palette = ["#0891b2", "#8b5cf6", "#f59e0b", "#10b981", "#e11d48", "#0ea5e9", "#64748b", "#d946ef", "#84cc16", "#f97316"]
  const rows = [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, value], index) => ({
    key, name: labelOf?.[key] ?? (key || "未設定"), value, color: colorOf?.[key] ?? palette[index % palette.length],
  }))
  return (
    <ChartCard title={title} description={`${variant === "bar" ? `上位 ${limit} 件の` : ""}件数（絞り込み結果）`}>
      {!rows.length ? <EmptyChart /> : variant === "pie" ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={2} isAnimationActive={false} label={({ name, value }) => `${name} ${value}`}>
              {rows.map((row) => <Cell key={row.key} fill={row.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={AXIS} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={120} />
            <Tooltip />
            <Bar dataKey="value" name="件数" isAnimationActive={false}>{rows.map((row) => <Cell key={row.key} fill={row.color} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

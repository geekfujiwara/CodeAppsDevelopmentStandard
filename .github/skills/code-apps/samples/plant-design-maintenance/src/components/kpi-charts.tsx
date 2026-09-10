import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  CategoryBreakdown,
  DailyAnswerTrend,
  FunnelStage,
  MonthlyTrendPoint,
  SourceTypeBreakdown,
} from "@/lib/kpi"

const AXIS = { fontSize: 12, fill: "currentColor" } as const
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--popover-foreground)",
  fontSize: "0.75rem",
} as const

export function MonthlyTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>月次トレンド</CardTitle>
        <CardDescription>起票にナレッジ蓄積が追随できているかを見る（K-01 の先行指標）</CardDescription>
      </CardHeader>
      <CardContent className="h-72 text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Bar dataKey="created" name="起票" fill="var(--chart-1, #6366f1)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="closed" name="クローズ" fill="var(--chart-2, #14b8a6)" radius={[4, 4, 0, 0]} />
            <Line
              dataKey="knowledge"
              name="ナレッジ化"
              type="monotone"
              stroke="var(--chart-3, #f59e0b)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export const DAILY_TREND_RANGES = [14, 30, 90] as const

export function DailyAnswerTrendChart({
  trend,
  days,
  onDaysChange,
}: {
  trend: DailyAnswerTrend
  days: number
  onDaysChange: (days: number) => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>自動回答の日次推移</CardTitle>
          <CardDescription className="[overflow-wrap:anywhere]">
            自動で回答できた / できなかった問い合わせの推移（K-11）。基準日 {trend.anchorIso} から遡って {days} 日
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-1">
          {DAILY_TREND_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onDaysChange(range)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                range === days ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {range}日
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-72 text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={trend.points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Bar dataKey="autoAnswered" name="自動回答できた" stackId="a" fill="#14b8a6" />
            <Bar dataKey="unanswerable" name="自動回答できなかった" stackId="a" fill="#ef4444" />
            <Bar dataKey="humanAnswered" name="人が回答" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Line
              dataKey="reported"
              name="起票"
              type="monotone"
              stroke="var(--chart-1, #6366f1)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

const SOURCE_TYPE_COLORS: Record<string, string> = {
  ファイルサーバー: "#6366f1",
  業務システム: "#14b8a6",
  文書: "#f59e0b",
  問い合わせ: "#a855f7",
}

export function SourceTypeChart({ data }: { data: SourceTypeBreakdown[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>根拠となったデータソース</CardTitle>
        <CardDescription>
          MCP Server 経由の外部データソース（図面・設計書 / 故障管理 DB）がどれだけ回答を支えたか（K-13）
        </CardDescription>
      </CardHeader>
      <CardContent className="h-72 text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="sourceType" tick={AXIS} tickLine={false} axisLine={false} width={104} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="count" name="出典件数" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.sourceType} fill={SOURCE_TYPE_COLORS[entry.sourceType] ?? "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

const FUNNEL_COLORS = ["#f59e0b", "#a855f7", "#14b8a6", "#6366f1"]
export function ApprovalFunnelChart({ data }: { data: FunnelStage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>承認パイプライン</CardTitle>
        <CardDescription>どの段階で滞留しているかを見る（K-05 / K-06 のボトルネック特定）</CardDescription>
      </CardHeader>
      <CardContent className="h-72 text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="stage" tick={AXIS} tickLine={false} axisLine={false} width={72} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="count" name="件数" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={entry.stage} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function CategoryBreakdownChart({ data }: { data: CategoryBreakdown[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>設備カテゴリ別ナレッジ</CardTitle>
        <CardDescription>横展開の余地を見る（F-41）。再利用は発生2件以上のナレッジ</CardDescription>
      </CardHeader>
      <CardContent className="h-72 text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="category" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Bar dataKey="total" name="ナレッジ件数" fill="var(--chart-1, #6366f1)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="reused" name="再利用あり" fill="var(--chart-3, #f59e0b)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

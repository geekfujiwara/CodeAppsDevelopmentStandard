import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { listEvalTurns, VERDICT_NG, VERDICT_OK, type EvalTurn } from "@/lib/eval-turns"

type DailyPoint = {
  date: string
  toolCallAccuracy: number | null
  taskAdherence: number | null
  count: number
}

function toDateKey(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "不明"
  return date.toLocaleDateString("sv-SE")
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((total, value) => total + value, 0)
  return Math.round((sum / values.length) * 100) / 100
}

function toDailySeries(turns: EvalTurn[]): DailyPoint[] {
  const buckets = new Map<string, EvalTurn[]>()
  for (const turn of turns) {
    const key = toDateKey(turn.evaluatedOn)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(turn)
    else buckets.set(key, [turn])
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({
      date,
      toolCallAccuracy: average(
        items.map((item) => item.toolCallAccuracy).filter((value): value is number => value !== null),
      ),
      taskAdherence: average(
        items.map((item) => item.taskAdherence).filter((value): value is number => value !== null),
      ),
      count: items.length,
    }))
}

function StatCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{description}</CardContent>
    </Card>
  )
}

export default function Trend() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["eval-turns"],
    queryFn: () => listEvalTurns(),
  })

  const turns = useMemo(() => data ?? [], [data])
  const series = useMemo(() => toDailySeries(turns), [turns])

  const okCount = turns.filter((turn) => turn.humanVerdict === VERDICT_OK).length
  const ngCount = turns.filter((turn) => turn.humanVerdict === VERDICT_NG).length
  const labeled = okCount + ngCount

  const avgToolCallAccuracy = average(
    turns.map((turn) => turn.toolCallAccuracy).filter((value): value is number => value !== null),
  )
  const avgTaskAdherence = average(
    turns.map((turn) => turn.taskAdherence).filter((value): value is number => value !== null),
  )

  if (isLoading) return <LoadingSkeletonList count={3} />
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        評価ターンを取得できませんでした: {(error as Error).message}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">スコア推移</h1>
        <p className="text-muted-foreground">日ごとの平均スコアと人手ラベルの内訳</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="評価ターン数" value={String(turns.length)} description="取り込み済みの全ターン" />
        <StatCard
          title="ツール呼び出し精度"
          value={avgToolCallAccuracy === null ? "-" : String(avgToolCallAccuracy)}
          description="全期間の平均（1-5）"
        />
        <StatCard
          title="タスク遵守度"
          value={avgTaskAdherence === null ? "-" : String(avgTaskAdherence)}
          description="全期間の平均（1-5）"
        />
        <StatCard
          title="人手ラベル"
          value={labeled === 0 ? "-" : `${okCount} / ${labeled}`}
          description={`OK ${okCount} 件・NG ${ngCount} 件`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>日次の平均スコア</CardTitle>
          <CardDescription>評価日ごとに平均したスコア（1-5、高いほど良い）</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {series.length === 0 ? (
            <p className="text-sm text-muted-foreground">表示できるデータがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="toolCallAccuracy"
                  name="ツール呼び出し精度"
                  stroke="#2563eb"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="taskAdherence"
                  name="タスク遵守度"
                  stroke="#16a34a"
                  strokeWidth={2}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

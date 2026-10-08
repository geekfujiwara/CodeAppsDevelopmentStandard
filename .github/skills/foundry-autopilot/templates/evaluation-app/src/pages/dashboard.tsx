import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowRight, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { ScoreBadge, VerdictBadge } from "@/components/eval-bits"
import { formatDateTime } from "@/lib/date-format"
import {
  EMPTY_TURN_FILTER,
  listEvalTurns,
  LOW_SCORE,
  needsAttention,
  parseToolCalls,
  turnsQueryKey,
  VERDICT_OK,
  type EvalTurn,
} from "@/lib/eval-turns"

const PERIODS = [
  { days: 7, label: "7日" },
  { days: 30, label: "30日" },
  { days: 0, label: "全期間" },
] as const

type Drill =
  | { kind: "none" }
  | { kind: "actor"; value: string }
  | { kind: "day"; value: string }
  | { kind: "tool"; value: string }
  | { kind: "source"; value: string }

function dayKey(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "不明"
  return date.toLocaleDateString("sv-SE")
}

function average(values: (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null)
  if (numbers.length === 0) return null
  return Math.round((numbers.reduce((total, value) => total + value, 0) / numbers.length) * 100) / 100
}

function toolNames(turn: EvalTurn): string[] {
  return parseToolCalls(turn.toolCallsJson)
    .map((call) => call.name?.trim())
    .filter((name): name is string => Boolean(name))
}

function countBy(turns: EvalTurn[], keyOf: (turn: EvalTurn) => string[]): Map<string, EvalTurn[]> {
  const buckets = new Map<string, EvalTurn[]>()
  for (const turn of turns) {
    for (const key of new Set(keyOf(turn))) {
      const bucket = buckets.get(key)
      if (bucket) bucket.push(turn)
      else buckets.set(key, [turn])
    }
  }
  return buckets
}

function topRows(
  buckets: Map<string, EvalTurn[]>,
  limit: number,
): { key: string; count: number; score: number | null }[] {
  return [...buckets.entries()]
    .map(([key, items]) => ({
      key,
      count: items.length,
      score: average(items.flatMap((item) => [item.toolCallAccuracy, item.taskAdherence])),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function deltaText(current: number, previous: number | null): string {
  if (previous === null) return "前期間との比較なし"
  const diff = Math.round((current - previous) * 100) / 100
  if (diff === 0) return "前期間と同じ"
  return `前期間比 ${diff > 0 ? "+" : ""}${diff}`
}

function Kpi({
  title,
  value,
  description,
  to,
  tone,
}: {
  title: string
  value: string
  description: string
  to?: string
  tone?: "warn"
}) {
  const card = (
    <Card
      className={`h-full gap-0 py-3 ${to ? "transition-colors hover:border-primary/60 hover:bg-muted/40" : ""}`}
    >
      <CardHeader className="gap-0 px-3 pb-0">
        <CardDescription className="flex min-w-0 items-center gap-1 text-xs">
          <span className="truncate">{title}</span>
          {to && <ArrowRight className="size-3 shrink-0" />}
        </CardDescription>
        <CardTitle
          className={`text-xl leading-tight ${tone === "warn" && value !== "0" ? "text-destructive" : ""}`}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pt-0.5">
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )

  if (!to) return card
  return (
    <Link to={to} className="min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  )
}

function BarList({
  rows,
  selected,
  onSelect,
  emptyText,
}: {
  rows: { key: string; label: string; count: number; note?: string }[]
  selected: string | null
  onSelect: (key: string) => void
  emptyText: string
}) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{emptyText}</p>

  const max = Math.max(...rows.map((row) => row.count), 1)
  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            onClick={() => onSelect(row.key)}
            className={`relative flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted ${
              selected === row.key ? "ring-1 ring-primary" : ""
            }`}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
            <span className="relative min-w-0 flex-1 truncate">{row.label}</span>
            {row.note && <span className="relative shrink-0 text-muted-foreground">{row.note}</span>}
            <span className="relative w-8 shrink-0 text-right font-medium tabular-nums">{row.count}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function Dashboard() {
  const [days, setDays] = useState<number>(7)
  const [drill, setDrill] = useState<Drill>({ kind: "none" })

  // 一覧・詳細ペインと同じキーなので、行き来しても再取得しない。
  const { data, isLoading, isError, error } = useQuery({
    queryKey: turnsQueryKey(EMPTY_TURN_FILTER),
    queryFn: () => listEvalTurns(),
  })

  const all = useMemo(() => data ?? [], [data])

  const { current, previous } = useMemo(() => {
    if (days === 0) return { current: all, previous: null as EvalTurn[] | null }
    const now = Date.now()
    const span = days * 24 * 60 * 60 * 1000
    const inRange = (turn: EvalTurn, from: number, to: number) => {
      const time = new Date(turn.occurredOn).getTime()
      return !Number.isNaN(time) && time >= from && time < to
    }
    return {
      current: all.filter((turn) => inRange(turn, now - span, now + 1)),
      previous: all.filter((turn) => inRange(turn, now - span * 2, now - span)),
    }
  }, [all, days])

  const actors = useMemo(() => countBy(current, (turn) => [turn.actorLabel]), [current])
  const tools = useMemo(() => countBy(current, toolNames), [current])
  const sources = useMemo(() => countBy(current, (turn) => [turn.sourceLabel]), [current])

  const daily = useMemo(() => {
    const buckets = countBy(current, (turn) => [dayKey(turn.occurredOn)])
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, items]) => ({
        date,
        count: items.length,
        users: new Set(items.map((item) => item.actorLabel)).size,
      }))
  }, [current])

  const attention = useMemo(() => current.filter(needsAttention), [current])
  const unlabeled = useMemo(() => current.filter((turn) => turn.humanVerdict === null), [current])

  const drillTurns = useMemo(() => {
    switch (drill.kind) {
      case "actor":
        return actors.get(drill.value) ?? []
      case "tool":
        return tools.get(drill.value) ?? []
      case "source":
        return sources.get(drill.value) ?? []
      case "day":
        return current.filter((turn) => dayKey(turn.occurredOn) === drill.value)
      default:
        return []
    }
  }, [drill, actors, tools, sources, current])

  const drillTitle = useMemo(() => {
    switch (drill.kind) {
      case "actor":
        return `相手: ${drill.value}`
      case "tool":
        return `ツール: ${drill.value}`
      case "source":
        return `経路: ${drill.value}`
      case "day":
        return `会話日: ${drill.value}`
      default:
        return ""
    }
  }, [drill])

  if (isLoading) return <LoadingSkeletonList count={4} />
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        評価ターンを取得できませんでした: {(error as Error).message}
      </p>
    )
  }

  const periodNote = days === 0 ? "全期間" : `直近 ${days} 日`
  const avgAccuracy = average(current.map((turn) => turn.toolCallAccuracy))
  const avgAdherence = average(current.map((turn) => turn.taskAdherence))
  const okCount = current.filter((turn) => turn.humanVerdict === VERDICT_OK).length

  const toggle = (next: Drill) =>
    setDrill((prev) =>
      prev.kind === next.kind && "value" in prev && "value" in next && prev.value === next.value
        ? { kind: "none" }
        : prev.kind === next.kind && !("value" in next)
          ? { kind: "none" }
          : next,
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
          <p className="text-muted-foreground">利用状況と品質の要点（{periodNote}）</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((period) => (
            <Button
              key={period.days}
              size="sm"
              variant={days === period.days ? "default" : "outline"}
              onClick={() => {
                setDays(period.days)
                setDrill({ kind: "none" })
              }}
            >
              {period.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          title="会話数"
          value={String(current.length)}
          description={deltaText(current.length, previous?.length ?? null)}
          to="/turns"
        />
        <Kpi
          title="利用者数"
          value={String(actors.size)}
          description={deltaText(
            actors.size,
            previous ? new Set(previous.map((turn) => turn.actorLabel)).size : null,
          )}
        />        <Kpi
          title="ツール呼び出し精度"
          value={avgAccuracy === null ? "-" : String(avgAccuracy)}
          description={
            avgAccuracy === null
              ? "評価済みのターンなし"
              : deltaText(avgAccuracy, previous ? average(previous.map((t) => t.toolCallAccuracy)) : null)
          }
          to="/trend"
        />
        <Kpi
          title="タスク遵守度"
          value={avgAdherence === null ? "-" : String(avgAdherence)}
          description={
            avgAdherence === null
              ? "評価済みのターンなし"
              : deltaText(avgAdherence, previous ? average(previous.map((t) => t.taskAdherence)) : null)
          }
          to="/trend"
        />
        <Kpi
          title="要確認"
          value={String(attention.length)}
          description={`スコア ${LOW_SCORE} 以下 または NG`}
          tone="warn"
          to="/turns?view=attention"
        />
        <Kpi
          title="未評価"
          value={String(unlabeled.length)}
          description={`人手ラベル待ち（OK ${okCount} 件）`}
          to="/turns?view=unlabeled"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">誰が使っているか</CardTitle>
            <CardDescription>相手ごとの会話数（多い順・上位 10 件）</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <BarList
              rows={topRows(actors, 10).map((row) => ({
                key: row.key,
                label: row.key,
                count: row.count,
                note: row.score === null ? undefined : `平均 ${row.score}`,
              }))}
              selected={drill.kind === "actor" ? drill.value : null}
              onSelect={(value) => toggle({ kind: "actor", value })}
              emptyText="この期間の会話はありません"
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">どのツールが使われたか</CardTitle>
            <CardDescription>ツールごとの利用ターン数（上位 10 件）</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <BarList
              rows={topRows(tools, 10).map((row) => ({
                key: row.key,
                label: row.key,
                count: row.count,
              }))}
              selected={drill.kind === "tool" ? drill.value : null}
              onSelect={(value) => toggle({ kind: "tool", value })}
              emptyText="ツール呼び出しの記録がありません"
            />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">日ごとの利用</CardTitle>
          <CardDescription>会話数（棒）と利用者数（線）。棒をクリックするとその日のターンを表示</CardDescription>
        </CardHeader>
        <CardContent className="h-72 min-w-0">
          {daily.length === 0 ? (
            <p className="text-xs text-muted-foreground">この期間の会話はありません</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={daily}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                onClick={(state: { activeLabel?: string | number }) => {
                  const label = state?.activeLabel
                  if (typeof label === "string") toggle({ kind: "day", value: label })
                }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="会話数" fill="#2563eb" radius={[4, 4, 0, 0]} cursor="pointer" />
                <Line type="monotone" dataKey="users" name="利用者数" stroke="#16a34a" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">経路の内訳</CardTitle>
          <CardDescription>どこから話しかけられているか</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <BarList
            rows={topRows(sources, 10).map((row) => ({
              key: row.key,
              label: row.key,
              count: row.count,
            }))}
            selected={drill.kind === "source" ? drill.value : null}
            onSelect={(value) => toggle({ kind: "source", value })}
            emptyText="この期間の会話はありません"
          />
        </CardContent>
      </Card>

      {drill.kind !== "none" && (
        <Card className="min-w-0 border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{drillTitle}</CardTitle>
                <CardDescription>{drillTurns.length} 件。クリックで評価ターンの詳細へ</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDrill({ kind: "none" })}>
                <X className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-w-0">
            {drillTurns.length === 0 ? (
              <p className="text-xs text-muted-foreground">該当するターンがありません</p>
            ) : (
              <ul className="divide-y">
                {drillTurns.slice(0, 50).map((turn) => (
                  <li key={turn.id}>
                    <Link
                      to={`/turns/${turn.id}`}
                      className="flex min-w-0 items-center gap-3 px-1 py-2 hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{turn.actorLabel}</span>
                          <Badge variant="outline">{turn.sourceLabel}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(turn.occurredOn)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">
                          {turn.query || "(なし)"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <ScoreBadge score={turn.toolCallAccuracy} />
                        <ScoreBadge score={turn.taskAdherence} />
                        <VerdictBadge label={turn.verdictLabel} />
                        <ArrowRight className="size-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {drillTurns.length > 50 && (
              <p className="pt-2 text-xs text-muted-foreground">
                先頭 50 件を表示しています。残りは評価ターン一覧で絞り込んでください。
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

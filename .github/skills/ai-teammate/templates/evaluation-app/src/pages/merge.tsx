import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, ChevronDown, ChevronRight, MessagesSquare } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Markdown } from "@/components/markdown"
import { MergeAction } from "@/components/merge-action"
import { formatDateTime } from "@/lib/date-format"
import {
  DEFAULT_GAP_MINUTES,
  GAP_OPTIONS,
  findMergeCandidates,
  listEvalTurns,
  turnsQueryKey,
  type MergeCandidate,
} from "@/lib/eval-turns"

function Line({ label, text, clamp }: { label: string; text: string; clamp: boolean }) {
  const body = text || "(なし)"
  return (
    <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
      <span className="mr-1.5 rounded bg-muted px-1 py-0.5 align-top text-[10px] text-muted-foreground">
        {label}
      </span>
      {/* 畳んでいる間は行数を数えたいので、記法を解釈せず素のまま切り詰める。 */}
      {clamp ? (
        <span className="line-clamp-2 align-top">{body}</span>
      ) : (
        <Markdown>{body}</Markdown>
      )}
    </div>
  )
}

function CandidateCard({ candidate }: { candidate: MergeCandidate }) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<Set<string>>(new Set())

  const selected = candidate.turns.filter((turn) => !excluded.has(turn.id))

  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const span = `${formatDateTime(candidate.turns[0].occurredOn)} 〜 ${formatDateTime(
    candidate.turns[candidate.turns.length - 1].occurredOn,
  )}`

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle className="min-w-0 truncate text-base">{candidate.actorLabel}</CardTitle>
          <Badge variant="outline" className="shrink-0">
            {candidate.sourceLabel}
          </Badge>
          <Badge variant="secondary" className="shrink-0">
            {candidate.turns.length} ターン
          </Badge>
        </div>
        <CardDescription className="[overflow-wrap:anywhere]">{span}</CardDescription>
      </CardHeader>

      <CardContent className="min-w-0 space-y-3">
        <ul className="min-w-0 space-y-2">
          {candidate.turns.map((turn) => {
            const open = opened.has(turn.id)
            return (
              <li key={turn.id} className="flex min-w-0 items-start gap-2 rounded-md border p-2">
                <Checkbox
                  checked={!excluded.has(turn.id)}
                  onCheckedChange={() => setExcluded((current) => flip(current, turn.id))}
                  aria-label="この会話を含める"
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Line label="質問" text={turn.query} clamp={!open} />
                  <Line label="応答" text={turn.response} clamp={!open} />
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatDateTime(turn.occurredOn)}</span>
                    <span>ツール {turn.toolCount ?? 0} 件</span>
                    <button
                      type="button"
                      onClick={() => setOpened((current) => flip(current, turn.id))}
                      className="inline-flex items-center gap-0.5 hover:text-foreground"
                    >
                      {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      {open ? "折りたたむ" : "全文を見る"}
                    </button>
                  </div>
                </div>
                <Link
                  to={`/turns/${turn.id}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="このターンを開く"
                >
                  <ArrowRight className="size-4" />
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <MergeAction turns={selected} />
          {selected.length < 2 && (
            <span className="text-xs text-muted-foreground">2 件以上を選んでください。</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function MergeTurns() {
  const [gap, setGap] = useState(DEFAULT_GAP_MINUTES)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: turnsQueryKey(),
    queryFn: () => listEvalTurns(),
  })

  const candidates = useMemo(() => findMergeCandidates(data ?? [], gap), [data, gap])

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">会話の統合</h1>
          <p className="text-sm text-muted-foreground">
            同じ相手と続けて交わされたターンを 1 つの会話としてまとめ、流れ全体で評価できるようにします。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-muted-foreground">同じ会話とみなす間隔</span>
          <Select value={String(gap)} onValueChange={(value) => setGap(Number(value))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAP_OPTIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {minutes} 分以内
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">
          評価ターンを取得できませんでした: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <LoadingSkeletonList />
      ) : candidates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            続けて発生したターンの組み合わせが見つかりませんでした。間隔を広げると候補が増えます。
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {candidates.map((candidate) => (
            <CandidateCard key={candidate.key} candidate={candidate} />
          ))}
        </div>
      )}
    </div>
  )
}

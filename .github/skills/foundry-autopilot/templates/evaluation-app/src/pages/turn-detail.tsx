import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Bot, BookOpen, ServerCog, Split, User, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Markdown } from "@/components/markdown"
import { TurnNav } from "@/components/turn-nav"
import { AutoEvaluation } from "@/components/auto-evaluation"
import { HighlightedText } from "@/components/highlighted-text"
import { ScoreBadge, VerdictBadge } from "@/components/eval-bits"
import { formatDateTime } from "@/lib/date-format"
import { EVAL_RULES_KEY, listEvalRules } from "@/lib/eval-rules"
import {
  listResultsForTurn,
  turnResultsQueryKey,
  type Evidence,
} from "@/lib/eval-results"
import {
  EVAL_TURNS_KEY,
  conversationOf,
  formatToolArguments,
  getEvalTurn,
  groupToolCalls,
  saveHumanLabel,
  skillNameOf,
  unmergeTurn,
  VERDICT_NG,
  VERDICT_OK,
  type EvalTurn,
  type ToolCall,
} from "@/lib/eval-turns"

// 引用が JSON の一部を切り出したものでも当たるように、呼び出し 1 件分の文字列と両方向で照合する。
// 評価者が見たのは整形済みの JSON なので、詰めた形と整形した形の両方を試す。
function callMatches(call: ToolCall, evidence: Evidence[]): Evidence | undefined {
  const forms = [JSON.stringify(call), JSON.stringify(call, null, 2)]
  return evidence.find((item) => {
    const quote = item.quote?.trim()
    if (!quote || item.kind !== "tool_call") return false
    if (forms.some((form) => form.includes(quote))) return true
    return Boolean(call.name) && quote.includes(call.name as string)
  })
}

function ToolCallRow({ call, evidence }: { call: ToolCall; evidence: Evidence[] }) {
  const args = formatToolArguments(call.arguments)
  const skill = skillNameOf(call)
  const hit = callMatches(call, evidence)
  const tone = !hit
    ? ""
    : hit.polarity === "positive"
      ? "border-emerald-500/60 bg-emerald-500/10"
      : "border-amber-500/60 bg-amber-500/10"

  return (
    <li className={`rounded-md border bg-background px-3 py-2 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{call.name ?? "(不明)"}</span>
        {skill && (
          <Link
            to={`/skills?name=${encodeURIComponent(skill)}`}
            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted"
          >
            <BookOpen className="size-3" />
            {skill}
          </Link>
        )}
      </div>
      {args && (
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
          {args}
        </pre>
      )}
      {hit && (
        <p className="mt-1 text-[11px] text-foreground [overflow-wrap:anywhere]">{hit.note}</p>
      )}
    </li>
  )
}

function ToolTimeline({ calls, evidence }: { calls: ToolCall[]; evidence: Evidence[] }) {
  const groups = useMemo(() => groupToolCalls(calls), [calls])

  if (groups.length === 0) {
    return (
      <div className="pl-11 text-xs text-muted-foreground">
        この応答ではツールを使っていません。
      </div>
    )
  }

  const total = groups.reduce((sum, group) => sum + group.calls.length, 0)

  return (
    <div className="space-y-2 pl-11">
      <div className="text-xs text-muted-foreground">
        {groups.length} 個の提供元から {total} 件のツールを呼び出しました
      </div>
      {groups.map((group) => (
        <div key={group.server} className="rounded-lg border border-dashed bg-muted/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <ServerCog className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{group.server}</span>
            <Badge variant="secondary">{group.calls.length}</Badge>
          </div>
          <ul className="space-y-1.5">
            {group.calls.map((call, index) => (
              <ToolCallRow
                key={call.tool_call_id ?? `${group.server}-${index}`}
                call={call}
                evidence={evidence}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// メール往復が続くほど、返信欄には前のやり取り全文がそのまま引用されて溜まっていく。
// その引用ヘッダー行を境に、新しく書かれた部分と過去の引用を分けて折りたためるようにする。
const QUOTE_HEADER = /^(差出人[:：]|From[:：])/i

function splitQuotedReply(text: string): { main: string; quoted: string } {
  const lines = text.split("\n")
  for (let i = 1; i < lines.length; i++) {
    if (QUOTE_HEADER.test(lines[i].trim())) {
      return {
        main: lines.slice(0, i).join("\n").trimEnd(),
        quoted: lines.slice(i).join("\n").trim(),
      }
    }
  }
  return { main: text, quoted: "" }
}

function BubbleText({ text, evidence }: { text: string; evidence: Evidence[] }) {
  // ハイライト中は Markdown を通さない。整形すると引用の位置が原文とずれてしまうため。
  return evidence.length > 0 ? (
    <HighlightedText text={text} evidence={evidence} />
  ) : (
    <Markdown>{text}</Markdown>
  )
}

function QuotedReply({ text, evidence }: { text: string; evidence: Evidence[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mt-2 border-t pt-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
      >
        {expanded ? "引用部分を隠す" : `引用部分をもっと見る（${text.length.toLocaleString()} 文字）`}
      </button>
      {expanded && (
        <div className="mt-2">
          <BubbleText text={text} evidence={evidence} />
        </div>
      )}
    </div>
  )
}

function Bubble({
  who,
  sub,
  icon,
  text,
  tone,
  evidence,
}: {
  who: string
  sub?: string
  icon: React.ReactNode
  text: string
  tone: "user" | "agent"
  evidence: Evidence[]
}) {
  const { main, quoted } = useMemo(() => splitQuotedReply(text), [text])
  return (
    <div className="flex gap-3">
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          tone === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-sm font-medium">{who}</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
        <div
          className={`min-w-0 rounded-lg px-3 py-2 text-sm ${
            tone === "user" ? "bg-primary/10" : "border bg-background"
          }`}
        >
          {!text ? "(なし)" : <BubbleText text={main} evidence={evidence} />}
          {quoted && <QuotedReply text={quoted} evidence={evidence} />}
        </div>
      </div>
    </div>
  )
}

function HumanLabel({ turn }: { turn: EvalTurn }) {
  const queryClient = useQueryClient()
  const [verdict, setVerdict] = useState<number | null>(turn.humanVerdict)
  const [comment, setComment] = useState(turn.humanComment)

  useEffect(() => {
    setVerdict(turn.humanVerdict)
    setComment(turn.humanComment)
  }, [turn.id, turn.humanVerdict, turn.humanComment])

  const mutation = useMutation({
    mutationFn: () => saveHumanLabel(turn.id, verdict, comment),
    onSuccess: async () => {
      toast.success("ラベルを保存しました")
      await queryClient.invalidateQueries({ queryKey: EVAL_TURNS_KEY })
      await queryClient.invalidateQueries({ queryKey: [...EVAL_TURNS_KEY, turn.id] })
    },
    onError: (error: Error) => toast.error(`保存に失敗しました: ${error.message}`),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">人手ラベル</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={verdict === VERDICT_OK ? "default" : "outline"}
            onClick={() => setVerdict(VERDICT_OK)}
          >
            ○ OK
          </Button>
          <Button
            type="button"
            variant={verdict === VERDICT_NG ? "destructive" : "outline"}
            onClick={() => setVerdict(VERDICT_NG)}
          >
            × NG
          </Button>
          <Button type="button" variant="ghost" onClick={() => setVerdict(null)}>
            クリア
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="human-comment">コメント</Label>
          <Textarea
            id="human-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="気になった点があれば書き残します（任意）"
            rows={3}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function UnmergeButton({ turn }: { turn: EvalTurn }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const mutation = useMutation({
    mutationFn: () => unmergeTurn(turn),
    onSuccess: async () => {
      toast.success("統合を解除しました")
      await queryClient.invalidateQueries({ queryKey: EVAL_TURNS_KEY })
      navigate("/turns")
    },
    onError: (error: Error) => toast.error(`解除できませんでした: ${error.message}`),
  })

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={mutation.isPending}
      >
        <Split className="size-4" />
        統合を解除
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="統合を解除しますか？"
        description="元のターンを一覧に戻し、この統合ターンとその評価結果は削除します。"
        confirmLabel="解除する"
        variant="destructive"
        onConfirm={() => mutation.mutate()}
      />
    </>
  )
}

export default function TurnDetail() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [activeRuleKey, setActiveRuleKey] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...EVAL_TURNS_KEY, id],
    queryFn: () => getEvalTurn(id),
    enabled: Boolean(id),
  })

  const turnName = data?.name ?? ""
  const { data: resultsData } = useQuery({
    queryKey: turnResultsQueryKey(turnName),
    queryFn: () => listResultsForTurn(turnName),
    enabled: Boolean(turnName),
  })
  const results = useMemo(() => resultsData ?? [], [resultsData])
  // 統合ターンは複数往復を持つ。通常ターンも 1 件の配列として同じ形で扱う。
  const entries = useMemo(() => (data ? conversationOf(data) : []), [data])

  // ルール名からルールの編集ページへ飛ばすために、キーと GUID の対応表を持っておく。
  const { data: rulesData } = useQuery({
    queryKey: EVAL_RULES_KEY,
    queryFn: listEvalRules,
    staleTime: 5 * 60 * 1000,
  })
  const rules = useMemo(() => rulesData ?? [], [rulesData])

  // 別のターンへ移ったら選択は解除する。ルールキーは使い回されるので残ると誤解を招く。
  useEffect(() => setActiveRuleKey(null), [id])

  const activeEvidence = useMemo(
    () => results.find((result) => result.ruleKey === activeRuleKey)?.evidence ?? [],
    [results, activeRuleKey],
  )
  const evidenceFor = (kind: Evidence["kind"]) =>
    activeEvidence.filter((item) => item.kind === kind)

  const shell = (children: React.ReactNode) => (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* 上はヘッダー 4rem + 本文の p-6、下は本文の p-6 分を逃がす。 */}
      <div className="hidden min-w-0 lg:sticky lg:top-[5.5rem] lg:block lg:self-start">
        <TurnNav currentId={id} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )

  if (isLoading) return shell(<LoadingSkeletonList count={3} />)
  if (isError || !data) {
    return shell(
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/turns")}>
          <ArrowLeft className="mr-2 size-4" />
          一覧に戻る
        </Button>
        <p className="text-sm text-destructive">
          このターンを取得できませんでした: {(error as Error)?.message ?? "見つかりません"}
        </p>
      </div>,
    )
  }

  return shell(
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link to="/turns">
            <ArrowLeft className="mr-2 size-4" />
            評価ターン
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{data.actorLabel}</h1>
          <Badge variant="outline">{data.sourceLabel}</Badge>
          <VerdictBadge label={data.verdictLabel} />
          {data.isMerged && (
            <>
              <Badge variant="secondary">{data.turnCount ?? entries.length} ターンを統合</Badge>
              <UnmergeButton turn={data} />
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(data.occurredOn)}
          {data.evaluatedOn && ` ／ 評価: ${formatDateTime(data.evaluatedOn)} (${data.runLabel})`}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">会話</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {entries.map((entry, index) => (
              <div key={entry.name || index} className="min-w-0 space-y-4">
                {entries.length > 1 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0 rounded-full border px-2 py-0.5">{index + 1} 回目</span>
                    <span className="truncate">{formatDateTime(entry.occurredOn)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <Bubble
                  who={data.actorLabel}
                  sub={data.sourceLabel}
                  icon={<User className="size-4" />}
                  text={entry.query}
                  tone="user"
                  evidence={evidenceFor("query")}
                />
                <ToolTimeline calls={entry.toolCalls} evidence={evidenceFor("tool_call")} />
                <Bubble
                  who="エージェント"
                  icon={<Bot className="size-4" />}
                  text={entry.response}
                  tone="agent"
                  evidence={evidenceFor("response")}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {results.length > 0 ? (
            <AutoEvaluation
              results={results}
              rules={rules}
              activeRuleKey={activeRuleKey}
              onActiveRuleKeyChange={setActiveRuleKey}
            />
          ) : (
            // ルールマスタ導入前に評価された行は、ターン側に残っている 2 指標だけを見せる。
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">自動評価</CardTitle>
                <p className="text-xs text-muted-foreground">
                  このターンはまだ新しい評価ルールで判定されていません。
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    ツール呼び出し精度 <ScoreBadge score={data.toolCallAccuracy} />
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {data.toolCallAccuracyReason || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    タスク遵守度 <ScoreBadge score={data.taskAdherence} />
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {data.taskAdherenceReason || "-"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/command-center")}>
                  再評価を依頼する
                </Button>
              </CardContent>
            </Card>
          )}

          <HumanLabel turn={data} />
        </div>
      </div>
    </div>,
  )
}

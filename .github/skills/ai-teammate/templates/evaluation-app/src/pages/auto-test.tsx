import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, ExternalLink, FlaskConical, Loader2, Play, ThumbsDown, ThumbsUp } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/markdown"
import { UpdateNote } from "@/components/update-note"
import { GITHUB_REPO } from "@/config"
import { formatDateTime } from "@/lib/date-format"
import { EVAL_AGENTS_KEY, listEvalAgents, STATUS_ACTIVE } from "@/lib/eval-agents"
import { EVAL_RULES_KEY, listEvalRules } from "@/lib/eval-rules"
import {
  cancelTestRun,
  createTestRun,
  isRunActive,
  listTestResults,
  listTestRuns,
  setTestResultIssueUrl,
  setTestResultVerdict,
  TEST_DONE,
  TEST_FAILED,
  TEST_PENDING,
  TEST_RESULTS_KEY,
  TEST_RUNNING,
  TEST_RUNS_KEY,
  VERDICT_NG,
  VERDICT_OK,
  type TestResult,
  type TestRun,
} from "@/lib/eval-tests"

const STATUS_STYLE: Record<number, string> = {
  [TEST_PENDING]: "border-muted bg-muted text-muted-foreground",
  [TEST_RUNNING]: "border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  [TEST_DONE]: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  [TEST_FAILED]: "border-destructive/60 bg-destructive/10 text-destructive",
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—"
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} 秒`
}

/**
 * The improvement prompt is text the reviewer hands back to whoever maintains the teammate, so it
 * has to carry the request, the answer, and why it was judged NG. Without the answer text quoted in
 * full, the maintainer only sees a verdict and has to go dig the run back up.
 */
function improvementPrompt(run: TestRun, result: TestResult): string {
  return [
    `# ${result.agentKey} の改善依頼`,
    "",
    "## 依頼した内容",
    "",
    "```text",
    run.prompt,
    "```",
    "",
    "## 実際の応答",
    "",
    "```text",
    result.response || "(応答なし)",
    "```",
    "",
    `## 所要時間: ${formatDuration(result.durationMs)}`,
    "",
    "## 自動評価",
    "",
    result.autoSummary || "(未評価)",
    "",
    "## 人手の指摘",
    "",
    result.humanComment || "(未記入)",
    "",
    "## お願いしたいこと",
    "",
    "上記の応答が期待に届かなかった原因を、システム プロンプト・スキル・ツール定義のどこにあるか切り分けて、",
    "修正案を提示してください。",
  ].join("\n")
}

function issueUrl(run: TestRun, result: TestResult): string {
  const title = `[AI チームメイト改善] ${result.agentKey}: ${run.prompt.slice(0, 50)}`
  const body = improvementPrompt(run, result)
  return `https://github.com/${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

function ResultCard({ run, result }: { run: TestRun; result: TestResult }) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState(result.humanComment)
  const [url, setUrl] = useState(result.issueUrl)
  const [showPrompt, setShowPrompt] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...TEST_RESULTS_KEY, run.name] })

  const verdictMutation = useMutation({
    mutationFn: (verdict: number | null) => setTestResultVerdict(result.id, verdict, comment),
    onSuccess: () => {
      toast.success("評価を保存しました")
      invalidate()
    },
    onError: (error: Error) => toast.error(`保存できませんでした: ${error.message}`),
  })

  const urlMutation = useMutation({
    mutationFn: (next: string) => setTestResultIssueUrl(result.id, next),
    onSuccess: () => {
      toast.success("Issue の URL を保存しました")
      invalidate()
    },
    onError: (error: Error) => toast.error(`保存できませんでした: ${error.message}`),
  })

  const prompt = improvementPrompt(run, result)

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="truncate">{result.agentKey}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-normal text-muted-foreground">
              {formatDuration(result.durationMs)}
            </span>
            <Badge
              variant="outline"
              className={result.status ? STATUS_STYLE[result.status] : undefined}
            >
              {result.status === TEST_RUNNING && <Loader2 className="mr-1 size-3 animate-spin" />}
              {result.statusLabel}
            </Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {result.error && (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{result.error}</p>
        )}

        <div className="max-h-80 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
          {result.response ? (
            <Markdown>{result.response}</Markdown>
          ) : (
            <p className="text-muted-foreground">
              {result.status === TEST_PENDING
                ? "このチームメイトの担当ワーカーが拾うのを待っています。"
                : "応答はまだありません。"}
            </p>
          )}
        </div>

        {result.autoScore !== null && (
          <div className="rounded-md border p-2 text-xs">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium">自動評価</span>
              <Badge variant="secondary">{result.autoScore.toFixed(2)} / 5</Badge>
            </div>
            {result.autoSummary && (
              <p className="whitespace-pre-wrap text-muted-foreground">{result.autoSummary}</p>
            )}
          </div>
        )}

        <div className="mt-auto space-y-2">
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="人手の指摘・気づいた点"
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={result.humanVerdict === VERDICT_OK ? "default" : "outline"}
              disabled={verdictMutation.isPending}
              onClick={() => verdictMutation.mutate(VERDICT_OK)}
            >
              <ThumbsUp className="mr-1 size-3.5" />
              OK
            </Button>
            <Button
              size="sm"
              variant={result.humanVerdict === VERDICT_NG ? "destructive" : "outline"}
              disabled={verdictMutation.isPending}
              onClick={() => verdictMutation.mutate(VERDICT_NG)}
            >
              <ThumbsDown className="mr-1 size-3.5" />
              NG
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPrompt((value) => !value)}>
              改善方針プロンプト
            </Button>
          </div>

          {showPrompt && (
            <div className="space-y-2">
              <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap">
                {prompt}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(prompt)
                    toast.success("改善方針プロンプトをコピーしました")
                  }}
                >
                  <Copy className="mr-1 size-3.5" />
                  コピー
                </Button>
                {GITHUB_REPO && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={issueUrl(run, result)} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1 size-3.5" />
                      GitHub Issue を起票
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="起票した Issue の URL"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={url.trim() === result.issueUrl || urlMutation.isPending}
              onClick={() => urlMutation.mutate(url.trim())}
            >
              保存
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AutoTest() {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState("")
  const [note, setNote] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [runName, setRunName] = useState("")

  const { data: agents } = useQuery({
    queryKey: EVAL_AGENTS_KEY,
    queryFn: listEvalAgents,
    staleTime: 5 * 60 * 1000,
  })

  const { data: rules } = useQuery({
    queryKey: EVAL_RULES_KEY,
    queryFn: listEvalRules,
    staleTime: 5 * 60 * 1000,
  })

  const { data: runs } = useQuery({
    queryKey: TEST_RUNS_KEY,
    queryFn: () => listTestRuns(50),
  })

  const run = useMemo(
    () => (runs ?? []).find((item) => item.name === runName) ?? (runs ?? [])[0],
    [runs, runName],
  )

  const { data: results } = useQuery({
    queryKey: [...TEST_RESULTS_KEY, run?.name ?? ""],
    queryFn: () => listTestResults(run?.name ?? ""),
    enabled: Boolean(run?.name),
    // Each teammate answers on its own schedule, so the page polls while anyone is still working.
    refetchInterval: (query) =>
      isRunActive(run, (query.state.data as TestResult[] | undefined) ?? []) ? 5000 : false,
  })

  const ruleKeys = useMemo(
    () => (rules ?? []).filter((rule) => rule.enabled).map((rule) => rule.ruleKey),
    [rules],
  )

  const candidates = useMemo(
    () => (agents ?? []).filter((agent) => agent.status === STATUS_ACTIVE && agent.agentKey),
    [agents],
  )

  const startMutation = useMutation({
    mutationFn: () =>
      createTestRun({
        prompt: prompt.trim(),
        agentKeys: [...selected],
        ruleKeys,
        requestedBy: "",
        note: note.trim(),
      }),
    onSuccess: (name) => {
      setRunName(name)
      toast.success(`${selected.size} 人にテストを依頼しました`)
      void queryClient.invalidateQueries({ queryKey: TEST_RUNS_KEY })
    },
    onError: (error: Error) => toast.error(`依頼できませんでした: ${error.message}`),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelTestRun(run!, results ?? []),
    onSuccess: () => {
      toast.success("テストをキャンセルしました")
      void queryClient.invalidateQueries({ queryKey: TEST_RUNS_KEY })
      void queryClient.invalidateQueries({ queryKey: [...TEST_RESULTS_KEY, run?.name ?? ""] })
    },
    onError: (error: Error) => toast.error(`キャンセルできませんでした: ${error.message}`),
  })

  const canStart = prompt.trim().length > 0 && selected.size > 0 && !startMutation.isPending

  const toggle = (agentKey: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(agentKey)) next.delete(agentKey)
      else next.add(agentKey)
      return next
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">自動テスト</h1>
        <p className="text-muted-foreground">
          同じ依頼を複数の AI チームメイトに投げて、所要時間と応答を並べて比べます。
        </p>
      </div>

      <UpdateNote>
        <p>
          依頼は Dataverse の待ち行列に積まれ、各チームメイトのワーカーが自分の行だけを拾って実行します。
          止まっているチームメイトの行は「待機中」のまま残るので、他の比較結果は失われません。
          応答が入ると、有効になっている評価ルールで自動採点されます。
        </p>
      </UpdateNote>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-4" />
            テストを依頼する
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="全員に同じ文面で送る依頼を書きます"
            rows={4}
          />
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="このテストの目的（任意）"
          />
          <div>
            <p className="mb-2 text-sm font-medium">送る相手</p>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                稼働中のチームメイトがいません。組織図でマスターを確認してください。
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {candidates.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={selected.has(agent.agentKey)}
                      onCheckedChange={() => toggle(agent.agentKey)}
                    />
                    <span>{agent.name || agent.agentKey}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={!canStart} onClick={() => startMutation.mutate()}>
              {startMutation.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Play className="mr-1 size-4" />
              )}
              テストを開始
            </Button>
            <span className="text-xs text-muted-foreground">
              適用する評価ルール: {ruleKeys.length} 件
            </span>
          </div>
        </CardContent>
      </Card>

      {runs && runs.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">過去のテスト</span>
            {runs.slice(0, 8).map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={item.name === run?.name ? "default" : "outline"}
                onClick={() => setRunName(item.name)}
              >
                {formatDateTime(item.requestedOn)}
              </Button>
            ))}
          </div>

          {run && (
            <div className="rounded-md border p-3 text-sm">
              <p className="whitespace-pre-wrap">{run.prompt}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{run.statusLabel}</Badge>
                <span>
                  {(results ?? []).filter((item) => item.status === TEST_DONE).length} /{" "}
                  {run.targetCount ?? run.agentKeys.length} 完了
                </span>
                {run.note && <span>{run.note}</span>}
                {isRunActive(run, results ?? []) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate()}
                  >
                    キャンセル
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {run &&
              (results ?? []).map((result) => (
                <ResultCard key={result.id} run={run} result={result} />
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  PlayCircle,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { formatDateTime } from "@/lib/date-format"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { EVAL_RULES_KEY, listEvalRules } from "@/lib/eval-rules"
import {
  cancelEvalJob,
  EVAL_JOBS_KEY,
  listEvalJobs,
  queueEvalJob,
  SCOPE_OPTIONS,
  SCOPE_PERIOD,
  SCOPE_UNEVALUATED,
  STATUS_DONE,
  STATUS_FAILED,
  STATUS_PENDING,
  STATUS_RUNNING,
  type EvalJob,
} from "@/lib/eval-jobs"
import { listRuleStats, RULE_RESULT_STATS_KEY } from "@/lib/eval-results"

// 実行中のジョブはパイプラインが進めるので、開いている間だけ様子を取りに行く。
const REFRESH_MS = 15_000

function StatusBadge({ job }: { job: EvalJob }) {
  const icon =
    job.status === STATUS_RUNNING ? (
      <Loader2 className="size-3 animate-spin" />
    ) : job.status === STATUS_DONE ? (
      <CheckCircle2 className="size-3" />
    ) : job.status === STATUS_FAILED ? (
      <XCircle className="size-3" />
    ) : (
      <Clock className="size-3" />
    )
  const variant =
    job.status === STATUS_DONE
      ? "default"
      : job.status === STATUS_FAILED
        ? "destructive"
        : job.status === STATUS_RUNNING
          ? "secondary"
          : "outline"
  return (
    <Badge variant={variant} className="gap-1">
      {icon}
      {job.statusLabel}
    </Badge>
  )
}

type WizardStep = "scope" | "period" | "rules" | "review"

const STEP_META: Record<WizardStep, { title: string; description: string }> = {
  scope: { title: "対象範囲を選ぶ", description: "どの会話を評価し直すか選びます。" },
  period: { title: "期間を指定する", description: "評価したい会話の日付範囲を指定します。" },
  rules: { title: "評価ルールを選ぶ", description: "適用するルールを選びます（既定は有効な全ルール）。" },
  review: { title: "内容を確認して依頼する", description: "設定を確認し、間違いなければ依頼を登録します。" },
}

export default function CommandCenter() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [scope, setScope] = useState<number>(SCOPE_UNEVALUATED)
  // null の間は「まだ触っていない」。ルールは後から届くので、既定値はそのときに決める。
  const [picked, setPicked] = useState<string[] | null>(null)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [cancelTarget, setCancelTarget] = useState<EvalJob | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: EVAL_RULES_KEY,
    queryFn: listEvalRules,
  })
  const rules = useMemo(() => rulesData ?? [], [rulesData])
  const enabledRules = useMemo(() => rules.filter((rule) => rule.enabled), [rules])
  const selectedKeys = useMemo(() => {
    const keys = enabledRules.map((rule) => rule.ruleKey)
    if (picked === null) return keys
    const kept = keys.filter((key) => picked.includes(key))
    return kept.length > 0 ? kept : keys
  }, [enabledRules, picked])

  const { data: jobsData, isLoading: jobsLoading, isFetching } = useQuery({
    queryKey: EVAL_JOBS_KEY,
    queryFn: () => listEvalJobs(),
    refetchInterval: REFRESH_MS,
  })
  const jobs = useMemo(() => jobsData ?? [], [jobsData])

  const { data: stats } = useQuery({
    queryKey: RULE_RESULT_STATS_KEY,
    queryFn: listRuleStats,
    staleTime: 60_000,
  })

  const periodIncomplete = scope === SCOPE_PERIOD && !fromDate && !toDate

  // 期間指定のときだけ、その入力ステップを挟む。
  const wizardSteps = useMemo<WizardStep[]>(
    () => (scope === SCOPE_PERIOD ? ["scope", "period", "rules", "review"] : ["scope", "rules", "review"]),
    [scope],
  )
  const currentStep = wizardSteps[Math.min(stepIndex, wizardSteps.length - 1)]
  const currentIndex = wizardSteps.indexOf(currentStep)
  const isFirstStep = currentIndex === 0
  const isLastStep = currentIndex === wizardSteps.length - 1
  const canAdvance =
    currentStep === "period" ? !periodIncomplete : currentStep === "rules" ? selectedKeys.length > 0 : true

  const goNext = () => canAdvance && setStepIndex((index) => Math.min(index + 1, wizardSteps.length - 1))
  const goBack = () => setStepIndex((index) => Math.max(index - 1, 0))

  const queue = useMutation({
    mutationFn: () =>
      queueEvalJob({
        scope,
        ruleKeys: selectedKeys,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
    onSuccess: async () => {
      setPicked(null)
      setStepIndex(0)
      await queryClient.invalidateQueries({ queryKey: EVAL_JOBS_KEY })
    },
  })

  const cancel = useMutation({
    mutationFn: (id: string) => cancelEvalJob(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EVAL_JOBS_KEY })
    },
  })

  // 全部外すと「全ルール」と区別がつかないので、最後の 1 つは外せない。
  const toggleKey = (ruleKey: string) =>
    setPicked(
      selectedKeys.includes(ruleKey)
        ? selectedKeys.length === 1
          ? selectedKeys
          : selectedKeys.filter((value) => value !== ruleKey)
        : [...selectedKeys, ruleKey],
    )

  const selectedScopeOption = SCOPE_OPTIONS.find((option) => option.value === scope)
  const selectedRuleNames = enabledRules
    .filter((rule) => selectedKeys.includes(rule.ruleKey))
    .map((rule) => rule.name)

  if (rulesLoading || jobsLoading) return <LoadingSkeletonList count={4} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">評価コマンドセンター</h1>
        <p className="text-muted-foreground">
          ルールを変えたあと、過去の会話をまとめて評価し直せます。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">再実行を依頼する</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                {wizardSteps.map((step, index) => (
                  <div key={step} className="flex flex-1 items-center gap-1 last:flex-none">
                    <div
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        step === currentStep
                          ? "bg-primary text-primary-foreground"
                          : index < currentIndex
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index < currentIndex ? <Check className="size-3.5" /> : index + 1}
                    </div>
                    {index < wizardSteps.length - 1 && (
                      <div className={`h-px flex-1 ${index < currentIndex ? "bg-primary/40" : "bg-border"}`} />
                    )}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  ステップ {currentIndex + 1}/{wizardSteps.length}
                </p>
                <p className="text-sm font-medium">{STEP_META[currentStep].title}</p>
                <p className="text-xs text-muted-foreground">{STEP_META[currentStep].description}</p>
              </div>
            </div>

            {currentStep === "scope" && (
              <div className="space-y-2">
                {SCOPE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex cursor-pointer gap-2 text-sm">
                    <input
                      type="radio"
                      name="scope"
                      className="mt-1 accent-primary"
                      checked={scope === option.value}
                      onChange={() => setScope(option.value)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {currentStep === "period" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="from-date">開始日</Label>
                  <Input
                    id="from-date"
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="to-date">終了日</Label>
                  <Input
                    id="to-date"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </div>
                {periodIncomplete && (
                  <p className="col-span-2 text-xs text-destructive">
                    開始日・終了日のどちらかは指定してください。
                  </p>
                )}
              </div>
            )}

            {currentStep === "rules" && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  既定では有効なルールをすべて評価します。少なくとも 1 つは選んでください。
                </p>
                <div className="space-y-1.5">
                  {enabledRules.map((rule) => {
                    const checked = selectedKeys.includes(rule.ruleKey)
                    return (
                      <label key={rule.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={checked && selectedKeys.length === 1}
                          onCheckedChange={() => toggleKey(rule.ruleKey)}
                        />
                        <span className="min-w-0 truncate">{rule.name}</span>
                      </label>
                    )
                  })}
                  {enabledRules.length === 0 && (
                    <p className="text-xs text-destructive">有効なルールがありません。</p>
                  )}
                </div>
              </div>
            )}

            {currentStep === "review" && (
              <div className="space-y-4">
                <div className="space-y-3 rounded-md border p-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">対象範囲</span>
                    <p className="font-medium">{selectedScopeOption?.label}</p>
                  </div>
                  {scope === SCOPE_PERIOD && (
                    <div>
                      <span className="text-xs text-muted-foreground">期間</span>
                      <p className="font-medium">
                        {fromDate || "指定なし"} 〜 {toDate || "指定なし"}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-muted-foreground">対象ルール（{selectedRuleNames.length} 件）</span>
                    <p className="font-medium">{selectedRuleNames.join(" / ") || "-"}</p>
                  </div>
                </div>

                <div className="flex gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    評価はこのアプリではなく、定期実行されるパイプラインが行います。依頼は待ち行列に入り、
                    次の実行時に処理されます。
                  </span>
                </div>

                {queue.isError && (
                  <p className="text-sm text-destructive">
                    登録できませんでした: {(queue.error as Error).message}
                  </p>
                )}
                {queue.isSuccess && (
                  <p className="text-sm text-muted-foreground">
                    依頼を登録しました。次回のパイプライン実行で処理されます。
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="outline" onClick={goBack} disabled={isFirstStep || queue.isPending}>
                <ChevronLeft className="mr-1 size-4" />
                戻る
              </Button>
              {isLastStep ? (
                <Button disabled={queue.isPending || enabledRules.length === 0} onClick={() => queue.mutate()}>
                  <PlayCircle className="mr-2 size-4" />
                  {queue.isPending ? "登録中..." : "この内容で依頼する"}
                </Button>
              ) : (
                <Button onClick={goNext} disabled={!canAdvance}>
                  次へ
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">ルールごとの結果</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/rules")}>
                ルールを編集
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">まだ評価結果がありません。</p>
              )}
              {(stats ?? []).map((stat) => (
                <div key={stat.ruleKey} className="min-w-0 space-y-1">
                  <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{stat.ruleName}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      平均 {stat.average?.toFixed(2) ?? "-"} / {stat.count} 件
                    </span>
                  </div>
                  <Progress value={((stat.average ?? 0) / 5) * 100} className="h-1.5" />
                  {stat.lowCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      2 点以下が {stat.lowCount} 件あります
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">実行履歴</CardTitle>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className={isFetching ? "size-3 animate-spin" : "size-3"} />
                自動更新
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground">まだ依頼はありません。</p>
              )}
              {jobs.map((job) => {
                const target = job.targetCount ?? 0
                const done = job.doneCount ?? 0
                return (
                  <div key={job.id} className="min-w-0 space-y-1.5 rounded-md border p-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <StatusBadge job={job} />
                      <span className="text-sm font-medium">{job.scopeLabel}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(job.requestedOn)}
                      </span>
                    </div>
                    {job.ruleKeys && (
                      <p className="truncate text-xs text-muted-foreground">
                        対象ルール: {job.ruleKeys}
                      </p>
                    )}
                    {target > 0 && (
                      <Progress value={Math.min(100, (done / target) * 100)} className="h-1.5" />
                    )}
                    {job.message && (
                      <p className="break-words text-xs text-muted-foreground">{job.message}</p>
                    )}
                    {job.status === STATUS_PENDING && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setCancelTarget(job)}
                      >
                        取り消す
                      </Button>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="この依頼を取り消しますか？"
        description="待機中の依頼を取り消します。既に反映された評価結果はそのまま残ります。"
        confirmLabel="取り消す"
        variant="destructive"
        onConfirm={() => cancelTarget && cancel.mutate(cancelTarget.id)}
      />
    </div>
  )
}

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { EVAL_TURNS_KEY, EMPTY_TURN_FILTER, listEvalTurns, turnsQueryKey, type EvalTurn } from "@/lib/eval-turns"

const STEPS = ["Dataverse から会話を取り込む", "差分を調べる", "画面を更新する"] as const

type Phase = "running" | "done" | "error"

type State = {
  phase: Phase
  step: number
  added: EvalTurn[]
  total: number
  message: string
}

function StepRow({ label, index, state }: { label: string; index: number; state: State }) {
  const isDone = state.step > index || state.phase === "done"
  const isCurrent = state.step === index && state.phase === "running"
  const isFailed = state.step === index && state.phase === "error"

  return (
    <li className="flex items-center gap-2 text-sm">
      {isFailed ? (
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
      ) : isDone ? (
        <Check className="size-4 shrink-0 text-emerald-600" />
      ) : isCurrent ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <span className="size-4 shrink-0 rounded-full border" />
      )}
      <span className={isDone || isCurrent || isFailed ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  )
}

export function SyncButton() {
  const queryClient = useQueryClient()
  const [state, setState] = useState<State | null>(null)
  const [expanded, setExpanded] = useState(false)

  const run = async () => {
    setExpanded(false)
    setState({ phase: "running", step: 0, added: [], total: 0, message: "" })
    try {
      const before = new Set(
        (queryClient.getQueryData<EvalTurn[]>(turnsQueryKey(EMPTY_TURN_FILTER)) ?? []).map(
          (turn) => turn.name,
        ),
      )

      const fresh = await queryClient.fetchQuery({
        queryKey: turnsQueryKey(EMPTY_TURN_FILTER),
        queryFn: () => listEvalTurns(),
        staleTime: 0,
      })

      setState((current) => (current ? { ...current, step: 1 } : current))
      // A first load has nothing to compare against, so everything would look new.
      const added = before.size === 0 ? [] : fresh.filter((turn) => !before.has(turn.name))

      setState((current) =>
        current ? { ...current, step: 2, added, total: fresh.length } : current,
      )
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] !== EVAL_TURNS_KEY[0] ||
          query.queryHash !== JSON.stringify(turnsQueryKey(EMPTY_TURN_FILTER)),
      })

      setState((current) => (current ? { ...current, phase: "done" } : current))
    } catch (error) {
      setState((current) =>
        current
          ? { ...current, phase: "error", message: (error as Error).message ?? "原因不明のエラー" }
          : current,
      )
    }
  }

  const isRunning = state?.phase === "running"

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={run}
        disabled={isRunning}
        aria-label="最新の会話を取り込む"
        title="最新の会話を取り込む"
      >
        <RefreshCw className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
      </Button>

      <Dialog open={state !== null} onOpenChange={(open) => !open && !isRunning && setState(null)}>
        <DialogContent className="sm:max-w-[min(72rem,calc(100vw-4rem))]">
          <DialogHeader>
            <DialogTitle>最新の会話を取り込む</DialogTitle>
            <DialogDescription>
              エージェントは応答するたびに会話を Dataverse へ書き込みます。ここではそれを読み直して、
              前回この画面で見た内容との差分を出します。
            </DialogDescription>
          </DialogHeader>

          {state && (
            <div className="space-y-4">
              <Progress
                value={state.phase === "done" ? 100 : Math.round((state.step / STEPS.length) * 100)}
              />
              <ul className="space-y-2">
                {STEPS.map((label, index) => (
                  <StepRow key={label} label={label} index={index} state={state} />
                ))}
              </ul>

              {state.phase === "error" && (
                <p className="text-sm text-destructive">取り込みに失敗しました: {state.message}</p>
              )}

              {state.phase === "done" && (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                  {state.added.length === 0 ? (
                    <p className="text-muted-foreground">
                      新しい会話はありませんでした（全 {state.total} 件）。
                    </p>
                  ) : (
                    <>
                      <p className="font-medium">{state.added.length} 件の新しい会話を取り込みました</p>
                      <ul className="max-h-64 space-y-1 overflow-y-auto overflow-x-hidden">
                        {(expanded ? state.added : state.added.slice(0, 5)).map((turn) => (
                          <li key={turn.id} className="truncate text-xs text-muted-foreground">
                            {turn.actorLabel}: {turn.query || "(なし)"}
                          </li>
                        ))}
                      </ul>
                      {state.added.length > 5 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setExpanded((current) => !current)}
                        >
                          {expanded ? (
                            <>
                              <ChevronUp className="size-3.5" />
                              折りたたむ
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3.5" />
                              もっと表示（ほか {state.added.length - 5} 件）
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setState(null)} disabled={isRunning}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

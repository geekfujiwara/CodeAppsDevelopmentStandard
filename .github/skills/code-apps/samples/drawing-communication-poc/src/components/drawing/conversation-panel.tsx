import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, CircleCheckBig, Send, Square } from "lucide-react"
import type { DrawingOperation } from "@/conversation/conversation-contract"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkspace } from "@/state/workspace-context"
import { hashDrawing } from "@/drawing/drawing-schema"

const OPERATIONS: { value: DrawingOperation; label: string; hint: string }[] = [
  { value: "review-drawing", label: "図面をレビューする", hint: "寸法規則に照らした指摘を注釈として受け取ります" },
  { value: "propose-dimension-change", label: "寸法変更を提案してもらう", hint: "指摘に対応する寸法値の候補を受け取ります" },
  { value: "explain-drawing", label: "図面の内容を説明してもらう", hint: "候補 JSON ではなく説明文だけを受け取ります" },
]

const QUICK_PROMPTS = [
  "据付に必要な離隔が確保できているか確認してください",
  "この配置で保守作業ができるか指摘してください",
  "寸法の整合が取れていない箇所を挙げてください",
]

const STATUS_STYLE = {
  pending: { label: "Pending（受付待ち）", variant: "outline" as const },
  running: { label: "Running（実行中）", variant: "secondary" as const },
  completed: { label: "Completed（完了）", variant: "default" as const },
  failed: { label: "Failed（失敗）", variant: "destructive" as const },
}

export function ConversationPanel() {
  const { state, dispatch, transport, sendTurn, stopWaiting, busyTurnId } = useWorkspace()
  const [operation, setOperation] = useState<DrawingOperation>("review-drawing")
  const [prompt, setPrompt] = useState(QUICK_PROMPTS[0])
  const [now, setNow] = useState(() => Date.now())

  const busyTurn = state.turns.find((turn) => turn.turnId === busyTurnId) ?? null
  const baseHash = useMemo(() => hashDrawing(state.drawing), [state.drawing])

  useEffect(() => {
    if (!busyTurn) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [busyTurn])

  const elapsedSeconds = busyTurn ? Math.max(0, Math.floor((now - Date.parse(busyTurn.createdAt)) / 1000)) : 0

  return (
    <div className="flex flex-col gap-3" data-tour="conversation-panel">
      <div className="rounded-md border border-border bg-muted p-3">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="[overflow-wrap:anywhere]">{transport.label}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{transport.caution}</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="operation">依頼の種類</Label>
        <Select value={operation} onValueChange={(value) => setOperation(value as DrawingOperation)}>
          <SelectTrigger id="operation" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{OPERATIONS.find((item) => item.value === operation)?.hint}</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="prompt">依頼文</Label>
        <Textarea id="prompt" rows={3} maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="flex flex-wrap gap-1">
          {QUICK_PROMPTS.map((item) => (
            <Button key={item} size="sm" variant="outline" className="h-auto max-w-full whitespace-normal py-1 text-left text-xs" onClick={() => setPrompt(item)}>
              {item}
            </Button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border border-border p-3 text-xs">
        <dt className="min-w-0 text-muted-foreground">会話 ID</dt>
        <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">{state.conversationId}</dd>
        <dt className="min-w-0 text-muted-foreground">編集バージョン</dt>
        <dd className="min-w-0 font-mono">{state.version}</dd>
        <dt className="min-w-0 text-muted-foreground">基準ハッシュ</dt>
        <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">{baseHash}</dd>
        <dt className="min-w-0 text-muted-foreground">対象</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere]">
          {state.selectedAnnotationId ? `注釈 ${state.selectedAnnotationId}` : "図面全体"}
        </dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button data-tour="send-turn" disabled={busyTurnId !== null || prompt.trim() === ""} onClick={() => void sendTurn(operation, prompt)}>
          <Send className="mr-1 h-4 w-4" />
          送信
        </Button>
        {busyTurn && (
          <Button variant="outline" onClick={() => stopWaiting(busyTurn.turnId)}>
            <Square className="mr-1 h-4 w-4" />
            待機を打ち切る
          </Button>
        )}
        {state.selectedAnnotationId && (
          <Button variant="ghost" onClick={() => dispatch({ type: "select-annotation", id: null })}>
            対象を図面全体に戻す
          </Button>
        )}
      </div>

      {busyTurn && (
        <p className="text-xs text-muted-foreground" aria-live="off">
          送信済み。{STATUS_STYLE[busyTurn.status].label} / 経過 <span className="tabular-nums">{elapsedSeconds}</span> 秒。
          下書きはまだ変わっていません。編集すると結果は破棄されます。
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">やり取り（{state.turns.length} 件）</p>
        {state.turns.length === 0 && <p className="text-sm text-muted-foreground">まだ送信していません。</p>}
        <ul className="space-y-2">
          {state.turns.slice(0, 12).map((turn) => (
            <li key={turn.turnId} className="rounded-md border border-border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_STYLE[turn.status].variant} className="max-w-full break-words">
                  {STATUS_STYLE[turn.status].label}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{turn.turnId}</span>
                <span className="text-[11px] text-muted-foreground">v{turn.version}</span>
              </div>
              <p className="mt-1 text-sm [overflow-wrap:anywhere]">{turn.prompt}</p>
              {turn.summary !== "" && <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{turn.summary}</p>}
              {turn.error !== "" && <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{turn.error}</p>}
              {turn.proposalId && (
                <Link to="/revisions" className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline">
                  <CircleCheckBig className="h-3 w-3" />
                  候補の差分を確認する
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

import { useState } from "react"
import { toast } from "sonner"
import { Bot, ClipboardList, Trash2, User } from "lucide-react"
import type { AnnotationStatus } from "@/drawing/drawing-schema"
import { ANNOTATION_STATUSES } from "@/drawing/drawing-schema"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { annotationStatusLabel } from "@/state/workspace"
import { useWorkspace } from "@/state/workspace-context"
import { ASSIGNEES } from "@/config"
import { cn } from "@/lib/utils"

const SEVERITY_LABEL = { info: "情報", minor: "軽微", major: "重大" } as const
const UNASSIGNED = "__unassigned__"

export function AnnotationPanel() {
  const { state, dispatch } = useWorkspace()
  const [comment, setComment] = useState("")
  const annotations = state.drawing.annotations
  const selected = annotations.find((annotation) => annotation.id === state.selectedAnnotationId) ?? null
  const linkedTask = selected ? state.tasks.find((task) => task.annotationId === selected.id) : undefined

  return (
    <div className="flex flex-col gap-3" data-tour="annotation-list">
      <p className="text-xs text-muted-foreground">
        図面をクリックすると注釈を追加できます。AI 由来の注釈は候補を採用したときに追加されます。
      </p>

      {annotations.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">注釈はまだありません。</p>
      )}

      <ul className="space-y-2">
        {annotations.map((annotation, index) => (
          <li key={annotation.id}>
            <button
              type="button"
              onClick={() => dispatch({ type: "select-annotation", id: annotation.id === selected?.id ? null : annotation.id })}
              className={cn(
                "w-full rounded-md border p-2 text-left transition-colors",
                annotation.id === selected?.id ? "border-primary bg-accent-hover" : "border-border hover:bg-accent-hover",
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{annotation.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="outline" className="max-w-full gap-1 break-words">
                      {annotation.source === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {annotation.source === "ai" ? "AI 候補" : "手入力"}
                    </Badge>
                    <Badge variant={annotation.severity === "major" ? "destructive" : "secondary"} className="max-w-full break-words">
                      {SEVERITY_LABEL[annotation.severity]}
                    </Badge>
                    <Badge variant="outline" className="max-w-full break-words">
                      {annotationStatusLabel(annotation.status)}
                    </Badge>
                    {annotation.assignee !== "" && (
                      <Badge variant="outline" className="max-w-full break-words">
                        {annotation.assignee}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor="annotation-title" className="text-xs">
              見出し
            </Label>
            <Input
              id="annotation-title"
              value={selected.title}
              maxLength={120}
              onChange={(event) => dispatch({ type: "update-annotation", id: selected.id, patch: { title: event.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="annotation-body" className="text-xs">
              本文
            </Label>
            <Textarea
              id="annotation-body"
              rows={3}
              maxLength={400}
              value={selected.body}
              onChange={(event) => dispatch({ type: "update-annotation", id: selected.id, patch: { body: event.target.value } })}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">状態</Label>
              <Select
                value={selected.status}
                onValueChange={(value) => dispatch({ type: "update-annotation", id: selected.id, patch: { status: value as AnnotationStatus } })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANNOTATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {annotationStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">担当者</Label>
              <Select
                value={selected.assignee === "" ? UNASSIGNED : selected.assignee}
                onValueChange={(value) =>
                  dispatch({ type: "update-annotation", id: selected.id, patch: { assignee: value === UNASSIGNED ? "" : value } })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>未割当</SelectItem>
                  {ASSIGNEES.map((assignee) => (
                    <SelectItem key={assignee} value={assignee}>
                      {assignee}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="annotation-due" className="text-xs">
                期限
              </Label>
              <Input
                id="annotation-due"
                type="date"
                value={selected.dueDate}
                onChange={(event) => dispatch({ type: "update-annotation", id: selected.id, patch: { dueDate: event.target.value } })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">コメント（{selected.comments.length} 件）</Label>
            <ul className="space-y-1">
              {selected.comments.map((item) => (
                <li key={item.id} className="rounded-md bg-muted p-2 text-xs">
                  <p className="font-medium">{item.author}</p>
                  <p className="[overflow-wrap:anywhere]">{item.body}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={comment} maxLength={400} placeholder="確認事項を書く" onChange={(event) => setComment(event.target.value)} />
              <Button
                variant="outline"
                onClick={() => {
                  if (comment.trim() === "") return
                  dispatch({
                    type: "add-comment",
                    id: selected.id,
                    comment: {
                      id: `c-${selected.comments.length + 1}-${Date.now().toString(36)}`,
                      author: state.drawing.titleBlock.designer || "設計担当",
                      body: comment.trim(),
                      createdAt: new Date().toISOString(),
                    },
                  })
                  setComment("")
                }}
              >
                追加
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={linkedTask !== undefined}
              data-tour="create-task"
              onClick={() => {
                dispatch({
                  type: "create-task",
                  annotationId: selected.id,
                  id: `task-${selected.id}`,
                  createdAt: new Date().toISOString(),
                })
                toast.success("タスクを作成しました")
              }}
            >
              <ClipboardList className="mr-1 h-4 w-4" />
              {linkedTask ? "タスク作成済み" : "タスクにする"}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                dispatch({ type: "remove-annotation", id: selected.id })
                toast.success("注釈を削除しました（Undo で戻せます）")
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              削除
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TASK_STATUSES, TASK_STATUS_LABELS, overdueTasks, type TaskStatus } from "@/state/workspace"
import { useWorkspace } from "@/state/workspace-context"
import { isoDate } from "@/drawing/drawing-factory"
import { ASSIGNEES } from "@/config"

const UNASSIGNED = "__unassigned__"

export default function TasksPage() {
  const { state, dispatch } = useWorkspace()
  const navigate = useNavigate()
  const today = isoDate()
  const overdue = useMemo(() => overdueTasks(state.tasks, today), [state.tasks, today])

  const move = (id: string, status: TaskStatus, direction: -1 | 1) => {
    const index = TASK_STATUSES.indexOf(status) + direction
    if (index < 0 || index >= TASK_STATUSES.length) return
    dispatch({ type: "update-task", id, patch: { status: TASK_STATUSES[index] } })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">タスク</h2>
        <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          注釈から作成したタスクを状態で管理します。担当者は表示名で、アクセス権とは関係ありません。
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="max-w-full break-words">
            全 {state.tasks.length} 件
          </Badge>
          <Badge variant={overdue.length > 0 ? "destructive" : "outline"} className="max-w-full break-words">
            期限超過 {overdue.length} 件
          </Badge>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" data-tour="kanban">
        {TASK_STATUSES.map((status) => {
          const tasks = state.tasks.filter((task) => task.status === status)
          return (
            <section key={status} className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
              <header className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{TASK_STATUS_LABELS[status]}</h3>
                <Badge variant="outline">{tasks.length}</Badge>
              </header>

              {tasks.length === 0 && <p className="text-xs text-muted-foreground">なし</p>}

              {tasks.map((task) => {
                const annotation = state.drawing.annotations.find((item) => item.id === task.annotationId)
                const isOverdue = task.status !== "done" && task.dueDate !== "" && task.dueDate < today
                return (
                  <article key={task.id} className="min-w-0 space-y-2 rounded-md border border-border bg-card p-2">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{task.title}</p>
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      <Badge variant="outline" className="max-w-full break-words">
                        {task.annotationId}
                      </Badge>
                      {isOverdue && (
                        <Badge variant="destructive" className="max-w-full break-words">
                          期限超過
                        </Badge>
                      )}
                      {!annotation && (
                        <Badge variant="secondary" className="max-w-full break-words">
                          注釈が削除済み
                        </Badge>
                      )}
                    </div>

                    <Select
                      value={task.assignee === "" ? UNASSIGNED : task.assignee}
                      onValueChange={(value) => dispatch({ type: "update-task", id: task.id, patch: { assignee: value === UNASSIGNED ? "" : value } })}
                    >
                      <SelectTrigger className="w-full" size="sm">
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

                    <Input
                      type="date"
                      value={task.dueDate}
                      onChange={(event) => dispatch({ type: "update-task", id: task.id, patch: { dueDate: event.target.value } })}
                    />

                    <div className="flex flex-wrap items-center gap-1">
                      <Button size="icon" variant="ghost" aria-label="前の状態へ" disabled={status === TASK_STATUSES[0]} onClick={() => move(task.id, status, -1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="次の状態へ"
                        disabled={status === TASK_STATUSES[TASK_STATUSES.length - 1]}
                        onClick={() => move(task.id, status, 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!annotation}
                        onClick={() => {
                          dispatch({ type: "select-annotation", id: task.annotationId })
                          navigate("/workbench")
                        }}
                      >
                        図面で見る
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="タスクを削除"
                        className="text-destructive"
                        onClick={() => {
                          dispatch({ type: "remove-task", id: task.id })
                          toast.success("タスクを削除しました")
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                )
              })}
            </section>
          )
        })}
      </div>
    </div>
  )
}

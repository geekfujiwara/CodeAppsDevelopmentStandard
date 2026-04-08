import { useState } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FullscreenWrapper } from "@/components/fullscreen-wrapper"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns, FormSection } from "./form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { KanbanColumn } from "./kanban-column"
import { KanbanTaskCard } from "./kanban-task-card"
import { Plus } from "lucide-react"
import { toast } from "sonner"

export interface KanbanTask {
  id: string
  title: string
  description: string
  priority: "high" | "medium" | "low"
  category: "development" | "design" | "testing" | "documentation"
  status: "todo" | "in-progress" | "done"
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState<KanbanTask[]>([
    {
      id: "1",
      title: "Power Apps フォームの実装",
      description: "ユーザー入力フォームのデザインと実装",
      priority: "high",
      category: "development",
      status: "in-progress",
    },
    {
      id: "2",
      title: "認証機能の追加",
      description: "Microsoft Entra ID を使用した認証機能",
      priority: "high",
      category: "development",
      status: "todo",
    },
    {
      id: "3",
      title: "デザインシステムの統一",
      description: "shadcn/ui コンポーネントの統合",
      priority: "medium",
      category: "design",
      status: "in-progress",
    },
    {
      id: "4",
      title: "API 連携のテスト",
      description: "外部 API との接続確認とエラーハンドリング",
      priority: "medium",
      category: "testing",
      status: "todo",
    },
    {
      id: "5",
      title: "ドキュメントの更新",
      description: "README とユーザーガイドの更新",
      priority: "low",
      category: "documentation",
      status: "todo",
    },
    {
      id: "6",
      title: "コードレビュー対応",
      description: "指摘事項の修正と改善",
      priority: "low",
      category: "development",
      status: "done",
    },
    {
      id: "7",
      title: "レスポンシブデザイン対応",
      description: "モバイル・タブレット表示の最適化",
      priority: "medium",
      category: "design",
      status: "done",
    },
  ])

  const [activeId, setActiveId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null)
  const [formData, setFormData] = useState<{
    title: string
    description: string
    priority: "high" | "medium" | "low"
    category: "development" | "design" | "testing" | "documentation"
    status: "todo" | "in-progress" | "done"
  }>({
    title: "",
    description: "",
    priority: "medium",
    category: "development",
    status: "todo",
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const columns = [
    { id: "todo", title: "未着手", status: "todo" as const },
    { id: "in-progress", title: "進行中", status: "in-progress" as const },
    { id: "done", title: "完了", status: "done" as const },
  ]

  // タスクを開く（新規作成または編集）
  const handleOpenTask = (task?: KanbanTask) => {
    if (task) {
      setEditingTask(task)
      setFormData({
        title: task.title,
        description: task.description,
        priority: task.priority,
        category: task.category,
        status: task.status,
      })
    } else {
      setEditingTask(null)
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        category: "development",
        status: "todo",
      })
    }
    setIsModalOpen(true)
  }

  // フォームを閉じる
  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingTask(null)
  }

  // タスクを保存（作成または更新）
  const handleSaveTask = () => {
    if (!formData.title.trim()) {
      toast.error("タイトルを入力してください")
      return
    }

    if (editingTask) {
      // 更新
      setTasks((tasks) =>
        tasks.map((task) =>
          task.id === editingTask.id
            ? { ...task, ...formData }
            : task
        )
      )
      toast.success("タスクを更新しました")
    } else {
      // 新規作成
      const newTask: KanbanTask = {
        id: Date.now().toString(),
        ...formData,
      }
      setTasks((tasks) => [...tasks, newTask])
      toast.success("タスクを作成しました")
    }

    handleCloseModal()
  }

  // 削除確認ダイアログを開く
  const handleOpenDeleteDialog = () => {
    setIsDeleteDialogOpen(true)
  }

  // タスクを削除
  const handleConfirmDelete = () => {
    if (!editingTask) return

    setTasks((tasks) => tasks.filter((task) => task.id !== editingTask.id))
    toast.success("タスクを削除しました")
    setIsDeleteDialogOpen(false)
    handleCloseModal()
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTask = tasks.find((task) => task.id === activeId)
    if (!activeTask) return

    // ドロップ先がカラムかタスクかを判定
    const overColumn = columns.find((col) => col.id === overId)
    const overTask = tasks.find((task) => task.id === overId)

    if (overColumn) {
      // カラムにドロップした場合
      setTasks((tasks) =>
        tasks.map((task) =>
          task.id === activeId ? { ...task, status: overColumn.status } : task
        )
      )
    } else if (overTask) {
      // タスクの上にドロップした場合
      const activeIndex = tasks.findIndex((task) => task.id === activeId)
      const overIndex = tasks.findIndex((task) => task.id === overId)

      if (activeTask.status !== overTask.status) {
        // 異なるカラム間の移動
        setTasks((tasks) => {
          const newTasks = tasks.map((task) =>
            task.id === activeId ? { ...task, status: overTask.status } : task
          )
          const newActiveIndex = newTasks.findIndex((task) => task.id === activeId)
          const newOverIndex = newTasks.findIndex((task) => task.id === overId)
          return arrayMove(newTasks, newActiveIndex, newOverIndex)
        })
      } else {
        // 同じカラム内での並び替え
        setTasks((tasks) => arrayMove(tasks, activeIndex, overIndex))
      }
    }
  }

  const activeTask = activeId ? tasks.find((task) => task.id === activeId) : null

  return (
    <FullscreenWrapper showHeader={false}>
      {({ isFullscreen: _isFullscreen, FullscreenButton }) => (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">カンバンボード</CardTitle>
              <CardDescription>
                ドラッグ＆ドロップでタスクのステータスを変更できます。カードをクリックして編集できます。
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <FullscreenButton />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => handleOpenTask()} size="sm" variant="default" className="gap-2 h-9">
              <Plus className="h-4 w-4" />
              新規タスク
            </Button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {columns.map((column) => {
                const columnTasks = tasks.filter((task) => task.status === column.status)
                return (
                  <KanbanColumn 
                    key={column.id} 
                    column={column} 
                    tasks={columnTasks} 
                    onTaskClick={handleOpenTask}
                  />
                )
              })}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="rotate-3 opacity-80">
                  <KanbanTaskCard task={activeTask} isDragging />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </CardContent>
      </Card>

      {/* タスク編集・作成モーダル */}
      <FormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={editingTask ? "タスクを編集" : "新規タスク"}
        description={editingTask ? "タスクの内容を編集できます" : "新しいタスクを作成します"}
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <div>
              {editingTask && (
                <Button
                  variant="destructive"
                  onClick={handleOpenDeleteDialog}
                >
                  タスクを削除
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleCloseModal}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleSaveTask}
                className="gap-2"
              >
                <span className="text-lg">💾</span>
                {editingTask ? "更新" : "作成"}
              </Button>
            </div>
          </div>
        }
      >
        <FormSection>
          <FormColumns columns={1}>
            <div className="space-y-2">
              <Label htmlFor="title">タイトル *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="タスクのタイトルを入力"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="タスクの詳細を入力"
                rows={4}
              />
            </div>
          </FormColumns>
        </FormSection>

        <FormSection title="詳細設定">
          <FormColumns columns={3}>
            <div className="space-y-2">
              <Label htmlFor="status">ステータス</Label>
              <Select
                value={formData.status}
                onValueChange={(value: "todo" | "in-progress" | "done") =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">未着手</SelectItem>
                  <SelectItem value="in-progress">進行中</SelectItem>
                  <SelectItem value="done">完了</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">優先度</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: "high" | "medium" | "low") =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">カテゴリ</Label>
              <Select
                value={formData.category}
                onValueChange={(value: "development" | "design" | "testing" | "documentation") =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">開発</SelectItem>
                  <SelectItem value="design">デザイン</SelectItem>
                  <SelectItem value="testing">テスト</SelectItem>
                  <SelectItem value="documentation">ドキュメント</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FormColumns>
        </FormSection>
      </FormModal>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="タスクを削除しますか?"
        description={
          editingTask
            ? `「${editingTask.title}」を削除します。この操作は取り消せません。`
            : "このタスクを削除します。この操作は取り消せません。"
        }
        confirmLabel="削除"
        cancelLabel="キャンセル"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
      )}
    </FullscreenWrapper>
  )
}

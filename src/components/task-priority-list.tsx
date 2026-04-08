import { useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns, FormSection } from "./form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FullscreenWrapper } from "./fullscreen-wrapper"
import { GripVertical, Plus } from "lucide-react"
import { toast } from "sonner"

interface Task {
  id: string
  title: string
  description?: string
  priority: "high" | "medium" | "low"
  status: string
  category: "development" | "design" | "testing" | "documentation"
}

interface SortableTaskItemProps {
  task: Task
  onClick?: () => void
}

function SortableTaskItem({ task, onClick }: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const priorityColors = {
    high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  }

  const categoryConfig = {
    development: { label: "開発", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
    design: { label: "デザイン", color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300" },
    testing: { label: "テスト", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    documentation: { label: "ドキュメント", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
  }

  const statusColors: Record<string, string> = {
    "未着手": "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
    "進行中": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "完了": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    "保留": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  }

  const getStatusColor = (status: string) => {
    return statusColors[status] || "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>
      <div className="flex-1 space-y-2">
        <p className="font-medium text-foreground">{task.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={getStatusColor(task.status)} variant="secondary">
            {task.status}
          </Badge>
          <Badge className={categoryConfig[task.category].color}>
            {categoryConfig[task.category].label}
          </Badge>
          <Badge className={priorityColors[task.priority]}>
            {task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
          </Badge>
        </div>
      </div>
    </div>
  )
}

export function TaskPriorityList() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", title: "Power Apps フォームの実装", description: "ユーザー入力フォームのデザインと実装", priority: "high", status: "進行中", category: "development" },
    { id: "2", title: "認証機能の追加", description: "Microsoft Entra ID を使用した認証機能", priority: "high", status: "未着手", category: "development" },
    { id: "3", title: "デザインシステムの統一", description: "shadcn/ui コンポーネントの統合", priority: "medium", status: "進行中", category: "design" },
    { id: "4", title: "API 連携のテスト", description: "外部 API との接続確認とエラーハンドリング", priority: "medium", status: "未着手", category: "testing" },
    { id: "5", title: "ドキュメントの更新", description: "README とユーザーガイドの更新", priority: "low", status: "未着手", category: "documentation" },
    { id: "6", title: "コードレビュー対応", description: "指摘事項の修正と改善", priority: "low", status: "未着手", category: "development" },
  ])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formData, setFormData] = useState<{
    title: string
    description: string
    priority: "high" | "medium" | "low"
    status: string
    category: "development" | "design" | "testing" | "documentation"
  }>({
    title: "",
    description: "",
    priority: "medium",
    status: "未着手",
    category: "development",
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // タスクを開く（新規作成または編集）
  const handleOpenTask = (task?: Task) => {
    if (task) {
      setEditingTask(task)
      setFormData({
        title: task.title,
        description: task.description || "",
        priority: task.priority,
        status: task.status,
        category: task.category,
      })
    } else {
      setEditingTask(null)
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        status: "未着手",
        category: "development",
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
      const newTask: Task = {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)

        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  return (
    <FullscreenWrapper showHeader={false}>
      {({ isFullscreen: _isFullscreen, FullscreenButton }) => (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">タスク優先順位管理</CardTitle>
              <CardDescription>
                ドラッグ＆ドロップでタスクの優先順位を変更できます。カードをクリックして編集できます。
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
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {tasks.map((task) => (
                  <SortableTaskItem 
                    key={task.id} 
                    task={task} 
                    onClick={() => handleOpenTask(task)}
                  />
                ))}
              </div>
            </SortableContext>
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
              <Input
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                placeholder="ステータスを入力"
              />
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

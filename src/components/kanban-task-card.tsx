import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Badge } from "@/components/ui/badge"
import { GripVertical } from "lucide-react"
import type { KanbanTask } from "@/components/kanban-board"

interface KanbanTaskCardProps {
  task: KanbanTask
  isDragging?: boolean
  onClick?: () => void
}

export function KanbanTaskCard({ task, isDragging = false, onClick }: KanbanTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
    isOver,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging || isDragging ? 0.5 : 1,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        isOver ? "shadow-lg ring-2 ring-primary/50 scale-[1.02] bg-accent/50" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-foreground">{task.title}</p>
            <p className="text-sm text-muted-foreground">{task.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={categoryConfig[task.category].color}>
              {categoryConfig[task.category].label}
            </Badge>
            <Badge className={priorityColors[task.priority]}>
              {task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

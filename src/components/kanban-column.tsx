import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { KanbanTaskCard } from "./kanban-task-card"
import type { KanbanTask } from "./kanban-board"

interface Column {
  id: string
  title: string
  status: "todo" | "in-progress" | "done"
}

interface KanbanColumnProps {
  column: Column
  tasks: KanbanTask[]
  onTaskClick?: (task: KanbanTask) => void
}

export function KanbanColumn({ column, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  const statusColors = {
    "todo": "bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700",
    "in-progress": "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800",
    "done": "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800",
  }

  const dropIndicatorColors = {
    "todo": "shadow-gray-400/50 dark:shadow-gray-600/50 bg-gray-200/50 dark:bg-gray-800/50",
    "in-progress": "shadow-blue-400/50 dark:shadow-blue-600/50 bg-blue-200/50 dark:bg-blue-800/50",
    "done": "shadow-green-400/50 dark:shadow-green-600/50 bg-green-200/50 dark:bg-green-800/50",
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border-2 ${statusColors[column.status]} p-4 min-h-[400px] transition-all ${
        isOver ? `shadow-lg ${dropIndicatorColors[column.status]} scale-[1.02]` : ""
      }`}
    >
      <div className="mb-4">
        <h3 className="font-semibold text-lg text-foreground">{column.title}</h3>
        <p className="text-sm text-muted-foreground">{tasks.length} タスク</p>
      </div>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 flex-1">
          {tasks.map((task) => (
            <KanbanTaskCard 
              key={task.id} 
              task={task} 
              onClick={() => onTaskClick?.(task)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

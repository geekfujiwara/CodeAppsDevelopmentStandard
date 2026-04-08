/**
 * プロジェクト管理コンポーネント共通型定義
 */

export type TaskPriority = "high" | "medium" | "low"
export type TaskStatus = "todo" | "in-progress" | "done" | "未着手" | "進行中" | "完了"
export type TaskCategory = "development" | "design" | "testing" | "documentation"

/**
 * 基本タスクインターフェース
 */
export interface BaseTask {
  id: string
  title: string
  description?: string
  priority: TaskPriority
  category: TaskCategory
}

/**
 * 優先順位リスト用タスク
 */
export interface PriorityTask extends BaseTask {
  status: string
}

/**
 * カンバンボード用タスク
 */
export interface KanbanTask extends BaseTask {
  status: "todo" | "in-progress" | "done"
}

/**
 * ガントチャート用タスク
 */
export interface GanttTask extends BaseTask {
  startDate: string
  endDate: string
  progress: number
  status: "未着手" | "進行中" | "完了"
  assignee?: string
  color?: string
  children?: GanttTask[]
  isCollapsed?: boolean
}

/**
 * タスク形式変換ユーティリティ
 */
export class TaskConverter {
  /**
   * 基本タスクからカンバンタスクに変換
   */
  static toKanbanTask(task: BaseTask, status: KanbanTask["status"] = "todo"): KanbanTask {
    return {
      ...task,
      status,
    }
  }

  /**
   * 基本タスクから優先順位タスクに変換
   */
  static toPriorityTask(task: BaseTask, status: string = "未着手"): PriorityTask {
    return {
      ...task,
      status,
    }
  }

  /**
   * 基本タスクからガントタスクに変換
   */
  static toGanttTask(
    task: BaseTask,
    dates: { startDate: string; endDate: string },
    options?: {
      progress?: number
      status?: GanttTask["status"]
      assignee?: string
      color?: string
    }
  ): GanttTask {
    return {
      ...task,
      ...dates,
      progress: options?.progress ?? 0,
      status: options?.status ?? "未着手",
      assignee: options?.assignee,
      color: options?.color,
    }
  }

  /**
   * カンバンステータスを日本語ステータスに変換
   */
  static kanbanToJapaneseStatus(status: KanbanTask["status"]): "未着手" | "進行中" | "完了" {
    const map: Record<KanbanTask["status"], "未着手" | "進行中" | "完了"> = {
      "todo": "未着手",
      "in-progress": "進行中",
      "done": "完了",
    }
    return map[status]
  }

  /**
   * 日本語ステータスをカンバンステータスに変換
   */
  static japaneseToKanbanStatus(status: "未着手" | "進行中" | "完了"): KanbanTask["status"] {
    const map: Record<"未着手" | "進行中" | "完了", KanbanTask["status"]> = {
      "未着手": "todo",
      "進行中": "in-progress",
      "完了": "done",
    }
    return map[status]
  }
}

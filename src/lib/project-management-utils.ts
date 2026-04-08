import type { TaskPriority, TaskCategory } from "./project-management-types"

/**
 * プロジェクト管理関連のユーティリティ関数
 */

/**
 * 優先度の表示名を取得
 */
export function getPriorityLabel(priority: TaskPriority): string {
  const labels: Record<TaskPriority, string> = {
    high: "高",
    medium: "中",
    low: "低",
  }
  return labels[priority]
}

/**
 * 優先度のカラークラスを取得
 */
export function getPriorityColorClass(priority: TaskPriority): string {
  const colors: Record<TaskPriority, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  }
  return colors[priority]
}

/**
 * カテゴリの設定を取得
 */
export function getCategoryConfig(category: TaskCategory): { label: string; color: string } {
  const config: Record<TaskCategory, { label: string; color: string }> = {
    development: {
      label: "開発",
      color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    },
    design: {
      label: "デザイン",
      color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
    },
    testing: {
      label: "テスト",
      color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    },
    documentation: {
      label: "ドキュメント",
      color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
    },
  }
  return config[category]
}

/**
 * ステータスのカラークラスを取得
 */
export function getStatusColorClass(status: string): string {
  const statusLower = status.toLowerCase()

  if (statusLower.includes("完了") || statusLower === "done") {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
  }
  if (statusLower.includes("進行中") || statusLower === "in-progress") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
  }
  if (statusLower.includes("未着手") || statusLower === "todo") {
    return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
  }
  if (statusLower.includes("保留") || statusLower === "blocked") {
    return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
  }

  return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300"
}

/**
 * 日付範囲から期間を計算（日数）
 */
export function calculateDuration(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * 日付を表示用フォーマットに変換
 */
export function formatDate(dateString: string, format: "short" | "long" = "short"): string {
  const date = new Date(dateString)
  
  if (format === "short") {
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  }
  
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

/**
 * 進捗率から表示テキストを生成
 */
export function formatProgress(progress: number): string {
  return `${Math.round(progress)}%`
}

/**
 * タスクの緊急度を計算（期日までの日数に基づく）
 */
export function calculateUrgency(endDate: string): "urgent" | "warning" | "normal" {
  const end = new Date(endDate)
  const now = new Date()
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysLeft < 0) return "urgent" // 期限切れ
  if (daysLeft <= 3) return "urgent" // 3日以内
  if (daysLeft <= 7) return "warning" // 7日以内
  return "normal"
}

/**
 * タスクを優先度でソート
 */
export function sortByPriority<T extends { priority: TaskPriority }>(tasks: T[]): T[] {
  const priorityOrder: Record<TaskPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  }
  
  return [...tasks].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

/**
 * タスクをカテゴリでグループ化
 */
export function groupByCategory<T extends { category: TaskCategory }>(tasks: T[]): Record<TaskCategory, T[]> {
  const grouped: Record<TaskCategory, T[]> = {
    development: [],
    design: [],
    testing: [],
    documentation: [],
  }

  tasks.forEach((task) => {
    grouped[task.category].push(task)
  })

  return grouped
}

/**
 * タスクをステータスでグループ化
 */
export function groupByStatus<T extends { status: string }>(tasks: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {}

  tasks.forEach((task) => {
    if (!grouped[task.status]) {
      grouped[task.status] = []
    }
    grouped[task.status].push(task)
  })

  return grouped
}

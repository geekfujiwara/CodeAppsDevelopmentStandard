/**
 * プロジェクト管理コンポーネントの統合エクスポート
 *
 * このファイルは、プロジェクト管理関連のコンポーネント、型、ユーティリティを
 * 一箇所にまとめて提供します。
 *
 * @example
 * ```typescript
 * import {
 *   KanbanBoard,
 *   TaskPriorityList,
 *   GanttChart,
 *   TaskConverter,
 *   type KanbanTask,
 * } from '@/components/project-management-components'
 *
 * // カンバンボードの使用
 * function MyProject() {
 *   const [tasks, setTasks] = useState<KanbanTask[]>([...])
 *   return <KanbanBoard initialTasks={tasks} />
 * }
 *
 * // タスクの変換
 * const priorityTask = { id: '1', title: 'タスク', priority: 'high' as const, category: 'development' as const }
 * const kanbanTask = TaskConverter.toKanbanTask(priorityTask, 'todo')
 * const ganttTask = TaskConverter.toGanttTask(priorityTask, {
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31',
 * })
 * ```
 */

// コンポーネントのエクスポート
export { KanbanBoard } from "./kanban-board"
export { KanbanColumn } from "./kanban-column"
export { KanbanTaskCard } from "./kanban-task-card"
export { TaskPriorityList } from "./task-priority-list"
export { GanttChart } from "./gantt-chart"

// 型定義のエクスポート
export type {
  TaskPriority,
  TaskStatus,
  TaskCategory,
  BaseTask,
  PriorityTask,
  KanbanTask,
  GanttTask,
} from "../lib/project-management-types"

// ユーティリティのエクスポート
export { TaskConverter } from "../lib/project-management-types"
export {
  getPriorityLabel,
  getPriorityColorClass,
  getCategoryConfig,
  getStatusColorClass,
  calculateDuration,
  formatDate,
  formatProgress,
  calculateUrgency,
  sortByPriority,
  groupByCategory,
  groupByStatus,
} from "../lib/project-management-utils"

/**
 * プロジェクト管理コンポーネントの使用例
 *
 * ## 基本的な使い方
 *
 * ### 1. カンバンボード
 * ```typescript
 * import { KanbanBoard, type KanbanTask } from '@/components/project-management-components'
 *
 * const initialTasks: KanbanTask[] = [
 *   {
 *     id: '1',
 *     title: 'タスク1',
 *     description: '説明',
 *     priority: 'high',
 *     category: 'development',
 *     status: 'todo',
 *   },
 * ]
 *
 * function MyKanban() {
 *   return <KanbanBoard initialTasks={initialTasks} />
 * }
 * ```
 *
 * ### 2. 優先順位リスト
 * ```typescript
 * import { TaskPriorityList, type PriorityTask } from '@/components/project-management-components'
 *
 * const initialTasks: PriorityTask[] = [
 *   {
 *     id: '1',
 *     title: 'タスク1',
 *     description: '説明',
 *     priority: 'high',
 *     category: 'development',
 *     status: '未着手',
 *   },
 * ]
 *
 * function MyPriorityList() {
 *   return <TaskPriorityList />
 * }
 * ```
 *
 * ### 3. ガントチャート
 * ```typescript
 * import { GanttChart, type GanttTask } from '@/components/project-management-components'
 *
 * const initialTasks: GanttTask[] = [
 *   {
 *     id: '1',
 *     title: 'タスク1',
 *     description: '説明',
 *     priority: 'high',
 *     category: 'development',
 *     startDate: '2024-01-01',
 *     endDate: '2024-01-31',
 *     progress: 50,
 *     status: '進行中',
 *   },
 * ]
 *
 * function MyGantt() {
 *   return <GanttChart />
 * }
 * ```
 *
 * ## タスク変換の例
 *
 * ### カンバンタスクから優先順位タスクへ
 * ```typescript
 * import { TaskConverter, type KanbanTask } from '@/components/project-management-components'
 *
 * const kanbanTask: KanbanTask = {
 *   id: '1',
 *   title: 'タスク',
 *   priority: 'high',
 *   category: 'development',
 *   status: 'in-progress',
 * }
 *
 * // 英語ステータスを日本語に変換
 * const japaneseStatus = TaskConverter.kanbanToJapaneseStatus(kanbanTask.status)
 * const priorityTask = TaskConverter.toPriorityTask(kanbanTask, japaneseStatus)
 * ```
 *
 * ### 優先順位タスクからガントタスクへ
 * ```typescript
 * import { TaskConverter, type PriorityTask } from '@/components/project-management-components'
 *
 * const priorityTask: PriorityTask = {
 *   id: '1',
 *   title: 'タスク',
 *   priority: 'high',
 *   category: 'development',
 *   status: '未着手',
 * }
 *
 * const ganttTask = TaskConverter.toGanttTask(priorityTask, {
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31',
 *   progress: 0,
 *   status: priorityTask.status,
 * })
 * ```
 *
 * ## ユーティリティ関数の使用例
 *
 * ### カラークラスの取得
 * ```typescript
 * import { getPriorityColorClass, getStatusColorClass } from '@/components/project-management-components'
 *
 * const priorityClass = getPriorityColorClass('high') // "bg-red-100 text-red-800..."
 * const statusClass = getStatusColorClass('完了') // "bg-green-100 text-green-800..."
 * ```
 *
 * ### タスクのソートとグループ化
 * ```typescript
 * import { sortByPriority, groupByCategory } from '@/components/project-management-components'
 *
 * const sorted = sortByPriority(tasks) // 優先度順にソート
 * const grouped = groupByCategory(tasks) // カテゴリでグループ化
 * ```
 */

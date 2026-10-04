import type { Task } from "@/services/construction-service"

export type TaskState = "done" | "active" | "delayed" | "planned"

const DAY = 86_400_000

function parseDate(value: string): number | undefined {
  if (!value) return undefined
  const time = new Date(value.slice(0, 10) + "T00:00:00").getTime()
  return Number.isNaN(time) ? undefined : time
}

/** 予定日から今日時点で期待される進捗率（0〜100） */
export function expectedProgress(task: Task, today = new Date()): number {
  const start = parseDate(task.plannedStart)
  const end = parseDate(task.plannedEnd)
  if (start === undefined || end === undefined || end <= start) return task.progress
  const ratio = (today.getTime() - start) / (end - start)
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100)
}

/** 予定より 8 ポイント以上遅れている、または阻害要因が登録されている作業を遅延とみなす */
export function taskState(task: Task, today = new Date()): TaskState {
  if (task.progress >= 100) return "done"
  const behind = expectedProgress(task, today) - task.progress >= 8
  if (task.progress > 0) return behind || task.issue ? "delayed" : "active"
  return behind ? "delayed" : "planned"
}

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  done: "施工済",
  active: "施工中",
  delayed: "遅延",
  planned: "未着手",
}

export const TASK_STATE_COLOR: Record<TaskState, string> = {
  done: "#22c55e",
  active: "#06b6d4",
  delayed: "#f59e0b",
  planned: "#94a3b8",
}

export function daysBetween(from: string, to: string): number {
  const start = parseDate(from)
  const end = parseDate(to)
  if (start === undefined || end === undefined) return 0
  return Math.round((end - start) / DAY)
}

/** 工程順（${PUBLISHER_PREFIX}_sequence）→ 予定開始日の順に並べる */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.plannedStart.localeCompare(b.plannedStart))
}

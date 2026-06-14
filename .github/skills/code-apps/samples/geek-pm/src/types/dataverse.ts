// ── Project ──────────────────────────────────────────────────────────────────
// ${P}_projectid        primary key
// ${P}_name             プロジェクト名 (primary column)
// ${P}_description      説明 (Memo)
// ${P}_start_date       開始日 (DateTime DateOnly)
// ${P}_end_date         終了日 (DateTime DateOnly)
// ${P}_status           ステータス (Picklist)
// ${P}_priority         優先度 (Picklist)
// ${P}_owner            オーナー (String)
// ${P}_department       部門 (String)
// ${P}_notes            備考 (Memo)

export type ProjectStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  100000000: "計画中",
  100000001: "進行中",
  100000002: "保留",
  100000003: "完了",
  100000004: "中止",
}
export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-green-100 text-green-800",
  100000002: "bg-yellow-100 text-yellow-800",
  100000003: "bg-gray-100 text-gray-800",
  100000004: "bg-red-100 text-red-800",
}
export const PROJECT_STATUS_OPTIONS = [
  { value: 100000000, label: "計画中" },
  { value: 100000001, label: "進行中" },
  { value: 100000002, label: "保留" },
  { value: 100000003, label: "完了" },
  { value: 100000004, label: "中止" },
]

// ── Priority (shared by Project and Task) ────────────────────────────────────
export type Priority = 100000000 | 100000001 | 100000002 | 100000003
export const PRIORITY_LABEL: Record<Priority, string> = {
  100000000: "低",
  100000001: "中",
  100000002: "高",
  100000003: "緊急",
}
export const PRIORITY_COLOR: Record<Priority, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-700",
  100000002: "bg-orange-100 text-orange-700",
  100000003: "bg-red-100 text-red-700",
}
export const PRIORITY_OPTIONS = [
  { value: 100000000, label: "低" },
  { value: 100000001, label: "中" },
  { value: 100000002, label: "高" },
  { value: 100000003, label: "緊急" },
]

// ── Task ─────────────────────────────────────────────────────────────────────
// ${P}_taskid           primary key
// ${P}_name             タスク名 (primary column)
// ${P}_project_id       プロジェクトルックアップ
// ${P}_description      説明
// ${P}_assignee         担当者
// ${P}_start_date       開始日
// ${P}_due_date         期限
// ${P}_completed_date   完了日
// ${P}_status           ステータス (Picklist)
// ${P}_priority         優先度 (Picklist)
// ${P}_progress         進捗率 (Integer 0-100)
// ${P}_notes            備考

export type TaskStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  100000000: "未着手",
  100000001: "進行中",
  100000002: "完了",
  100000003: "中止",
  100000004: "ブロック中",
}
export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-red-100 text-red-800",
  100000004: "bg-purple-100 text-purple-800",
}
export const TASK_STATUS_OPTIONS = [
  { value: 100000000, label: "未着手" },
  { value: 100000001, label: "進行中" },
  { value: 100000002, label: "完了" },
  { value: 100000003, label: "中止" },
  { value: 100000004, label: "ブロック中" },
]

// ── Member ───────────────────────────────────────────────────────────────────
// ${P}_memberid         primary key
// ${P}_name             メンバー名 (primary column)
// ${P}_project_id       プロジェクトルックアップ
// ${P}_role             役割
// ${P}_email            メール
// ${P}_join_date        参加日
// ${P}_notes            備考

// ── Entity types ─────────────────────────────────────────────────────────────
export type Project = Record<string, unknown>
export type Task = Record<string, unknown>
export type Member = Record<string, unknown>

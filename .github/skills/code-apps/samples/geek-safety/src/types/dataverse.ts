export type Severity = 100000000 | 100000001 | 100000002 | 100000003
export const SEVERITY_LABEL: Record<Severity, string> = {
  100000000: "ヒヤリハット",
  100000001: "軽微",
  100000002: "重大",
  100000003: "重大災害",
}
export const SEVERITY_COLOR: Record<Severity, string> = {
  100000000: "bg-yellow-100 text-yellow-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-red-100 text-red-800",
  100000003: "bg-red-600 text-white",
}
export const SEVERITY_OPTIONS = [
  { value: 100000000, label: "ヒヤリハット" },
  { value: 100000001, label: "軽微" },
  { value: 100000002, label: "重大" },
  { value: 100000003, label: "重大災害" },
]
export const SEVERITY_SERIOUS = [100000002, 100000003]

export type IncidentStatus = 100000000 | 100000001 | 100000002
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  100000000: "報告済み",
  100000001: "対応中",
  100000002: "是正完了",
}
export const INCIDENT_STATUS_COLOR: Record<IncidentStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
}
export const INCIDENT_STATUS_OPTIONS = [
  { value: 100000000, label: "報告済み" },
  { value: 100000001, label: "対応中" },
  { value: 100000002, label: "是正完了" },
]
/** 矢羽（StagePath）表示用 */
export const INCIDENT_STAGE_PATH_ITEMS = [
  { value: 100000000, label: "報告済み" },
  { value: 100000001, label: "対応中" },
  { value: 100000002, label: "是正完了" },
]
export const INCIDENT_STATUS_RESOLVED = 100000002

export type ActionStatus = 100000000 | 100000001 | 100000002
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  100000000: "未着手",
  100000001: "対応中",
  100000002: "完了",
}
export const ACTION_STATUS_COLOR: Record<ActionStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
}
export const ACTION_STATUS_OPTIONS = [
  { value: 100000000, label: "未着手" },
  { value: 100000001, label: "対応中" },
  { value: 100000002, label: "完了" },
]
export const ACTION_STATUS_COMPLETED = 100000002

export type Incident = Record<string, unknown>
export type CorrectiveAction = Record<string, unknown>

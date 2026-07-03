export type RequestStage = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const REQUEST_STAGE_LABEL: Record<RequestStage, string> = {
  100000000: "下書き",
  100000001: "課長承認待ち",
  100000002: "部長承認待ち",
  100000003: "承認済み",
  100000004: "却下",
}
export const REQUEST_STAGE_COLOR: Record<RequestStage, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-indigo-100 text-indigo-800",
  100000003: "bg-green-100 text-green-800",
  100000004: "bg-red-100 text-red-800",
}
export const REQUEST_STAGE_OPTIONS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "課長承認待ち" },
  { value: 100000002, label: "部長承認待ち" },
  { value: 100000003, label: "承認済み" },
  { value: 100000004, label: "却下" },
]
/** 矢羽（StagePath）表示用: 却下は negativeValue として末尾に表示 */
export const STAGE_PATH_ITEMS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "課長承認" },
  { value: 100000002, label: "部長承認" },
  { value: 100000003, label: "承認済み" },
  { value: 100000004, label: "却下" },
]
export const STAGE_REJECTED = 100000004
export const PENDING_STAGES = [100000001, 100000002]

export type Priority = 100000000 | 100000001 | 100000002 | 100000003
export const PRIORITY_LABEL: Record<Priority, string> = {
  100000000: "低", 100000001: "中", 100000002: "高", 100000003: "緊急",
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

export type Decision = 100000000 | 100000001 | 100000002
export const DECISION_LABEL: Record<Decision, string> = {
  100000000: "承認", 100000001: "差戻し", 100000002: "却下",
}
export const DECISION_COLOR: Record<Decision, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-red-100 text-red-800",
}

export type ApprovalRequest = Record<string, unknown>
export type ApprovalStep = Record<string, unknown>

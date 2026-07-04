export type EventStatus = 100000000 | 100000001 | 100000002 | 100000003
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  100000000: "募集中",
  100000001: "満席",
  100000002: "終了",
  100000003: "中止",
}
export const EVENT_STATUS_COLOR: Record<EventStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-gray-100 text-gray-600",
  100000003: "bg-red-100 text-red-800",
}
export const EVENT_STATUS_OPTIONS = [
  { value: 100000000, label: "募集中" },
  { value: 100000001, label: "満席" },
  { value: 100000002, label: "終了" },
  { value: 100000003, label: "中止" },
]
/** 矢羽（StagePath）表示用: 中止は negativeValue として末尾に表示 */
export const EVENT_STAGE_PATH_ITEMS = [
  { value: 100000000, label: "募集中" },
  { value: 100000001, label: "満席" },
  { value: 100000002, label: "終了" },
  { value: 100000003, label: "中止" },
]
export const EVENT_STATUS_OPEN = 100000000
export const EVENT_STATUS_CANCELLED = 100000003

export type RegistrationStatus = 100000000 | 100000001 | 100000002 | 100000003
export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  100000000: "登録",
  100000001: "出席",
  100000002: "欠席",
  100000003: "キャンセル",
}
export const REGISTRATION_STATUS_COLOR: Record<RegistrationStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-green-100 text-green-800",
  100000002: "bg-orange-100 text-orange-700",
  100000003: "bg-gray-100 text-gray-600",
}
export const REGISTRATION_STATUS_OPTIONS = [
  { value: 100000000, label: "登録" },
  { value: 100000001, label: "出席" },
  { value: 100000002, label: "欠席" },
  { value: 100000003, label: "キャンセル" },
]
export const REGISTRATION_ATTENDED = 100000001
export const REGISTRATION_CANCELLED = 100000003
/** 定員カウント対象（キャンセル以外） */
export const REGISTRATION_ACTIVE_STATUSES = [100000000, 100000001, 100000002]

export type Event = Record<string, unknown>
export type Registration = Record<string, unknown>

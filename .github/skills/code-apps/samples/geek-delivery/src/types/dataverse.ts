export type VehicleStatus = 100000000 | 100000001 | 100000002
export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  100000000: "稼働可",
  100000001: "運行中",
  100000002: "整備中",
}
export const VEHICLE_STATUS_COLOR: Record<VehicleStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-orange-100 text-orange-700",
}
export const VEHICLE_STATUS_OPTIONS = [
  { value: 100000000, label: "稼働可" },
  { value: 100000001, label: "運行中" },
  { value: 100000002, label: "整備中" },
]

export type RouteStatus = 100000000 | 100000001 | 100000002
export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = {
  100000000: "計画",
  100000001: "運行中",
  100000002: "完了",
}
export const ROUTE_STATUS_COLOR: Record<RouteStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
}
export const ROUTE_STATUS_OPTIONS = [
  { value: 100000000, label: "計画" },
  { value: 100000001, label: "運行中" },
  { value: 100000002, label: "完了" },
]
/** 矢羽（StagePath）表示用 */
export const ROUTE_STAGE_PATH_ITEMS = [
  { value: 100000000, label: "計画" },
  { value: 100000001, label: "運行中" },
  { value: 100000002, label: "完了" },
]
export const ROUTE_COMPLETED = 100000002

export type StopStatus = 100000000 | 100000001 | 100000002 | 100000003
export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  100000000: "未配達",
  100000001: "配達完了",
  100000002: "不在",
  100000003: "持ち戻り",
}
export const STOP_STATUS_COLOR: Record<StopStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-green-100 text-green-800",
  100000002: "bg-orange-100 text-orange-700",
  100000003: "bg-red-100 text-red-800",
}
export const STOP_STATUS_OPTIONS = [
  { value: 100000000, label: "未配達" },
  { value: 100000001, label: "配達完了" },
  { value: 100000002, label: "不在" },
  { value: 100000003, label: "持ち戻り" },
]
export const STOP_PENDING   = 100000000
export const STOP_DELIVERED = 100000001
export const STOP_ABSENT    = 100000002
export const STOP_RETURNED  = 100000003
/** 対応が済んだ状態（未配達以外） */
export const STOP_HANDLED_STATUSES = [100000001, 100000002, 100000003]

export type Vehicle = Record<string, unknown>
export type DeliveryRoute = Record<string, unknown>
export type Stop = Record<string, unknown>

export type EquipmentStatus = 100000000 | 100000001 | 100000002 | 100000003
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  100000000: "稼働中", 100000001: "停止中", 100000002: "修理中", 100000003: "廃棄",
}
export const EQUIPMENT_STATUS_COLOR: Record<EquipmentStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-gray-100 text-gray-600",
  100000002: "bg-yellow-100 text-yellow-800",
  100000003: "bg-red-100 text-red-800",
}
export const EQUIPMENT_STATUS_OPTIONS = [
  { value: 100000000, label: "稼働中" },
  { value: 100000001, label: "停止中" },
  { value: 100000002, label: "修理中" },
  { value: 100000003, label: "廃棄" },
]

export type WorkOrderType = 100000000 | 100000001 | 100000002 | 100000003
export const WORK_ORDER_TYPE_LABEL: Record<WorkOrderType, string> = {
  100000000: "定期点検", 100000001: "修理", 100000002: "緊急対応", 100000003: "その他",
}
export const WORK_ORDER_TYPE_COLOR: Record<WorkOrderType, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-800",
  100000002: "bg-red-100 text-red-800",
  100000003: "bg-gray-100 text-gray-600",
}
export const WORK_ORDER_TYPE_OPTIONS = [
  { value: 100000000, label: "定期点検" },
  { value: 100000001, label: "修理" },
  { value: 100000002, label: "緊急対応" },
  { value: 100000003, label: "その他" },
]

export type WorkOrderStatus = 100000000 | 100000001 | 100000002 | 100000003
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  100000000: "未着手", 100000001: "作業中", 100000002: "完了", 100000003: "保留",
}
export const WORK_ORDER_STATUS_COLOR: Record<WorkOrderStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-yellow-100 text-yellow-800",
}
export const WORK_ORDER_STATUS_OPTIONS = [
  { value: 100000000, label: "未着手" },
  { value: 100000001, label: "作業中" },
  { value: 100000002, label: "完了" },
  { value: 100000003, label: "保留" },
]

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

export type SchedulePeriod = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const SCHEDULE_PERIOD_LABEL: Record<SchedulePeriod, string> = {
  100000000: "週次", 100000001: "月次", 100000002: "四半期", 100000003: "半年", 100000004: "年次",
}
export const SCHEDULE_PERIOD_OPTIONS = [
  { value: 100000000, label: "週次" },
  { value: 100000001, label: "月次" },
  { value: 100000002, label: "四半期" },
  { value: 100000003, label: "半年" },
  { value: 100000004, label: "年次" },
]

export type Equipment = Record<string, unknown>
export type WorkOrder = Record<string, unknown>
export type Schedule = Record<string, unknown>

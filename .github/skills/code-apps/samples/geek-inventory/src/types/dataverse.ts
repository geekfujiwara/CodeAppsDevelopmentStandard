export type MovementType = 100000000 | 100000001 | 100000002
export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  100000000: "入庫",
  100000001: "出庫",
  100000002: "棚卸調整",
}
export const MOVEMENT_TYPE_COLOR: Record<MovementType, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-red-100 text-red-800",
  100000002: "bg-blue-100 text-blue-800",
}
export const MOVEMENT_TYPE_OPTIONS = [
  { value: 100000000, label: "入庫" },
  { value: 100000001, label: "出庫" },
  { value: 100000002, label: "棚卸調整" },
]

export type OrderStatus = 100000000 | 100000001 | 100000002 | 100000003
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  100000000: "発注中",
  100000001: "一部入荷",
  100000002: "入荷完了",
  100000003: "キャンセル",
}
export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-yellow-100 text-yellow-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-gray-100 text-gray-600",
}
export const ORDER_STATUS_OPTIONS = [
  { value: 100000000, label: "発注中" },
  { value: 100000001, label: "一部入荷" },
  { value: 100000002, label: "入荷完了" },
  { value: 100000003, label: "キャンセル" },
]

export type Product = Record<string, unknown>
export type StockMovement = Record<string, unknown>
export type Order = Record<string, unknown>

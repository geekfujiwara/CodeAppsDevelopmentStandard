export type RequestStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004 | 100000005
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  100000000: "下書き",
  100000001: "申請中",
  100000002: "承認済み",
  100000003: "却下",
  100000004: "発注済み",
  100000005: "受領完了",
}
export const REQUEST_STATUS_COLOR: Record<RequestStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-red-100 text-red-800",
  100000004: "bg-purple-100 text-purple-800",
  100000005: "bg-teal-100 text-teal-800",
}
export const REQUEST_STATUS_OPTIONS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "申請中" },
  { value: 100000002, label: "承認済み" },
  { value: 100000003, label: "却下" },
  { value: 100000004, label: "発注済み" },
  { value: 100000005, label: "受領完了" },
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

export type VendorRating = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const VENDOR_RATING_LABEL: Record<VendorRating, string> = {
  100000000: "★1", 100000001: "★2", 100000002: "★3", 100000003: "★4", 100000004: "★5",
}
export const VENDOR_RATING_OPTIONS = [
  { value: 100000000, label: "★1" },
  { value: 100000001, label: "★2" },
  { value: 100000002, label: "★3" },
  { value: 100000003, label: "★4" },
  { value: 100000004, label: "★5" },
]

export type PurchaseRequest = Record<string, unknown>
export type Vendor = Record<string, unknown>

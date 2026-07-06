export type SiteStatus = 100000000 | 100000001 | 100000002
export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  100000000: "施工中",
  100000001: "竣工検査",
  100000002: "引渡し済み",
}
export const SITE_STATUS_COLOR: Record<SiteStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
}
export const SITE_STATUS_OPTIONS = [
  { value: 100000000, label: "施工中" },
  { value: 100000001, label: "竣工検査" },
  { value: 100000002, label: "引渡し済み" },
]
export const SITE_INSPECTING = 100000001

export type ItemStatus = 100000000 | 100000001 | 100000002 | 100000003
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  100000000: "指摘",
  100000001: "是正中",
  100000002: "是正済",
  100000003: "確認済",
}
export const ITEM_STATUS_COLOR: Record<ItemStatus, string> = {
  100000000: "bg-red-100 text-red-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-blue-100 text-blue-800",
  100000003: "bg-green-100 text-green-800",
}
export const ITEM_STATUS_OPTIONS = [
  { value: 100000000, label: "指摘" },
  { value: 100000001, label: "是正中" },
  { value: 100000002, label: "是正済" },
  { value: 100000003, label: "確認済" },
]
export const ITEM_OPEN     = 100000000
export const ITEM_VERIFIED = 100000003

/** ワンクリックで次の状態へ送る遷移マップ（指摘→是正中→是正済→確認済） */
export const NEXT_STATUS: Partial<Record<ItemStatus, { value: ItemStatus; label: string }>> = {
  100000000: { value: 100000001, label: "是正開始" },
  100000001: { value: 100000002, label: "是正完了" },
  100000002: { value: 100000003, label: "確認" },
}

export type Site = Record<string, unknown>
export type PunchItem = Record<string, unknown>

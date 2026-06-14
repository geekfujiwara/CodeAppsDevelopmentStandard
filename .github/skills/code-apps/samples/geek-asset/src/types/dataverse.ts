// ══════════════════════════════════════════════════════════════
// Asset
// ══════════════════════════════════════════════════════════════
export type AssetStatus =
  | 100000000  // 使用中
  | 100000001  // 貸出中
  | 100000002  // 保管中
  | 100000003  // 修理中
  | 100000004  // 廃棄済み

export type AssetCategory =
  | 100000000  // PC
  | 100000001  // ノートPC
  | 100000002  // モニター
  | 100000003  // スマートフォン
  | 100000004  // タブレット
  | 100000005  // 周辺機器
  | 100000006  // オフィス備品
  | 100000007  // その他

export interface Asset {
  [key: string]: unknown // dynamic prefix fields
  createdon?: string
  _createdby_value?: string
}

export const ASSET_STATUS = {
  IN_USE:    100000000 as AssetStatus,
  ON_LOAN:   100000001 as AssetStatus,
  STORED:    100000002 as AssetStatus,
  REPAIR:    100000003 as AssetStatus,
  DISPOSED:  100000004 as AssetStatus,
} as const

export const ASSET_CATEGORY = {
  PC:           100000000 as AssetCategory,
  LAPTOP:       100000001 as AssetCategory,
  MONITOR:      100000002 as AssetCategory,
  SMARTPHONE:   100000003 as AssetCategory,
  TABLET:       100000004 as AssetCategory,
  PERIPHERAL:   100000005 as AssetCategory,
  OFFICE:       100000006 as AssetCategory,
  OTHER:        100000007 as AssetCategory,
} as const

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  100000000: "使用中",
  100000001: "貸出中",
  100000002: "保管中",
  100000003: "修理中",
  100000004: "廃棄済み",
}

export const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-gray-100 text-gray-700",
  100000003: "bg-yellow-100 text-yellow-800",
  100000004: "bg-red-100 text-red-800",
}

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  100000000: "PC",
  100000001: "ノートPC",
  100000002: "モニター",
  100000003: "スマートフォン",
  100000004: "タブレット",
  100000005: "周辺機器",
  100000006: "オフィス備品",
  100000007: "その他",
}

export const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABEL).map(([value, label]) => ({
  value: Number(value) as AssetStatus,
  label,
}))

export const ASSET_CATEGORY_OPTIONS = Object.entries(ASSET_CATEGORY_LABEL).map(([value, label]) => ({
  value: Number(value) as AssetCategory,
  label,
}))

// ══════════════════════════════════════════════════════════════
// Loan
// ══════════════════════════════════════════════════════════════
export type LoanStatus =
  | 100000000  // 貸出中
  | 100000001  // 返却済み
  | 100000002  // 延滞

export interface Loan {
  [key: string]: unknown
  createdon?: string
  _createdby_value?: string
}

export const LOAN_STATUS = {
  ON_LOAN:   100000000 as LoanStatus,
  RETURNED:  100000001 as LoanStatus,
  OVERDUE:   100000002 as LoanStatus,
} as const

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  100000000: "貸出中",
  100000001: "返却済み",
  100000002: "延滞",
}

export const LOAN_STATUS_COLOR: Record<LoanStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-green-100 text-green-800",
  100000002: "bg-red-100 text-red-800",
}

export const LOAN_STATUS_OPTIONS = Object.entries(LOAN_STATUS_LABEL).map(([value, label]) => ({
  value: Number(value) as LoanStatus,
  label,
}))

// ══════════════════════════════════════════════════════════════
// Disposal
// ══════════════════════════════════════════════════════════════
export type DisposalStatus =
  | 100000000  // 申請中
  | 100000001  // 承認済み
  | 100000002  // 廃棄完了

export interface Disposal {
  [key: string]: unknown
  createdon?: string
  _createdby_value?: string
}

export const DISPOSAL_STATUS = {
  PENDING:   100000000 as DisposalStatus,
  APPROVED:  100000001 as DisposalStatus,
  COMPLETED: 100000002 as DisposalStatus,
} as const

export const DISPOSAL_STATUS_LABEL: Record<DisposalStatus, string> = {
  100000000: "申請中",
  100000001: "承認済み",
  100000002: "廃棄完了",
}

export const DISPOSAL_STATUS_COLOR: Record<DisposalStatus, string> = {
  100000000: "bg-yellow-100 text-yellow-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-gray-100 text-gray-700",
}

export const DISPOSAL_STATUS_OPTIONS = Object.entries(DISPOSAL_STATUS_LABEL).map(([value, label]) => ({
  value: Number(value) as DisposalStatus,
  label,
}))

// ══════════════════════════════════════════════════════════════
// InventoryCheck
// ══════════════════════════════════════════════════════════════
export type InventoryCheckResult =
  | 100000000  // 確認済み
  | 100000001  // 不明
  | 100000002  // 紛失

export interface InventoryCheck {
  [key: string]: unknown
  createdon?: string
  _createdby_value?: string
}

export const INVENTORY_RESULT = {
  CONFIRMED: 100000000 as InventoryCheckResult,
  UNKNOWN:   100000001 as InventoryCheckResult,
  LOST:      100000002 as InventoryCheckResult,
} as const

export const INVENTORY_RESULT_LABEL: Record<InventoryCheckResult, string> = {
  100000000: "確認済み",
  100000001: "不明",
  100000002: "紛失",
}

export const INVENTORY_RESULT_COLOR: Record<InventoryCheckResult, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-yellow-100 text-yellow-800",
  100000002: "bg-red-100 text-red-800",
}

export const INVENTORY_RESULT_OPTIONS = Object.entries(INVENTORY_RESULT_LABEL).map(([value, label]) => ({
  value: Number(value) as InventoryCheckResult,
  label,
}))

export type ExpenseStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export type ExpenseCategory = 100000000 | 100000001 | 100000002 | 100000003 | 100000004 | 100000005

export interface Expense {
  [key: string]: unknown // dynamic prefix fields
  createdon?: string
  _createdby_value?: string
}

export const EXPENSE_STATUS = {
  DRAFT:     100000000 as ExpenseStatus,
  SUBMITTED: 100000001 as ExpenseStatus,
  APPROVED:  100000002 as ExpenseStatus,
  REJECTED:  100000003 as ExpenseStatus,
  PAID:      100000004 as ExpenseStatus,
} as const

export const EXPENSE_CATEGORY = {
  TRANSPORTATION: 100000000 as ExpenseCategory,
  ACCOMMODATION:  100000001 as ExpenseCategory,
  MEALS:          100000002 as ExpenseCategory,
  ENTERTAINMENT:  100000003 as ExpenseCategory,
  SUPPLIES:       100000004 as ExpenseCategory,
  OTHER:          100000005 as ExpenseCategory,
} as const

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  100000000: "下書き",
  100000001: "申請中",
  100000002: "承認済み",
  100000003: "差戻し",
  100000004: "支払済み",
}

export const EXPENSE_STATUS_COLOR: Record<ExpenseStatus, string> = {
  100000000: "bg-gray-100 text-gray-700",
  100000001: "bg-yellow-100 text-yellow-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-red-100 text-red-800",
  100000004: "bg-blue-100 text-blue-800",
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  100000000: "交通費",
  100000001: "宿泊費",
  100000002: "飲食費",
  100000003: "交際費",
  100000004: "消耗品",
  100000005: "その他",
}

export const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABEL).map(([value, label]) => ({
  value: Number(value) as ExpenseCategory,
  label,
}))

export const STATUS_OPTIONS = Object.entries(EXPENSE_STATUS_LABEL).map(([value, label]) => ({
  value: Number(value) as ExpenseStatus,
  label,
}))

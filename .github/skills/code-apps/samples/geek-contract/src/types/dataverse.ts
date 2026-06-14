export type ContractStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  100000000: "有効", 100000001: "期限切れ", 100000002: "更新中", 100000003: "解約", 100000004: "下書き",
}
export const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-red-100 text-red-800",
  100000002: "bg-yellow-100 text-yellow-800",
  100000003: "bg-gray-100 text-gray-600",
  100000004: "bg-blue-100 text-blue-800",
}
export const CONTRACT_STATUS_OPTIONS = [
  { value: 100000000, label: "有効" },
  { value: 100000001, label: "期限切れ" },
  { value: 100000002, label: "更新中" },
  { value: 100000003, label: "解約" },
  { value: 100000004, label: "下書き" },
]

export type ContractType = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  100000000: "業務委託", 100000001: "売買", 100000002: "賃貸借", 100000003: "保守・サポート", 100000004: "その他",
}
export const CONTRACT_TYPE_OPTIONS = [
  { value: 100000000, label: "業務委託" },
  { value: 100000001, label: "売買" },
  { value: 100000002, label: "賃貸借" },
  { value: 100000003, label: "保守・サポート" },
  { value: 100000004, label: "その他" },
]

export type AutoRenewal = 100000000 | 100000001
export const AUTO_RENEWAL_LABEL: Record<AutoRenewal, string> = {
  100000000: "あり", 100000001: "なし",
}
export const AUTO_RENEWAL_OPTIONS = [
  { value: 100000000, label: "あり" },
  { value: 100000001, label: "なし" },
]

export type CounterpartyType = 100000000 | 100000001 | 100000002 | 100000003
export const COUNTERPARTY_TYPE_LABEL: Record<CounterpartyType, string> = {
  100000000: "顧客", 100000001: "仕入先", 100000002: "パートナー", 100000003: "その他",
}
export const COUNTERPARTY_TYPE_OPTIONS = [
  { value: 100000000, label: "顧客" },
  { value: 100000001, label: "仕入先" },
  { value: 100000002, label: "パートナー" },
  { value: 100000003, label: "その他" },
]

export type Contract = Record<string, unknown>
export type Counterparty = Record<string, unknown>

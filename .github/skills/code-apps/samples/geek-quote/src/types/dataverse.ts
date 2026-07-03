export type QuoteStatus = 100000000 | 100000001 | 100000002 | 100000003
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  100000000: "下書き",
  100000001: "送付済み",
  100000002: "受注",
  100000003: "失注",
}
export const QUOTE_STATUS_COLOR: Record<QuoteStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-red-100 text-red-800",
}
export const QUOTE_STATUS_OPTIONS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "送付済み" },
  { value: 100000002, label: "受注" },
  { value: 100000003, label: "失注" },
]
/** 矢羽（StagePath）表示用: 失注は negativeValue として末尾に表示 */
export const QUOTE_STAGE_PATH_ITEMS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "送付済み" },
  { value: 100000002, label: "受注" },
  { value: 100000003, label: "失注" },
]
export const QUOTE_STATUS_LOST = 100000003
export const QUOTE_STATUS_WON = 100000002

export type InvoiceStatus = 100000000 | 100000001 | 100000002
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  100000000: "下書き",
  100000001: "送付済み",
  100000002: "入金済み",
}
export const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-green-100 text-green-800",
}
export const INVOICE_STATUS_OPTIONS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "送付済み" },
  { value: 100000002, label: "入金済み" },
]

export type Quote = Record<string, unknown>
export type QuoteLine = Record<string, unknown>
export type Invoice = Record<string, unknown>

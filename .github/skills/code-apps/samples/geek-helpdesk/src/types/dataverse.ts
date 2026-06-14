export type TicketStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  100000000: "未対応",
  100000001: "対応中",
  100000002: "保留",
  100000003: "解決済み",
  100000004: "クローズ",
}
export const TICKET_STATUS_COLOR: Record<TicketStatus, string> = {
  100000000: "bg-red-100 text-red-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-yellow-100 text-yellow-800",
  100000003: "bg-green-100 text-green-800",
  100000004: "bg-gray-100 text-gray-600",
}
export const TICKET_STATUS_OPTIONS = [
  { value: 100000000, label: "未対応" },
  { value: 100000001, label: "対応中" },
  { value: 100000002, label: "保留" },
  { value: 100000003, label: "解決済み" },
  { value: 100000004, label: "クローズ" },
]

export type Priority = 100000000 | 100000001 | 100000002 | 100000003
export const PRIORITY_LABEL: Record<Priority, string> = {
  100000000: "低",
  100000001: "中",
  100000002: "高",
  100000003: "緊急",
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

export type KnowledgeStatus = 100000000 | 100000001 | 100000002
export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string> = {
  100000000: "下書き",
  100000001: "公開",
  100000002: "アーカイブ",
}
export const KNOWLEDGE_STATUS_COLOR: Record<KnowledgeStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-green-100 text-green-800",
  100000002: "bg-yellow-100 text-yellow-700",
}
export const KNOWLEDGE_STATUS_OPTIONS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "公開" },
  { value: 100000002, label: "アーカイブ" },
]

export type Ticket = Record<string, unknown>
export type Knowledge = Record<string, unknown>

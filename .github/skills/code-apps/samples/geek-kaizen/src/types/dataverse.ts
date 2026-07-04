export type SuggestionStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  100000000: "提案",
  100000001: "検討中",
  100000002: "採用",
  100000003: "実施済み",
  100000004: "見送り",
}
export const SUGGESTION_STATUS_COLOR: Record<SuggestionStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-teal-100 text-teal-800",
  100000004: "bg-gray-100 text-gray-600",
}
export const SUGGESTION_STATUS_OPTIONS = [
  { value: 100000000, label: "提案" },
  { value: 100000001, label: "検討中" },
  { value: 100000002, label: "採用" },
  { value: 100000003, label: "実施済み" },
  { value: 100000004, label: "見送り" },
]
export const STATUS_SUBMITTED   = 100000000
export const STATUS_REVIEWING   = 100000001
export const STATUS_ADOPTED     = 100000002
export const STATUS_IMPLEMENTED = 100000003
export const STATUS_DECLINED    = 100000004

/** カンバン列定義（KanbanBoard の columns にそのまま渡す） */
export const KANBAN_COLUMNS = [
  { value: 100000000, label: "提案",     colorClass: "bg-blue-100 text-blue-800" },
  { value: 100000001, label: "検討中",   colorClass: "bg-orange-100 text-orange-700" },
  { value: 100000002, label: "採用",     colorClass: "bg-green-100 text-green-800" },
  { value: 100000003, label: "実施済み", colorClass: "bg-teal-100 text-teal-800" },
  { value: 100000004, label: "見送り",   colorClass: "bg-gray-100 text-gray-600" },
]

export type Suggestion = Record<string, unknown>

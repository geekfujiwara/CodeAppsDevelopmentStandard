// ===== 顧客: SLA 区分 =====
export type SlaTier = 100000000 | 100000001 | 100000002
export const SLA_TIER_LABEL: Record<SlaTier, string> = {
  100000000: "プレミアム", 100000001: "標準", 100000002: "エコノミー",
}
export const SLA_TIER_COLOR: Record<SlaTier, string> = {
  100000000: "bg-purple-100 text-purple-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-gray-100 text-gray-600",
}
export const SLA_TIER_OPTIONS = [
  { value: 100000000, label: "プレミアム" },
  { value: 100000001, label: "標準" },
  { value: 100000002, label: "エコノミー" },
]

// ===== CE: スキルレベル =====
export type SkillLevel = 100000000 | 100000001 | 100000002 | 100000003
export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  100000000: "ジュニア", 100000001: "標準", 100000002: "シニア", 100000003: "エキスパート",
}
export const SKILL_LEVEL_COLOR: Record<SkillLevel, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-700",
  100000002: "bg-indigo-100 text-indigo-800",
  100000003: "bg-amber-100 text-amber-800",
}
export const SKILL_LEVEL_OPTIONS = [
  { value: 100000000, label: "ジュニア" },
  { value: 100000001, label: "標準" },
  { value: 100000002, label: "シニア" },
  { value: 100000003, label: "エキスパート" },
]

// ===== CE: 稼働状態 =====
export type WorkStatus = 100000000 | 100000001 | 100000002 | 100000003
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  100000000: "待機", 100000001: "作業中", 100000002: "移動中", 100000003: "休憩",
}
export const WORK_STATUS_COLOR: Record<WorkStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-yellow-100 text-yellow-800",
  100000003: "bg-gray-100 text-gray-600",
}
export const WORK_STATUS_OPTIONS = [
  { value: 100000000, label: "待機" },
  { value: 100000001, label: "作業中" },
  { value: 100000002, label: "移動中" },
  { value: 100000003, label: "休憩" },
]

// ===== 機器: ステータス =====
export type EquipmentStatus = 100000000 | 100000001 | 100000002
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  100000000: "稼働中", 100000001: "停止", 100000002: "廃棄",
}
export const EQUIPMENT_STATUS_COLOR: Record<EquipmentStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-gray-100 text-gray-600",
  100000002: "bg-red-100 text-red-800",
}
export const EQUIPMENT_STATUS_OPTIONS = [
  { value: 100000000, label: "稼働中" },
  { value: 100000001, label: "停止" },
  { value: 100000002, label: "廃棄" },
]

// ===== 機器: 推奨アクション（ライフサイクル） =====
export type LifecycleAction = 100000000 | 100000001 | 100000002
export const LIFECYCLE_ACTION_LABEL: Record<LifecycleAction, string> = {
  100000000: "継続利用", 100000001: "更新検討", 100000002: "更新推奨",
}
export const LIFECYCLE_ACTION_COLOR: Record<LifecycleAction, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-amber-100 text-amber-800",
  100000002: "bg-red-100 text-red-800",
}
export const LIFECYCLE_ACTION_OPTIONS = [
  { value: 100000000, label: "継続利用" },
  { value: 100000001, label: "更新検討" },
  { value: 100000002, label: "更新推奨" },
]

// ===== 改善提案: カテゴリ =====
export type RecommendationCategory = 100000000 | 100000001 | 100000002 | 100000003
export const RECOMMENDATION_CATEGORY_LABEL: Record<RecommendationCategory, string> = {
  100000000: "機器更新", 100000001: "運用改善", 100000002: "コスト最適化", 100000003: "SLA見直し",
}
export const RECOMMENDATION_CATEGORY_COLOR: Record<RecommendationCategory, string> = {
  100000000: "bg-purple-100 text-purple-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-teal-100 text-teal-800",
  100000003: "bg-indigo-100 text-indigo-800",
}
export const RECOMMENDATION_CATEGORY_OPTIONS = [
  { value: 100000000, label: "機器更新" },
  { value: 100000001, label: "運用改善" },
  { value: 100000002, label: "コスト最適化" },
  { value: 100000003, label: "SLA見直し" },
]

// ===== 改善提案: 優先度 =====
export type RecommendationPriority = 100000000 | 100000001 | 100000002
export const RECOMMENDATION_PRIORITY_LABEL: Record<RecommendationPriority, string> = {
  100000000: "高", 100000001: "中", 100000002: "低",
}
export const RECOMMENDATION_PRIORITY_COLOR: Record<RecommendationPriority, string> = {
  100000000: "bg-red-100 text-red-700",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-gray-100 text-gray-600",
}
export const RECOMMENDATION_PRIORITY_OPTIONS = [
  { value: 100000000, label: "高" },
  { value: 100000001, label: "中" },
  { value: 100000002, label: "低" },
]

// ===== 保守契約: 契約種別 =====
export type ContractType = 100000000 | 100000001 | 100000002
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  100000000: "保守契約", 100000001: "ワンショット", 100000002: "サブスクリプション",
}
export const CONTRACT_TYPE_COLOR: Record<ContractType, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-gray-100 text-gray-600",
  100000002: "bg-teal-100 text-teal-800",
}
export const CONTRACT_TYPE_OPTIONS = [
  { value: 100000000, label: "保守契約" },
  { value: 100000001, label: "ワンショット" },
  { value: 100000002, label: "サブスクリプション" },
]

// ===== コール: チャネル =====
export type CallChannel = 100000000 | 100000001 | 100000002
export const CALL_CHANNEL_LABEL: Record<CallChannel, string> = {
  100000000: "電話", 100000001: "Web", 100000002: "アラート",
}
export const CALL_CHANNEL_COLOR: Record<CallChannel, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-green-100 text-green-800",
  100000002: "bg-red-100 text-red-800",
}
export const CALL_CHANNEL_OPTIONS = [
  { value: 100000000, label: "電話" },
  { value: 100000001, label: "Web" },
  { value: 100000002, label: "アラート" },
]

// ===== コール: 優先度 =====
export type Priority = 100000000 | 100000001 | 100000002 | 100000003
export const PRIORITY_LABEL: Record<Priority, string> = {
  100000000: "緊急", 100000001: "高", 100000002: "中", 100000003: "低",
}
export const PRIORITY_COLOR: Record<Priority, string> = {
  100000000: "bg-red-100 text-red-700",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-blue-100 text-blue-700",
  100000003: "bg-gray-100 text-gray-600",
}
export const PRIORITY_OPTIONS = [
  { value: 100000000, label: "緊急" },
  { value: 100000001, label: "高" },
  { value: 100000002, label: "中" },
  { value: 100000003, label: "低" },
]

// ===== コール: ステータス =====
export type CallStatus = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  100000000: "受付", 100000001: "対応中", 100000002: "手配済", 100000003: "完了", 100000004: "クローズ",
}
export const CALL_STATUS_COLOR: Record<CallStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-yellow-100 text-yellow-800",
  100000002: "bg-indigo-100 text-indigo-800",
  100000003: "bg-green-100 text-green-800",
  100000004: "bg-gray-100 text-gray-600",
}
export const CALL_STATUS_OPTIONS = [
  { value: 100000000, label: "受付" },
  { value: 100000001, label: "対応中" },
  { value: 100000002, label: "手配済" },
  { value: 100000003, label: "完了" },
  { value: 100000004, label: "クローズ" },
]

// ===== 作業オーダー: 作業種別 =====
export type WorkOrderType = 100000000 | 100000001 | 100000002
export const WORK_ORDER_TYPE_LABEL: Record<WorkOrderType, string> = {
  100000000: "故障修理", 100000001: "定期保守", 100000002: "納入設置",
}
export const WORK_ORDER_TYPE_COLOR: Record<WorkOrderType, string> = {
  100000000: "bg-orange-100 text-orange-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-teal-100 text-teal-800",
}
export const WORK_ORDER_TYPE_OPTIONS = [
  { value: 100000000, label: "故障修理" },
  { value: 100000001, label: "定期保守" },
  { value: 100000002, label: "納入設置" },
]

// ===== 作業オーダー: ステータス =====
export type WorkOrderStatus = 100000000 | 100000001 | 100000002 | 100000003
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  100000000: "未着手", 100000001: "手配済", 100000002: "作業中", 100000003: "完了",
}
export const WORK_ORDER_STATUS_COLOR: Record<WorkOrderStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-indigo-100 text-indigo-800",
  100000002: "bg-blue-100 text-blue-800",
  100000003: "bg-green-100 text-green-800",
}
export const WORK_ORDER_STATUS_OPTIONS = [
  { value: 100000000, label: "未着手" },
  { value: 100000001, label: "手配済" },
  { value: 100000002, label: "作業中" },
  { value: 100000003, label: "完了" },
]

// ===== ステータス値定数（ダッシュボード等の判定用） =====
export const CALL_STATUS = {
  RECEIVED: 100000000, IN_PROGRESS: 100000001, ARRANGED: 100000002, COMPLETED: 100000003, CLOSED: 100000004,
} as const
export const WORK_STATUS = {
  STANDBY: 100000000, WORKING: 100000001, MOVING: 100000002, BREAK: 100000003,
} as const
export const WORK_ORDER_STATUS = {
  NOT_STARTED: 100000000, ARRANGED: 100000001, WORKING: 100000002, COMPLETED: 100000003,
} as const

// ===== 汎用レコード型（ListTable の Record<string, unknown> 制約用） =====
export type Customer = Record<string, unknown>
export type Engineer = Record<string, unknown>
export type Equipment = Record<string, unknown>
// ===== 日報: 天候 =====
export type Weather = 100000000 | 100000001 | 100000002 | 100000003
export const WEATHER_LABEL: Record<Weather, string> = {
  100000000: "晴れ", 100000001: "曇り", 100000002: "雨", 100000003: "雪",
}
export const WEATHER_OPTIONS = [
  { value: 100000000, label: "晴れ" },
  { value: 100000001, label: "曇り" },
  { value: 100000002, label: "雨" },
  { value: 100000003, label: "雪" },
]

// ===== 日報: 承認ステータス =====
export type ApprovalStatus = 100000000 | 100000001 | 100000002 | 100000003
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  100000000: "下書き", 100000001: "提出済", 100000002: "承認済", 100000003: "差戻し",
}
export const APPROVAL_STATUS_COLOR: Record<ApprovalStatus, string> = {
  100000000: "bg-gray-100 text-gray-600",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-red-100 text-red-700",
}
export const APPROVAL_STATUS_OPTIONS = [
  { value: 100000000, label: "下書き" },
  { value: 100000001, label: "提出済" },
  { value: 100000002, label: "承認済" },
  { value: 100000003, label: "差戻し" },
]

export type MaintenanceContract = Record<string, unknown>
export type Call = Record<string, unknown>
export type WorkOrder = Record<string, unknown>
export type MaintenanceReport = Record<string, unknown>
export type ConsumptionRecord = Record<string, unknown>
export type AnnualKpi = Record<string, unknown>
export type Recommendation = Record<string, unknown>
export type StoreStatus = 100000000 | 100000001 | 100000002
export const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  100000000: "営業中",
  100000001: "改装中",
  100000002: "閉店",
}
export const STORE_STATUS_COLOR: Record<StoreStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-gray-100 text-gray-600",
}
export const STORE_STATUS_OPTIONS = [
  { value: 100000000, label: "営業中" },
  { value: 100000001, label: "改装中" },
  { value: 100000002, label: "閉店" },
]
export const STORE_OPEN = 100000000

export type AuditStatus = 100000000 | 100000001 | 100000002
export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  100000000: "予定",
  100000001: "実施中",
  100000002: "完了",
}
export const AUDIT_STATUS_COLOR: Record<AuditStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
}
export const AUDIT_STATUS_OPTIONS = [
  { value: 100000000, label: "予定" },
  { value: 100000001, label: "実施中" },
  { value: 100000002, label: "完了" },
]
/** 矢羽（StagePath）表示用 */
export const AUDIT_STAGE_PATH_ITEMS = [
  { value: 100000000, label: "予定" },
  { value: 100000001, label: "実施中" },
  { value: 100000002, label: "完了" },
]
export const AUDIT_COMPLETED = 100000002

/** チェック項目の判定（未確認はスコア・進捗の分母から除外しない / 対象外は分母から除外する） */
export type ItemResult = 100000000 | 100000001 | 100000002 | 100000003
export const ITEM_RESULT_LABEL: Record<ItemResult, string> = {
  100000000: "未確認",
  100000001: "合格",
  100000002: "不合格",
  100000003: "対象外",
}
export const RESULT_UNCHECKED = 100000000
export const RESULT_PASS      = 100000001
export const RESULT_FAIL      = 100000002
export const RESULT_NA        = 100000003

/** 判定トグル（ResultToggle）の選択肢と配色 */
export const RESULT_TOGGLE_OPTIONS = [
  { value: RESULT_PASS, label: "合格",   activeClass: "bg-emerald-600 text-white" },
  { value: RESULT_FAIL, label: "不合格", activeClass: "bg-rose-600 text-white" },
  { value: RESULT_NA,   label: "対象外", activeClass: "bg-gray-500 text-white" },
]

/** 臨店チェックの標準テンプレート（臨店作成時に一括生成される） */
export const STANDARD_CHECKLIST: { category: string; name: string }[] = [
  { category: "清掃・衛生", name: "店頭・入口が清掃されている" },
  { category: "清掃・衛生", name: "バックヤードが整理整頓されている" },
  { category: "清掃・衛生", name: "トイレ・共用部が清潔である" },
  { category: "陳列・売場", name: "欠品なく商品が補充されている" },
  { category: "陳列・売場", name: "プライスカードが正しく表示されている" },
  { category: "陳列・売場", name: "販促物（POP）が計画通り設置されている" },
  { category: "陳列・売場", name: "先入れ先出しが守られている" },
  { category: "接客",       name: "挨拶・身だしなみが基準を満たしている" },
  { category: "接客",       name: "レジ待ち時間が適正である" },
  { category: "安全",       name: "避難経路が確保されている" },
  { category: "安全",       name: "バックヤードの高所保管が安全である" },
]

export type Store = Record<string, unknown>
export type StoreAudit = Record<string, unknown>
export type AuditItem = Record<string, unknown>

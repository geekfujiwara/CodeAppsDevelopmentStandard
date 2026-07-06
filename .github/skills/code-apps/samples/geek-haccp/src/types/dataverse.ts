export type Category = 100000000 | 100000001 | 100000002 | 100000003
export const CATEGORY_LABEL: Record<Category, string> = {
  100000000: "冷蔵・冷凍",
  100000001: "加熱",
  100000002: "保管・陳列",
  100000003: "衛生",
}
export const CATEGORY_COLOR: Record<Category, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-red-100 text-red-800",
  100000002: "bg-teal-100 text-teal-800",
  100000003: "bg-purple-100 text-purple-800",
}
export const CATEGORY_OPTIONS = [
  { value: 100000000, label: "冷蔵・冷凍" },
  { value: 100000001, label: "加熱" },
  { value: 100000002, label: "保管・陳列" },
  { value: 100000003, label: "衛生" },
]

export type TimeSlot = 100000000 | 100000001 | 100000002 | 100000003
export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  100000000: "開店前",
  100000001: "午前",
  100000002: "午後",
  100000003: "閉店後",
}
export const TIME_SLOT_OPTIONS = [
  { value: 100000000, label: "開店前" },
  { value: 100000001, label: "午前" },
  { value: 100000002, label: "午後" },
  { value: 100000003, label: "閉店後" },
]
export const TIME_SLOT_ORDER = [100000000, 100000001, 100000002, 100000003]

/**
 * 標準点検項目テンプレート（点検項目マスタが無い場合の初期投入用）。
 * min/max は HACCP の一般的な管理基準の例（実運用では自施設の基準に置き換える）。
 */
export const STANDARD_CHECKPOINTS: {
  name: string; category: number; unit: string; min: number | null; max: number | null
}[] = [
  { name: "冷蔵庫 庫内温度",     category: 100000000, unit: "℃", min: null, max: 5 },
  { name: "冷凍庫 庫内温度",     category: 100000000, unit: "℃", min: null, max: -18 },
  { name: "加熱後 中心温度",     category: 100000001, unit: "℃", min: 75,   max: null },
  { name: "温蔵ケース 保管温度", category: 100000002, unit: "℃", min: 65,   max: null },
  { name: "手指消毒 アルコール", category: 100000003, unit: "",  min: null, max: null },
]

export type Checkpoint = Record<string, unknown>
export type Measurement = Record<string, unknown>

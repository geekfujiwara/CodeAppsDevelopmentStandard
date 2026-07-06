export type Judgement = "ok" | "low" | "high" | "none"

export interface ThresholdResult {
  judgement: Judgement
  /** true = 逸脱（low or high） */
  deviated: boolean
  label: string
  /** バッジ色クラス */
  colorClass: string
}

/**
 * 測定値を基準の上下限（min/max）と照合して合否を判定する。
 * min/max はどちらか一方だけでも良い（片側規格）。value が未入力なら "none"。
 */
export function judgeThreshold(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): ThresholdResult {
  if (value == null || Number.isNaN(value)) {
    return { judgement: "none", deviated: false, label: "未測定", colorClass: "bg-gray-100 text-gray-600" }
  }
  if (min != null && value < min) {
    return { judgement: "low", deviated: true, label: "下限逸脱", colorClass: "bg-blue-100 text-blue-800" }
  }
  if (max != null && value > max) {
    return { judgement: "high", deviated: true, label: "上限逸脱", colorClass: "bg-red-100 text-red-800" }
  }
  return { judgement: "ok", deviated: false, label: "適合", colorClass: "bg-green-100 text-green-800" }
}

/** 基準レンジの表示文字列（"1〜5℃" / "≤ -18℃" / "≥ 75℃"） */
export function formatRange(min: number | null | undefined, max: number | null | undefined, unit = ""): string {
  if (min != null && max != null) return `${min}〜${max}${unit}`
  if (max != null) return `≤ ${max}${unit}`
  if (min != null) return `≥ ${min}${unit}`
  return "—"
}

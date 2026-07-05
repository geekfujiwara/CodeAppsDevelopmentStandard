export type InspectionStatus = 100000000 | 100000001 | 100000002
export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  100000000: "計画",
  100000001: "実施中",
  100000002: "完了",
}
export const INSPECTION_STATUS_COLOR: Record<InspectionStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
}
export const INSPECTION_STATUS_OPTIONS = [
  { value: 100000000, label: "計画" },
  { value: 100000001, label: "実施中" },
  { value: 100000002, label: "完了" },
]
/** 矢羽（StagePath）表示用 */
export const INSPECTION_STAGE_PATH_ITEMS = [
  { value: 100000000, label: "計画" },
  { value: 100000001, label: "実施中" },
  { value: 100000002, label: "完了" },
]
export const INSPECTION_COMPLETED = 100000002

export type Disposition = 100000000 | 100000001 | 100000002
export const DISPOSITION_LABEL: Record<Disposition, string> = {
  100000000: "手直し",
  100000001: "廃棄",
  100000002: "特別採用",
}
export const DISPOSITION_COLOR: Record<Disposition, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-red-100 text-red-800",
  100000002: "bg-orange-100 text-orange-700",
}
export const DISPOSITION_OPTIONS = [
  { value: 100000000, label: "手直し" },
  { value: 100000001, label: "廃棄" },
  { value: 100000002, label: "特別採用" },
]

/** 歩留まり（%）= (検査数 - 不良数) / 検査数 × 100。検査数 0 なら null */
export function computeYield(inspectedQty: number, defectQty: number): number | null {
  if (inspectedQty <= 0) return null
  return Math.round(((inspectedQty - defectQty) / inspectedQty) * 1000) / 10
}

export type Inspection = Record<string, unknown>
export type Defect = Record<string, unknown>

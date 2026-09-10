import { parsePlantDesign, validatePlantDesign, type PlantDesign, type PlantUnit } from "./plant-design.ts"

export function placementCandidate(design: PlantDesign, draft: PlantUnit): PlantDesign {
  if (design.units.length >= 30) throw new Error("配置ユニットは30件までです。")
  if (design.units.some((unit) => unit.id === draft.id)) throw new Error("配置IDが重複しています。")
  return parsePlantDesign(JSON.stringify({ ...design, units: [...design.units, draft] }))
}

export function confirmPlacement(design: PlantDesign, basis: string, draft: PlantUnit): PlantDesign {
  if (JSON.stringify(design) !== basis) throw new Error("設計が変更されています。配置をやり直してください。")
  const next = placementCandidate(design, draft)
  const issues = validatePlantDesign(next)
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join("\n"))
  return next
}

export function snapPlacementPoint(horizontal: number, vertical: number): [number, number, number] {
  if (![horizontal, vertical].every(Number.isFinite)) throw new Error("配置座標が不正です。")
  return [Math.round(horizontal * 2) / 2, 0, Math.round(vertical * 2) / 2]
}
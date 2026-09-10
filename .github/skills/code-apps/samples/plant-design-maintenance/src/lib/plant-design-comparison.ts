// AI による変更の適用前後を 2 カラムで比較するための純粋関数。UI から独立させ node --test から検証する。
import { designDiff, type PlantDesign } from "../data/plant-design.ts"

export type DesignPlanSummary = { units: number; connections: number }
export type DesignComparison = {
  changes: string[]
  changedUnitIds: string[]
  removedUnitIds: string[]
  before: DesignPlanSummary
  after: DesignPlanSummary
}
export type PlanViewBox = { minX: number; minZ: number; width: number; depth: number }

const summarize = (design: PlantDesign): DesignPlanSummary => ({ units: design.units.length, connections: design.connections.length })

export function compareDesigns(before: PlantDesign, after: PlantDesign): DesignComparison {
  return {
    changes: designDiff(before, after),
    changedUnitIds: after.units.filter((unit) => {
      const previous = before.units.find((candidate) => candidate.id === unit.id)
      return !previous || JSON.stringify(previous) !== JSON.stringify(unit)
    }).map((unit) => unit.id),
    removedUnitIds: before.units.filter((unit) => !after.units.some((candidate) => candidate.id === unit.id)).map((unit) => unit.id),
    before: summarize(before),
    after: summarize(after),
  }
}

// 2 カラムを同じ原点・同じ縮尺で描くため、渡したすべての設計の敷地を含む viewBox を返す。
export function planViewBox(designs: PlantDesign[], margin = 3): PlanViewBox {
  const points = designs.flatMap((design) => design.site.boundary)
  if (!points.length) throw new Error("敷地境界がありません。")
  const horizontal = points.map((point) => point[0])
  const vertical = points.map((point) => point[1])
  const minX = Math.min(...horizontal) - margin
  const minZ = Math.min(...vertical) - margin
  return { minX, minZ, width: Math.max(...horizontal) - minX + margin, depth: Math.max(...vertical) - minZ + margin }
}

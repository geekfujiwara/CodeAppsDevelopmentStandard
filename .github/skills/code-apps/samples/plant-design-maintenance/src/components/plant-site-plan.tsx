import { unitFootprint, type PlantDesign, type Ring } from "@/data/plant-design"
import type { PlanViewBox } from "@/lib/plant-design-comparison"

const pointString = (ring: Ring) => ring.map(([horizontal, vertical]) => `${horizontal},${vertical}`).join(" ")

export function PlantSitePlan({ design, view, label, className = "designer-site", selectedUnitId, changedUnitIds, onSelectUnit }: {
  design: PlantDesign
  view: PlanViewBox
  label: string
  className?: string
  selectedUnitId?: string
  changedUnitIds?: string[]
  onSelectUnit?: (unitId: string) => void
}) {
  return <svg className={className} viewBox={`${view.minX} ${view.minZ} ${view.width} ${view.depth}`} role="img" aria-label={label}>
    <polygon points={pointString(design.site.boundary)} className="designer-boundary" />
    {design.site.exclusions.map((zone) => <polygon key={zone.id} points={pointString(zone.polygon)} className="designer-exclusion"><title>{zone.name}</title></polygon>)}
    {design.units.map((unit) => {
      let footprint: Ring
      try { footprint = unitFootprint(design, unit) } catch { return null }
      const state = [unit.id === selectedUnitId ? "selected" : "", changedUnitIds?.includes(unit.id) ? "changed" : ""].filter(Boolean).join(" ")
      return <g key={unit.id} onClick={onSelectUnit ? () => onSelectUnit(unit.id) : undefined}>
        <polygon points={pointString(footprint)} className={state ? `designer-unit ${state}` : "designer-unit"} />
        <text x={(footprint[0][0] + footprint[2][0]) / 2} y={(footprint[0][1] + footprint[2][1]) / 2} textAnchor="middle" dominantBaseline="middle" fontSize="1">{unit.id}</text>
        <title>{unit.name}</title>
      </g>
    })}
  </svg>
}

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"
import { assertPlantDesign, unitFootprint } from "../src/data/plant-design.ts"

test("agent-generated land-aware JSON passes the application validator and uses matching footprints", () => {
  const site = { boundary: [[-26, -18], [26, -18], [26, 8], [0, 8], [0, 18], [-26, 18], [-26, -18]], exclusions: [{ id: "road", name: "Road", polygon: [[-22, 4], [-10, 4], [-10, 12], [-22, 12], [-22, 4]] }], clearance: 1.5 }
  const script = "import sys,json; sys.path.insert(0,'plant-design-skill'); from design_plant import create_layout,footprint; source,site=json.load(sys.stdin); design=create_layout(source,site); print(json.dumps({'design':design,'bounds':[list(footprint(design,unit).bounds) for unit in design['units']]}))"
  const output = JSON.parse(execFileSync("python", ["-X", "utf8", "-c", script], { input: JSON.stringify([DEFAULT_PLANT_DESIGN, site]), encoding: "utf8" }))
  const candidate = assertPlantDesign(JSON.stringify(output.design))
  candidate.units.forEach((unit, index) => {
    const ring = unitFootprint(candidate, unit)
    const bounds = [...ring[0], ...ring[2]]
    bounds.forEach((value, axis) => assert.ok(Math.abs(value - output.bounds[index][axis]) < 1e-6))
  })
})
import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"
import { compareDesigns, planViewBox } from "../src/lib/plant-design-comparison.ts"

const moved = (design, unitId, offset) => ({ ...design, units: design.units.map((unit) => unit.id === unitId ? { ...unit, position: [unit.position[0] + offset, unit.position[1], unit.position[2]] } : unit) })

test("compareDesigns reports no change for an identical design", () => {
  const comparison = compareDesigns(DEFAULT_PLANT_DESIGN, structuredClone(DEFAULT_PLANT_DESIGN))
  assert.deepEqual(comparison.changes, [])
  assert.deepEqual(comparison.changedUnitIds, [])
  assert.deepEqual(comparison.removedUnitIds, [])
  assert.deepEqual(comparison.before, comparison.after)
})

test("compareDesigns marks moved, added and removed units", () => {
  const target = DEFAULT_PLANT_DESIGN.units[0]
  const after = moved(DEFAULT_PLANT_DESIGN, target.id, 4)
  const comparison = compareDesigns(DEFAULT_PLANT_DESIGN, after)
  assert.deepEqual(comparison.changedUnitIds, [target.id])
  assert.deepEqual(comparison.removedUnitIds, [])
  assert.ok(comparison.changes.some((change) => change.startsWith(`${target.name}:`)))

  const added = { ...target, id: "extra-unit", name: "追加ユニット" }
  const grown = compareDesigns(DEFAULT_PLANT_DESIGN, { ...DEFAULT_PLANT_DESIGN, units: [...DEFAULT_PLANT_DESIGN.units, added] })
  assert.deepEqual(grown.changedUnitIds, [added.id])
  assert.equal(grown.after.units, grown.before.units + 1)

  const shrunk = compareDesigns(DEFAULT_PLANT_DESIGN, { ...DEFAULT_PLANT_DESIGN, units: DEFAULT_PLANT_DESIGN.units.filter((unit) => unit.id !== target.id) })
  assert.deepEqual(shrunk.removedUnitIds, [target.id])
  assert.deepEqual(shrunk.changedUnitIds, [])
})

test("planViewBox covers every boundary so both columns share one scale", () => {
  const single = planViewBox([DEFAULT_PLANT_DESIGN])
  const wider = { ...DEFAULT_PLANT_DESIGN, site: { ...DEFAULT_PLANT_DESIGN.site, boundary: [[-80, -60], [80, -60], [80, 60], [-80, 60], [-80, -60]] } }
  const combined = planViewBox([DEFAULT_PLANT_DESIGN, wider])
  assert.equal(combined.minX, -83)
  assert.equal(combined.minZ, -63)
  assert.equal(combined.width, 166)
  assert.equal(combined.depth, 126)
  assert.ok(combined.width >= single.width && combined.depth >= single.depth)
  assert.throws(() => planViewBox([]))
})

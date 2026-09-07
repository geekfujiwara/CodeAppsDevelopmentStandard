import test from "node:test"
import assert from "node:assert/strict"
import { PLANT_NODES } from "../src/data/plant-model.ts"
import { assertPlantDesign, parsePlantDesign, validatePlantDesign, compilePlantDesign, rectangle, removeUnit } from "../src/data/plant-design.ts"
import { validatePlantConnections } from "../src/data/plant-network.ts"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"

const equipment = PLANT_NODES.filter((node) => ["tk101", "p101"].includes(node.id)).map(({ id, tag, name, kind, position, size, properties }) => ({ id, tag, name, kind, position, size, properties }))
const design = { schemaVersion: 1, id: "test", name: "Test", revision: 1, site: { boundary: rectangle(-30, -30, 30, 30), exclusions: [], clearance: 1 }, modules: [{ id: "transfer", name: "Transfer", equipment, connections: [{ id: "line", from: { nodeId: "tk101", portId: "outlet" }, to: { nodeId: "p101", portId: "inlet" }, elevation: 3, lane: 0 }] }], units: [{ id: "unit1", moduleId: "transfer", name: "Unit 1", position: [0, 0, 0], rotation: 0 }], connections: [] }

test("bundled modular design meets the site and connection constraints", () => {
  assert.deepEqual(validatePlantDesign(parsePlantDesign(JSON.stringify(DEFAULT_PLANT_DESIGN))), [])
})

test("design JSON round-trips and rotated units retain physical connection endpoints", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const candidate = structuredClone(design)
    candidate.units[0].rotation = rotation
    assert.deepEqual(assertPlantDesign(JSON.stringify(candidate)), candidate)
    assert.deepEqual(validatePlantConnections(compilePlantDesign(candidate)), [])
  }
})

test("rejects malformed, duplicate, missing, overlapping, outside and excluded placements", () => {
  assert.throws(() => parsePlantDesign(JSON.stringify({ ...design, schemaVersion: 2 })))
  assert.throws(() => parsePlantDesign(JSON.stringify({ ...design, code: "execute" })))
  const duplicate = structuredClone(design)
  duplicate.units.push({ ...duplicate.units[0] })
  assert.ok(validatePlantDesign(duplicate).some((issue) => issue.code === "duplicate"))
  duplicate.units[1].id = "unit2"
  assert.ok(validatePlantDesign(duplicate).some((issue) => issue.code === "overlap"))
  duplicate.units[1].position = [100, 0, 100]
  assert.ok(validatePlantDesign(duplicate).some((issue) => issue.code === "outside"))
  const excluded = structuredClone(design)
  excluded.site.exclusions.push({ id: "road", name: "Road", polygon: rectangle(-10, -10, 10, 10) })
  assert.ok(validatePlantDesign(excluded).some((issue) => issue.code === "exclusion"))
  excluded.site.boundary = [[0, 0], [20, 20], [0, 20], [20, 0], [0, 0]]
  assert.ok(validatePlantDesign(excluded).some((issue) => issue.code === "site"))
  const missing = structuredClone(design)
  missing.modules[0].connections[0].to.nodeId = "missing"
  assert.ok(validatePlantDesign(missing).some((issue) => issue.code === "reference"))
  assert.equal(removeUnit(design, "unit1").units.length, 0)
})
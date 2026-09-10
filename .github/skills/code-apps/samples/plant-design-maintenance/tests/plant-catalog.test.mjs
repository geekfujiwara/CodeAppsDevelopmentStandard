import assert from "node:assert/strict"
import test from "node:test"
import { PLANT_SAMPLES, plantParts, drawingsForEquipment } from "../src/data/plant-catalog.ts"
import { getPlantMaintenance, inquiriesForEquipment, plantHeat, heatColor } from "../src/data/plant-maintenance.ts"
import { createFailureHighlights, disposePlantObject, plantPartBounds } from "../src/lib/plant-scene.ts"

const all = { from: "", to: "", unresolvedOnly: false }
test("three distinct plants map equipment, parts, failures, repairs, inquiries and drawings without cross-plant joins", () => {
  assert.equal(PLANT_SAMPLES.length, 3)
  for (const sample of PLANT_SAMPLES) {
    assert.ok(sample.nodes.length >= 10)
    assert.equal(new Set(sample.nodes.map((node) => node.id)).size, sample.nodes.length)
    for (const node of sample.nodes) {
      const history = getPlantMaintenance(sample.id, node.id)
      const partIds = new Set(plantParts(node).map((part) => part.id))
      assert.ok(history.failures.every((record) => partIds.has(record.partId)))
      const inquiries = inquiriesForEquipment(sample.id, node.id)
      const drawings = drawingsForEquipment(sample.id, node.id)
      assert.equal(drawings.length, 1)
      assert.equal(inquiries.length, history.failures.length)
      assert.ok(inquiries.every((record) => history.failures.some((failure) => failure.id === record.failureId) && drawings.some((drawing) => drawing.id === record.drawingId)))
    }
  }
  assert.notDeepEqual(getPlantMaintenance(PLANT_SAMPLES[0].id, "p101"), getPlantMaintenance(PLANT_SAMPLES[1].id, "p101"))
  assert.deepEqual(plantHeat("local-glb", all), [])
})

test("heat counts failure records once, not repairs or inquiries; dates and unresolved compose", () => {
  const sample = PLANT_SAMPLES[0]
  const heat = plantHeat(sample.id, all).find((entry) => entry.nodeId === "p101")
  assert.deepEqual(heat, { nodeId: "p101", total: 3, parts: { bearing: 2, seal: 1 }, unlocated: 0 })
  const filtered = plantHeat(sample.id, { from: "2026-09-02", to: "2026-09-02", unresolvedOnly: true }).find((entry) => entry.nodeId === "p101")
  assert.equal(filtered.total, 1)
  assert.deepEqual(filtered.parts, { bearing: 1 })
  assert.ok(plantHeat(sample.id, { ...all, from: "2027-01-01" }).every((entry) => entry.total === 0))
  assert.equal(heatColor(0), "#a3adb5")
  assert.equal(heatColor(1), "#f3cf54")
  assert.equal(heatColor(3), "#ee8736")
  assert.equal(heatColor(4), "#cc343d")
})

test("localized highlights use mapped part coordinates and part counts, never whole equipment bounds", () => {
  const sample = PLANT_SAMPLES[0]
  const root = createFailureHighlights(sample.nodes, plantHeat(sample.id, all))
  const bearing = root.children.find((object) => object.userData.nodeId === "p101" && object.userData.partId === "bearing")
  assert.ok(bearing)
  assert.equal(bearing.userData.count, 2)
  assert.equal(bearing.material.color.getHexString(), "ee8736")
  assert.equal(bearing.geometry.parameters.width, 0.4)
  assert.equal(bearing.position.y, 0.8)
  assert.equal(root.children.filter((object) => object.userData.nodeId === "p101").length, 2)
  const empty = createFailureHighlights(sample.nodes, [])
  assert.equal(empty.children.length, 0)
  disposePlantObject(root)
  disposePlantObject(empty)
})

test("a mapped part without failures still has a selectable focus region", () => {
  const node = PLANT_SAMPLES[0].nodes.find((candidate) => candidate.id === "p101")
  assert.ok(plantPartBounds(node, "coupling"))
  assert.equal(plantPartBounds(node, "unknown"), null)
  const history = getPlantMaintenance(PLANT_SAMPLES[0].id, "p101", "bearing")
  assert.equal(history.failures.length, 2)
  assert.ok(history.failures.every((record) => record.partId === "bearing"))
})
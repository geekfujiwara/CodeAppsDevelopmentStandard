import assert from "node:assert/strict"
import test from "node:test"
import { getPlantMaintenance, maintenanceCounts, maintenanceInput, parseMaintenanceSummary } from "../src/data/plant-maintenance.ts"

const model = "demo-process-plant-r1"

test("history is scoped to exact model and node, repairs only belong to selected failures", () => {
  const history = getPlantMaintenance(model, "p101")
  assert.equal(history.failures.length, 3)
  assert.equal(history.failures[0].id, "DEMO-F-103")
  assert.ok(history.repairs.every((repair) => history.failures.some((failure) => failure.id === repair.failureId)))
  assert.equal(getPlantMaintenance("imported-model", "p101").failures.length, 0)
  assert.equal(getPlantMaintenance("imported-model", "p101").source, "unmapped")
  assert.equal(getPlantMaintenance(model, "line101").failures.length, 0)
  assert.deepEqual(maintenanceCounts(history), { failures: 3, unresolved: 1, completed: 2, planned: 1 })
})

test("AI input excludes other equipment and rejects mixed histories", () => {
  const history = getPlantMaintenance(model, "p101")
  assert.ok(!maintenanceInput(history).includes("DEMO-F-104"))
  assert.throws(() => maintenanceInput({ ...history, nodeId: "p102" }), /別設備/)
  assert.throws(() => maintenanceInput(getPlantMaintenance(model, "line101")), /ありません/)
  assert.throws(() => maintenanceInput({ ...history, repairs: [{ id: "bad", failureId: "other" }] }), /一致/)
})

test("AI output requires citations from this equipment, not plausible invented references", () => {
  const history = getPlantMaintenance(model, "p101")
  const valid = { overview: "軸受振動の再上昇を調査中。", findings: [{ text: "軸受交換の記録。", sourceIds: ["DEMO-R-101"] }], unresolved: [{ text: "原因未確定。", sourceIds: ["DEMO-F-103"] }] }
  assert.deepEqual(parseMaintenanceSummary(JSON.stringify(valid), history), valid)
  assert.throws(() => parseMaintenanceSummary({ ...valid, findings: [{ text: "異音", sourceIds: ["DEMO-F-104"] }] }, history), /出典/)
  assert.throws(() => parseMaintenanceSummary({ ...valid, findings: [] }, history), /根拠/)
  assert.throws(() => parseMaintenanceSummary("plain text", history))
})
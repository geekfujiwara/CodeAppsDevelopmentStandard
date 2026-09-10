import assert from "node:assert/strict"
import test from "node:test"
import { PLANT_NODES, PLANT_DOCUMENTS, searchPlantNodes, documentsForNode } from "../src/data/plant-model.ts"

test("node identities and document references are unique and valid", () => {
  assert.equal(new Set(PLANT_NODES.map((node) => node.id)).size, PLANT_NODES.length)
  assert.equal(new Set(PLANT_NODES.map((node) => node.tag)).size, PLANT_NODES.length)
  for (const node of PLANT_NODES) {
    assert.ok(node.documentIds.length > 0)
    assert.ok(node.documentIds.every((id) => PLANT_DOCUMENTS.some((document) => document.id === id)))
    assert.ok(node.size.every((value) => value > 0))
  }
})

test("search normalizes full-width tags and combines terms with AND", () => {
  assert.deepEqual(searchPlantNodes("Ｐ－１０１").map((node) => node.id), ["p101"])
  assert.deepEqual(searchPlantNodes("ポンプ 予備").map((node) => node.id), ["p102"])
  assert.equal(searchPlantNodes("   ").length, PLANT_NODES.length)
  assert.equal(searchPlantNodes("missing-tag").length, 0)
})

test("area and kind filters compose with text search", () => {
  assert.deepEqual(searchPlantNodes("", "製品回収", "tank").map((node) => node.id), ["tk201"])
  assert.equal(searchPlantNodes("P-101", "製品回収").length, 0)
})

test("selected node resolves only its explicit documents", () => {
  assert.deepEqual(documentsForNode("p101").map((document) => document.id).sort(), ["flow", "pump"])
  assert.deepEqual(documentsForNode("unknown"), [])
})
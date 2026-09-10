import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { PLANT_SAMPLES } from "../src/data/plant-catalog.ts"
import * as THREE from "three"
import { prepareImportedPlant, loadPlantGlb } from "../src/lib/plant-glb.ts"
import { searchPlantNodes } from "../src/data/plant-model.ts"
import { disposePlantObject } from "../src/lib/plant-scene.ts"

test("GLB mesh groups retain tag metadata and world transforms without guessing document links", () => {
  const scene = new THREE.Group()
  const owner = new THREE.Group()
  owner.name = "Feed pump"
  owner.position.set(12, 0, 3)
  owner.userData = { nodeId: "CAD-42", tag: "P-501", area: "Feed", properties: { Power: "15 kW" } }
  for (const offset of [-1, 1]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())
    mesh.position.set(offset, 1, 0)
    owner.add(mesh)
  }
  scene.add(owner)
  const result = prepareImportedPlant(scene)
  assert.equal(result.nodes.length, 1)
  assert.equal(result.root.children[0].children.length, 2)
  assert.equal(result.nodes[0].tag, "P-501")
  assert.equal(result.nodes[0].properties.Power, "15 kW")
  assert.deepEqual(result.nodes[0].documentIds, [])
  assert.deepEqual(result.nodes[0].size, [3, 2, 1])
  assert.equal(searchPlantNodes("p-501", "all", "all", result.nodes).length, 1)
  disposePlantObject(scene)
  disposePlantObject(result.root)
})

test("empty geometry and invalid file inputs fail explicitly", async () => {
  assert.throws(() => prepareImportedPlant(new THREE.Group()), /形状/)
  await assert.rejects(loadPlantGlb(new File(["not a model"], "model.txt")), /GLB/)
  await assert.rejects(loadPlantGlb({ name: "large.glb", size: 51 * 1024 * 1024 }), /50 MB/)
  await assert.rejects(loadPlantGlb(new File(["not a model"], "broken.glb")))
})

test("bundled GLB round-trips through the production loader with all equipment tags", async () => {
  const bytes = await readFile(new URL("../public/models/process-plant-demo.glb", import.meta.url))
  const model = await loadPlantGlb(new File([bytes], "process-plant-demo.glb"))
  assert.equal(model.nodes.length, PLANT_SAMPLES[0].nodes.length)
  assert.deepEqual(model.nodes.map((node) => node.tag).sort(), PLANT_SAMPLES[0].nodes.map((node) => node.tag).sort())
  assert.ok(model.id.startsWith("glb-"))
  const pump = model.nodes.find((node) => node.tag === "P-101")
  assert.ok(pump)
  assert.equal(pump.properties.電動機, "11 kW")
  assert.ok(model.nodes.every((node) => node.documentIds.length === 0))
  disposePlantObject(model.root)
})

test("additional sample GLBs retain the correct plant equipment count and tags", async () => {
  for (const sample of PLANT_SAMPLES.slice(1)) {
    const bytes = await readFile(new URL(`../public/models/${sample.id}.glb`, import.meta.url))
    const model = await loadPlantGlb(new File([bytes], `${sample.id}.glb`))
    assert.equal(model.nodes.length, sample.nodes.length)
    assert.deepEqual(model.nodes.map((node) => node.tag).sort(), sample.nodes.map((node) => node.tag).sort())
    disposePlantObject(model.root)
  }
})
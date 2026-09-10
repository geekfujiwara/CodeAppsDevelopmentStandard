import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"
import { PLANT_NODES } from "../src/data/plant-model.ts"
import { createPlantAssembly, disposePlantObject } from "../src/lib/plant-scene.ts"

test("every equipment group has finite geometry and pickable meshes with its stable ID", () => {
  const assembly = createPlantAssembly(PLANT_NODES)
  assert.equal(assembly.children.length, PLANT_NODES.length)
  for (const group of assembly.children) {
    const bounds = new THREE.Box3().setFromObject(group)
    assert.equal(bounds.isEmpty(), false)
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite))
    let meshes = 0
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      meshes++
      assert.equal(object.userData.nodeId, group.userData.nodeId)
      assert.ok(object.geometry.getAttribute("position").count > 0)
    })
    assert.ok(meshes > 1)
  }
  disposePlantObject(assembly)
})

test("raycasting actual pump geometry returns the equipment ID, not a mesh name", () => {
  const assembly = createPlantAssembly(PLANT_NODES)
  const pump = assembly.children.find((group) => group.userData.nodeId === "p101")
  const center = new THREE.Box3().setFromObject(pump).getCenter(new THREE.Vector3())
  const origin = center.clone().add(new THREE.Vector3(0, 0, 10))
  const ray = new THREE.Raycaster(origin, center.clone().sub(origin).normalize())
  const hits = ray.intersectObject(pump, true)
  assert.ok(hits.length > 0)
  assert.equal(hits[0].object.userData.nodeId, "p101")
  disposePlantObject(assembly)
})
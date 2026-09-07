import test from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"
import { compilePlantDesign } from "../src/data/plant-design.ts"
import { terminalPosition } from "../src/data/plant-network.ts"
import { createPlantAssembly, disposePlantAssembly } from "../src/plant-assembly.ts"

test("rendered cylinders and nozzles meet at exact endpoints after every unit rotation", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const design = structuredClone(DEFAULT_PLANT_DESIGN)
    design.units.forEach((unit) => { unit.rotation = rotation })
    const nodes = compilePlantDesign(design)
    const root = createPlantAssembly(nodes)
    const groupFor = (id) => root.children.find((group) => group.userData.nodeId === id)
    const endpoint = (mesh, side) => mesh.localToWorld(new THREE.Vector3(0, side * mesh.geometry.parameters.height / 2, 0))
    for (const node of nodes.filter((candidate) => candidate.route)) {
      const segments = groupFor(node.id).children
      for (const [reference, mesh, side] of [[node.route.from, segments[0], -1], [node.route.to, segments.at(-1), 1]]) {
        const expected = new THREE.Vector3(...terminalPosition(nodes, reference))
        assert.ok(endpoint(mesh, side).distanceTo(expected) < 0.00001)
        const nozzle = groupFor(reference.nodeId).children.find((child) => child.userData.portId === reference.portId)
        assert.ok(endpoint(nozzle, 1).distanceTo(expected) < 0.00001)
      }
    }
    assert.ok(!new THREE.Box3().setFromObject(root).isEmpty())
    disposePlantAssembly(root)
    assert.equal(root.children.length, 0)
  }
})
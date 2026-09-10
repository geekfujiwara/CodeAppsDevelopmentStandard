import test from "node:test"
import assert from "node:assert/strict"
import { PLANT_NODES } from "../src/data/plant-model.ts"
import { routedConnection, terminalPosition, validatePlantConnections } from "../src/data/plant-network.ts"
import { PLANT_SAMPLES } from "../src/data/plant-catalog.ts"
import { createPlantAssembly, disposePlantObject } from "../src/lib/plant-scene.ts"
import * as THREE from "three"

test("routed pipe starts and ends at equipment nozzle terminals", () => {
  const nodes = PLANT_NODES.filter((node) => node.kind !== "pipe")
  const pipe = routedConnection(nodes, "test-line", { nodeId: "tk101", portId: "outlet" }, { nodeId: "p101", portId: "inlet" }, 3.5, -7)
  assert.deepEqual(pipe.route.points[0], terminalPosition(nodes, pipe.route.from))
  assert.deepEqual(pipe.route.points.at(-1), terminalPosition(nodes, pipe.route.to))
  assert.deepEqual(validatePlantConnections([...nodes, pipe]), [])
  const broken = structuredClone(pipe)
  broken.route.points[0][0] += 0.01
  assert.ok(validatePlantConnections([...nodes, broken]).some((issue) => issue.includes("disconnected")))
  broken.route.to.nodeId = "missing"
  assert.ok(validatePlantConnections([...nodes, broken]).some((issue) => issue.includes("unknown terminal")))
})

test("all complex plants have connected process circuits and powered pumps", () => {
  for (const sample of PLANT_SAMPLES) {
    assert.ok(sample.nodes.filter((node) => !node.route).length >= 28)
    assert.deepEqual(validatePlantConnections(sample.nodes), [])
    const routes = sample.nodes.filter((node) => node.route).map((node) => node.route)
    assert.equal(routes.filter((route) => route.medium === "process").length, 27)
    assert.equal(routes.filter((route) => route.medium === "power").length, 8)
    for (const node of sample.nodes.filter((node) => !node.route && node.kind !== "component")) {
      assert.ok(routes.some((route) => route.medium === "process" && route.to.nodeId === node.id), `${node.id} has no inlet`)
      assert.ok(routes.some((route) => route.medium === "process" && route.from.nodeId === node.id), `${node.id} has no outlet`)
      if (node.kind === "pump") assert.ok(routes.some((route) => route.medium === "power" && route.to.nodeId === node.id), `${node.id} has no power`)
    }
    const reachable = new Set(["tk101"])
    for (let pass = 0; pass < sample.nodes.length; pass++) for (const route of routes) {
      if (reachable.has(route.from.nodeId)) reachable.add(route.to.nodeId)
      if (reachable.has(route.to.nodeId)) reachable.add(route.from.nodeId)
    }
    assert.ok(sample.nodes.filter((node) => !node.route).every((node) => reachable.has(node.id)))
  }
})

test("rendered pipe segments and equipment nozzles share exact world-space endpoints", () => {
  for (const sample of PLANT_SAMPLES) {
    const assembly = createPlantAssembly(sample.nodes)
    for (const node of sample.nodes.filter((candidate) => candidate.route)) {
      const group = assembly.children.find((object) => object.userData.nodeId === node.id)
      const segments = group.children.filter((mesh) => mesh.userData.segmentIndex !== undefined)
      assert.equal(segments.length, node.route.points.length - 1)
      segments.forEach((mesh, index) => {
        const halfLength = mesh.geometry.parameters.height / 2
        const start = mesh.localToWorld(new THREE.Vector3(0, -halfLength, 0))
        const end = mesh.localToWorld(new THREE.Vector3(0, halfLength, 0))
        assert.ok(start.distanceTo(new THREE.Vector3(...node.route.points[index])) < 1e-5)
        assert.ok(end.distanceTo(new THREE.Vector3(...node.route.points[index + 1])) < 1e-5)
      })
      for (const terminal of [node.route.from, node.route.to]) {
        const owner = assembly.children.find((object) => object.userData.nodeId === terminal.nodeId)
        const nozzle = owner.children.find((mesh) => mesh.userData.portId === terminal.portId)
        assert.ok(nozzle)
        const end = nozzle.localToWorld(new THREE.Vector3(0, nozzle.geometry.parameters.height / 2, 0))
        assert.ok(end.distanceTo(new THREE.Vector3(...terminalPosition(sample.nodes, terminal))) < 1e-5)
      }
    }
    disposePlantObject(assembly)
  }
})
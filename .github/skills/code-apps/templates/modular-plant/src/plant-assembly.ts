import * as THREE from "three"
import { equipmentPorts } from "./data/plant-network.ts"
import type { PlantNode, PlantPoint } from "./data/plant-model.ts"

function segment(start: PlantPoint, end: PlantPoint, radius: number, material: THREE.Material) {
  const source = new THREE.Vector3(...start)
  const target = new THREE.Vector3(...end)
  const direction = target.clone().sub(source)
  const length = direction.length()
  if (!Number.isFinite(length) || length < 0.00001) throw new Error("Invalid segment length")
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material)
  mesh.position.copy(source).add(target).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return mesh
}

export function createPlantAssembly(nodes: PlantNode[]) {
  const root = new THREE.Group()
  for (const node of nodes) {
    const group = new THREE.Group()
    group.name = node.tag
    group.userData.nodeId = node.id
    group.position.set(...node.position)
    group.rotation.y = (node.rotation ?? 0) * Math.PI / 180
    const material = new THREE.MeshStandardMaterial({ color: node.route?.medium === "power" ? 0xd6ac36 : node.route ? 0x329c93 : 0x87999d, roughness: 0.6 })
    if (node.route) {
      node.route.points.slice(1).forEach((point, index) => {
        const mesh = segment(node.route!.points[index], point, node.route!.radius, material)
        mesh.userData.segmentIndex = index
        group.add(mesh)
      })
    } else {
      const [width, height, depth] = node.size
      const geometry = node.kind === "tank" || node.kind === "tower"
        ? new THREE.CylinderGeometry(width / 2, width / 2, height, 24)
        : new THREE.BoxGeometry(width, height, depth)
      const body = new THREE.Mesh(geometry, material)
      body.position.y = height / 2
      group.add(body)
      for (const port of equipmentPorts(node)) {
        const surface = port.position.map((value, axis) => value - port.direction[axis] * 0.35) as PlantPoint
        const nozzle = segment(surface, port.position, 0.15, material)
        nozzle.userData.portId = port.id
        group.add(nozzle)
      }
    }
    group.traverse((object) => { object.userData.nodeId = node.id })
    root.add(group)
  }
  root.updateMatrixWorld(true)
  return root
}

export function disposePlantAssembly(root: THREE.Group) {
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  for (const material of materials) material.dispose()
  root.clear()
}
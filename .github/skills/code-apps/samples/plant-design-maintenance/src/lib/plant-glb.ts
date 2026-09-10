import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { PlantNode } from "@/data/plant-model"

export type ImportedPlant = { id: string; name: string; nodes: PlantNode[]; root: THREE.Group }

export function prepareImportedPlant(source: THREE.Object3D) {
  source.updateMatrixWorld(true)
  const root = new THREE.Group()
  const nodes: PlantNode[] = []
  const groups = new Map<THREE.Object3D, THREE.Group>()
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (object instanceof THREE.SkinnedMesh) throw new Error("スキン付きモデルは対象外です。静的な GLB を選択してください。")
    if (nodes.length >= 20000) throw new Error("ノード数が上限を超えています。モデルを分割してください。")
    let owner: THREE.Object3D = object
    let parent: THREE.Object3D | null = object
    let sourceId: string | null = null
    while (parent && parent !== source) {
      if (typeof parent.userData.nodeId === "string") {
        if (sourceId !== null && sourceId !== parent.userData.nodeId) break
        sourceId = parent.userData.nodeId
        owner = parent
      }
      parent = parent.parent
    }
    let group = groups.get(owner)
    if (!group) {
      group = new THREE.Group()
      group.name = owner.name || `部品 ${nodes.length + 1}`
      group.userData.nodeId = `glb-${nodes.length}`
      groups.set(owner, group)
      root.add(group)
      const properties: Record<string, string> = {}
      for (const [key, value] of Object.entries(owner.userData.properties ?? owner.userData)) {
        if (["string", "number", "boolean"].includes(typeof value)) properties[key] = String(value)
      }
      const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback
      nodes.push({
        id: group.userData.nodeId, tag: text(owner.userData.tag, group.name),
        name: text(owner.userData.name, group.name), area: text(owner.userData.area, owner.parent?.name || "モデル"),
        kind: "component", position: [0, 0, 0], size: [1, 1, 1], properties, documentIds: [],
      })
    }
    const mesh = new THREE.Mesh(object.geometry.clone(), Array.isArray(object.material) ? object.material.map((material) => material.clone()) : object.material.clone())
    object.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale)
    mesh.userData.nodeId = group.userData.nodeId
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  })
  if (!nodes.length) throw new Error("表示できる形状がありません。メッシュを含む GLB を選択してください。")
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite) || bounds.getSize(new THREE.Vector3()).length() === 0) throw new Error("モデルの座標または寸法が無効です。")
  const center = bounds.getCenter(new THREE.Vector3())
  for (const group of root.children) group.position.set(-center.x, -bounds.min.y, -center.z)
  root.updateMatrixWorld(true)
  for (const node of nodes) {
    const group = root.children.find((candidate) => candidate.userData.nodeId === node.id)!
    const box = new THREE.Box3().setFromObject(group)
    node.size = box.getSize(new THREE.Vector3()).toArray()
    node.position = box.getCenter(new THREE.Vector3()).toArray()
  }
  return { root, nodes }
}

export async function loadPlantGlb(file: File): Promise<ImportedPlant> {
  if (!file.name.toLowerCase().endsWith(".glb")) throw new Error("GLB ファイルを選択してください。")
  if (file.size > 50 * 1024 * 1024) throw new Error("GLB は 50 MB 以下に分割してください。")
  const bytes = await file.arrayBuffer()
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:") || url.startsWith("data:")) return url
    throw new Error("外部ファイル参照は読み込めません。形状・テクスチャを内包した GLB を選択してください。")
  })
  const result = await new GLTFLoader(manager).parseAsync(bytes, "")
  const textures = new Set<THREE.Texture>()
  result.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
  })
  try {
    const prepared = prepareImportedPlant(result.scene)
    const hash = await crypto.subtle.digest("SHA-256", bytes)
    const id = Array.from(new Uint8Array(hash)).map((value) => value.toString(16).padStart(2, "0")).join("")
    return { ...prepared, name: file.name, id: `glb-${id}` }
  } finally {
    result.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.dispose()
    })
    for (const texture of textures) texture.dispose()
  }
}
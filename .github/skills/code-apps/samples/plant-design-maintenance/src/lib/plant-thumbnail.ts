import * as THREE from "three"
import type { PlantNode } from "@/data/plant-model"
import { createPlantAssembly, disposePlantObject } from "./plant-scene"

// 選択したポリゴンをチャットに貼るための一枚絵。使い捨ての WebGL コンテキストで 1 フレームだけ描く。
export function renderPlantNodeThumbnail(node: PlantNode, size = 176): string | null {
  let renderer: THREE.WebGLRenderer | undefined
  const scene = new THREE.Scene()
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size, false)
    renderer.setClearColor(0x000000, 0)
    const assembly = createPlantAssembly([node])
    scene.add(assembly)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x647780, 2.7))
    const sun = new THREE.DirectionalLight(0xfff5df, 2.4)
    sun.position.set(-1, 2, 1.5)
    scene.add(sun)
    const bounds = new THREE.Box3().setFromObject(assembly)
    const center = bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.001)
    const camera = new THREE.PerspectiveCamera(42, 1, radius / 100, radius * 100)
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.18
    camera.position.copy(center).add(new THREE.Vector3(1, 0.78, 1.1).normalize().multiplyScalar(distance))
    camera.lookAt(center)
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL("image/png")
  } catch {
    return null
  } finally {
    disposePlantObject(scene)
    renderer?.dispose()
    renderer?.forceContextLoss()
  }
}

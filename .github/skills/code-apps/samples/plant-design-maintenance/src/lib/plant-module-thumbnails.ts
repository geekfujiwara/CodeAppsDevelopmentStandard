import * as THREE from "three"
import { moduleNodes, type PlantModule } from "@/data/plant-design"
import { createPlantAssembly, disposePlantObject } from "./plant-scene"

export function renderModuleThumbnails(modules: PlantModule[]): Record<string, string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(480, 300)
  renderer.setPixelRatio(1)
  const images: Record<string, string> = {}
  try {
    for (const module of modules) {
      let assembly: THREE.Group | undefined
      try {
        assembly = createPlantAssembly(moduleNodes(module))
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0xeef5f8)
        scene.add(assembly, new THREE.HemisphereLight(0xffffff, 0x809297, 3))
        const light = new THREE.DirectionalLight(0xffffff, 4)
        light.position.set(10, 18, 12)
        scene.add(light)
        const sphere = new THREE.Box3().setFromObject(assembly).getBoundingSphere(new THREE.Sphere())
        const radius = Math.max(sphere.radius, 1)
        const camera = new THREE.PerspectiveCamera(35, 1.6, radius / 100, radius * 100)
        camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(radius / Math.sin(THREE.MathUtils.degToRad(17.5)) * 1.12))
        camera.lookAt(sphere.center)
        renderer.render(scene, camera)
        images[module.id] = renderer.domElement.toDataURL("image/png")
      } finally { if (assembly) disposePlantObject(assembly) }
    }
    return images
  } finally { renderer.dispose(); renderer.forceContextLoss() }
}
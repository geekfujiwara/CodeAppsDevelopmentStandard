import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import type { PlantKind, PlantNode } from "@/data/plant-model"
import { plantParts } from "../data/plant-catalog.ts"
import { heatColor, type EquipmentHeat } from "../data/plant-maintenance.ts"
import { equipmentPorts } from "../data/plant-network.ts"
import type { PlantDesign } from "../data/plant-design.ts"

export function createFailureHighlights(nodes: PlantNode[], heat: EquipmentHeat[]) {
  const root = new THREE.Group()
  for (const node of nodes) {
    const counts = heat.find((entry) => entry.nodeId === node.id)
    for (const part of plantParts(node)) {
      const count = counts?.parts[part.id] ?? 0
      if (!count) continue
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), new THREE.MeshBasicMaterial({
        color: heatColor(count), transparent: true, opacity: 0.6, depthWrite: false,
      }))
      mesh.position.fromArray(node.position).add(new THREE.Vector3(...part.position))
      mesh.userData = { nodeId: node.id, partId: part.id, count }
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: heatColor(count) }))
      mesh.add(edges)
      root.add(mesh)
    }
  }
  return root
}

export function plantPartBounds(node: PlantNode, partId: string) {
  const part = plantParts(node).find((candidate) => candidate.id === partId)
  return part ? new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...node.position).add(new THREE.Vector3(...part.position)), new THREE.Vector3(...part.size)) : null
}

const EQUIPMENT_COLORS: Record<PlantKind, number> = {
  tank: 0x9daeb5, pump: 0x237c74, exchanger: 0xc4b889,
  tower: 0xb3bdc4, valve: 0xb94846, pipe: 0x659394, component: 0x9daeb5,
}

export function createPlantAssembly(nodes: PlantNode[]) {
  const assembly = new THREE.Group()
  assembly.name = "DEMO-01"
  for (const node of nodes) {
    const group = new THREE.Group()
    group.name = node.tag
    group.userData = { nodeId: node.id, tag: node.tag, name: node.name, area: node.area, properties: node.properties, ...(node.route ? { route: node.route } : {}) }
    group.position.fromArray(node.position)
    group.rotation.y = (node.rotation ?? 0) * Math.PI / 180
    const [width, height, depth] = node.size
    const add = (geometry: THREE.BufferGeometry, position: [number, number, number], color = EQUIPMENT_COLORS[node.kind], rotation = 0) => {
      const material = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5 })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.fromArray(position)
      mesh.rotation.z = rotation
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.nodeId = node.id
      group.add(mesh)
      return mesh
    }
    const box = (size: [number, number, number], position: [number, number, number], color?: number) => add(new THREE.BoxGeometry(...size), position, color)
    const cylinder = (radius: number, length: number, position: [number, number, number], color?: number, rotation = 0) => add(new THREE.CylinderGeometry(radius, radius, length, 32), position, color, rotation)
    if (node.route) {
      const color = node.route.medium === "power" ? 0xd8ad36 : EQUIPMENT_COLORS.pipe
      node.route.points.slice(1).forEach((point, index) => {
        const start = new THREE.Vector3(...node.route!.points[index])
        const end = new THREE.Vector3(...point)
        const direction = end.clone().sub(start)
        const mesh = cylinder(node.route!.radius, direction.length(), start.clone().add(end).multiplyScalar(0.5).toArray() as [number, number, number], color)
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
        mesh.userData.segmentIndex = index
        add(new THREE.SphereGeometry(node.route!.radius, 12, 8), point, color)
      })
    } else if (node.kind === "component") {
      box([width, height, depth], [0, height / 2, 0], 0x8b9b9f)
      box([width * 0.88, height * 0.88, 0.04], [0, height / 2, depth / 2 + 0.02], 0xd7dedc)
      box([0.55, 0.35, 0.05], [-0.35, height * 0.72, depth / 2 + 0.06], 0x244943)
      for (const offset of [-0.4, 0, 0.4]) cylinder(0.055, 0.08, [offset, height * 0.48, depth / 2 + 0.07], offset === 0 ? 0xb94846 : 0x237c74).rotation.x = Math.PI / 2
      box([width + 0.15, 0.15, depth + 0.15], [0, 0.075, 0], 0x798488)
    } else if (node.kind === "tank" || node.kind === "tower") {
      cylinder(width / 2, height - 0.6, [0, height / 2 + 0.3, 0])
      add(new THREE.SphereGeometry(width / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), [0, height, 0]).scale.y = 0.35
      cylinder(width * 0.54, 0.25, [0, 0.15, 0], 0x798488)
      cylinder(0.15, 0.7, [width / 2, 1, 0], undefined, Math.PI / 2)
      cylinder(0.18, 0.55, [0, height + 0.3, 0])
      for (const level of node.kind === "tower" ? [2.4, 5, 7.3] : [1.2, height - 0.5]) {
        const ring = add(new THREE.TorusGeometry(width / 2 + 0.03, 0.035, 8, 48), [0, level, 0], 0x64777e)
        ring.rotation.x = Math.PI / 2
      }
      if (node.kind === "tower") {
        box([0.08, height, 0.08], [width / 2 + 0.2, height / 2, -0.25], 0xd5aa49)
        box([0.08, height, 0.08], [width / 2 + 0.2, height / 2, 0.25], 0xd5aa49)
        for (let step = 0.3; step < height; step += 0.35) box([0.08, 0.04, 0.5], [width / 2 + 0.2, step, 0], 0xd5aa49)
      }
    } else if (node.kind === "pump") {
      box([width + 0.3, 0.25, depth + 0.3], [0, 0.125, 0], 0x798488)
      cylinder(height * 0.32, width * 0.5, [width * 0.17, 0.8, 0], undefined, Math.PI / 2)
      cylinder(height * 0.4, width * 0.22, [-width * 0.3, 0.8, 0], 0x326b68, Math.PI / 2)
      cylinder(0.16, 0.65, [-width * 0.3, 1.15, 0])
      for (let fin = 0; fin < 7; fin++) box([0.035, 0.65, 0.75], [fin * 0.13, 0.8, 0])
    } else if (node.kind === "exchanger") {
      cylinder(depth / 2, width, [0, height * 0.65, 0], undefined, Math.PI / 2)
      for (const offset of [-width * 0.42, width * 0.42]) {
        cylinder(depth * 0.57, 0.18, [offset, height * 0.65, 0], 0x7f9297, Math.PI / 2)
        box([0.4, height * 0.5, depth * 0.8], [offset, height * 0.25, 0], 0x798488)
        cylinder(0.18, 0.8, [offset, height + 0.2, 0])
      }
    } else if (node.kind === "valve") {
      cylinder(width * 0.24, width, [0, 0, 0], undefined, Math.PI / 2)
      cylinder(0.055, height, [0, height / 2, 0], 0x63787d)
      const wheel = add(new THREE.TorusGeometry(width * 0.4, 0.055, 8, 24), [0, height, 0])
      wheel.rotation.x = Math.PI / 2
      box([width * 0.8, 0.045, 0.045], [0, height, 0])
    } else {
      cylinder(height, width, [0, 0, 0], undefined, Math.PI / 2)
      for (const offset of [-width * 0.4, width * 0.4]) cylinder(height * 1.4, 0.08, [offset, 0, 0], 0x63787d, Math.PI / 2)
    }
    for (const port of equipmentPorts(node)) {
      const direction = new THREE.Vector3(...port.direction)
      const end = new THREE.Vector3(...port.position)
      const center = end.clone().addScaledVector(direction, -0.175)
      const nozzle = cylinder(port.medium === "power" ? 0.09 : 0.15, 0.35, center.toArray() as [number, number, number], port.medium === "power" ? 0x343d3d : 0x84999c)
      nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
      nozzle.userData.portId = port.id
      const flange = cylinder(port.medium === "power" ? 0.12 : 0.23, 0.06, end.toArray() as [number, number, number], 0x667b80)
      flange.quaternion.copy(nozzle.quaternion)
    }
    assembly.add(group)
  }
  assembly.updateMatrixWorld(true)
  return assembly
}

export function disposePlantObject(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
        material.dispose()
      }
    }
  })
  for (const texture of textures) texture.dispose()
}

export type PlantDisplayMode = "all" | "ghost" | "isolate"
export type PlantView = "perspective" | "top" | "front"

export function createPlantViewer(host: HTMLElement, nodes: PlantNode[], onSelect: (id: string | null, partId?: string) => void, onError: (message: string) => void, source?: THREE.Group, site?: PlantDesign["site"]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0xe9eef0)
  const canvas = renderer.domElement
  canvas.setAttribute("aria-label", "プラント 3D モデル")
  canvas.setAttribute("role", "img")
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  canvas.style.display = "block"
  host.appendChild(canvas)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 250)
  const controls = new OrbitControls(camera, canvas)
  controls.minDistance = 1.5
  controls.maxDistance = 100
  controls.maxPolarAngle = Math.PI / 2 - 0.015
  const assembly = source ? source.clone(true) : createPlantAssembly(nodes)
  if (source) assembly.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry = object.geometry.clone()
    object.material = Array.isArray(object.material) ? object.material.map((material) => material.clone()) : object.material.clone()
  })
  const modelBounds = new THREE.Box3().setFromObject(assembly)
  const modelSize = modelBounds.getSize(new THREE.Vector3())
  const extent = Math.max(modelSize.length(), 1)
  camera.far = extent * 20
  camera.near = Math.max(0.001, extent / 10000)
  controls.minDistance = Math.max(0.05, extent / 500)
  scene.add(assembly)
  const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0x008d98)
  selectionBox.visible = false
  scene.add(selectionBox)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x647780, 2.7))
  const sun = new THREE.DirectionalLight(0xfff5df, 3)
  sun.position.set(-extent, extent * 1.5, extent)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: extent * 5 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.001
  scene.add(sun)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(32, modelSize.x * 1.4), Math.max(23, modelSize.z * 1.4)), new THREE.MeshStandardMaterial({ color: 0xd6dfe1, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.03
  ground.receiveShadow = true
  scene.add(ground)
  const grid = new THREE.GridHelper(32, 32, 0xa7b6bb, 0xc0cdd1)
  grid.position.y = -0.015
  scene.add(grid)
  if (site) {
    for (const [index, ring] of [site.boundary, ...site.exclusions.map((zone) => zone.polygon)].entries()) {
      const shape = new THREE.Shape(ring.map(([horizontal, vertical]) => new THREE.Vector2(horizontal, -vertical)))
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: index === 0 ? 0x82b5a1 : 0xd79373, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }))
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.005 + index * 0.002
      scene.add(mesh)
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: index === 0 ? 0x227759 : 0xc55c43 }))
      border.rotation.copy(mesh.rotation)
      border.position.copy(mesh.position)
      scene.add(border)
    }
  }
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let selectedId: string | null = null
  let selectedPart: string | undefined
  let heatEnabled = false
  let heatData: EquipmentHeat[] = []
  let highlights = new THREE.Group()
  scene.add(highlights)
  let mode: PlantDisplayMode = "all"
  let disposed = false
  let frame = 0
  let movement = 0
  let down: { x: number; y: number; id: number } | null = null
  const originalMaterials = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean; emissive?: THREE.Color; color?: THREE.Color }>()
  assembly.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      originalMaterials.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite,
        color: "color" in material && material.color instanceof THREE.Color ? material.color.clone() : undefined,
        emissive: "emissive" in material && material.emissive instanceof THREE.Color ? material.emissive.clone() : undefined })
    }
  })

  const render = () => {
    if (disposed || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!disposed) renderer.render(scene, camera)
    })
  }
  const stopMotion = () => cancelAnimationFrame(movement)
  controls.addEventListener("start", stopMotion)
  controls.addEventListener("change", render)

  const fit = (box: THREE.Box3, view: PlantView = "perspective", animate = true) => {
    stopMotion()
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius
    const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect))
    const distance = Math.max(3, radius / Math.sin(halfFov) * 1.12)
    controls.maxDistance = Math.max(100, distance * 1.5)
    const direction = view === "top" ? new THREE.Vector3(0, 1, 0.001) : view === "front" ? new THREE.Vector3(0, 0.15, 1) : new THREE.Vector3(1, 0.78, 1.1)
    const destination = center.clone().addScaledVector(direction.normalize(), distance)
    const oldPosition = camera.position.clone()
    const oldTarget = controls.target.clone()
    const start = performance.now()
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const step = () => {
      if (disposed) return
      const progress = !animate || reducedMotion ? 1 : Math.min(1, (performance.now() - start) / 320)
      const eased = 1 - Math.pow(1 - progress, 3)
      camera.position.lerpVectors(oldPosition, destination, eased)
      controls.target.lerpVectors(oldTarget, center, eased)
      controls.update()
      render()
      if (progress < 1) movement = requestAnimationFrame(step)
    }
    step()
  }
  const updateSelection = () => {
    for (const group of assembly.children) {
      const selected = group.userData.nodeId === selectedId
      group.visible = mode !== "isolate" || !selectedId || selected
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const ghost = mode === "ghost" && !!selectedId && !selected
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          const original = originalMaterials.get(material)!
          if ("emissive" in material && material.emissive instanceof THREE.Color && original.emissive) material.emissive.copy(selected && !heatEnabled ? new THREE.Color(0x16767a) : original.emissive)
          if ("color" in material && material.color instanceof THREE.Color && original.color) {
            material.color.copy(heatEnabled ? new THREE.Color(heatColor(heatData.find((entry) => entry.nodeId === group.userData.nodeId)?.total ?? 0)) : original.color)
          }
          material.transparent = ghost || original.transparent
          material.opacity = ghost ? 0.12 : original.opacity
          material.depthWrite = ghost ? false : original.depthWrite
        }
        object.castShadow = !ghost
      })
    }
    const selected = assembly.children.find((group) => group.userData.nodeId === selectedId)
    for (const hotspot of highlights.children) {
      hotspot.visible = heatEnabled && (mode === "all" || !selectedId || hotspot.userData.nodeId === selectedId)
    }
    selectionBox.visible = !!selected
    if (selected) {
      const node = nodes.find((candidate) => candidate.id === selectedId)
      const bounds = !source && node && selectedPart ? plantPartBounds(node, selectedPart) : null
      if (bounds) selectionBox.box.copy(bounds)
      else selectionBox.box.setFromObject(selected)
    }
    render()
  }
  const pick = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect()
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const candidates = assembly.children.filter((group) => group.visible && !(mode === "ghost" && selectedId && group.userData.nodeId !== selectedId))
    const hotspots = highlights.children.filter((object) => object.visible)
    const hits = raycaster.intersectObjects([...candidates, ...hotspots], true).filter((hit) => typeof hit.object.userData.nodeId === "string")
    return hits[0]?.object.userData as { nodeId: string; partId?: string } | undefined
  }
  const pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) { down = null; return }
    down = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  const pointerUp = (event: PointerEvent) => {
    if (down && down.id === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) {
      const hit = pick(event)
      onSelect(hit?.nodeId ?? null, hit?.partId)
    }
    down = null
  }
  const pointerCancel = () => { down = null }
  const pointerMove = (event: PointerEvent) => { canvas.style.cursor = event.buttons ? "grabbing" : pick(event) ? "pointer" : "grab" }
  const contextLost = (event: Event) => { event.preventDefault(); onError("3D 描画が中断されました。再読み込みしてください。") }
  canvas.addEventListener("pointerdown", pointerDown)
  canvas.addEventListener("pointerup", pointerUp)
  canvas.addEventListener("pointercancel", pointerCancel)
  canvas.addEventListener("pointermove", pointerMove)
  canvas.addEventListener("webglcontextlost", contextLost)
  const resize = () => {
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    render()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  fit(new THREE.Box3().setFromObject(assembly), "perspective", false)

  return {
    select(id: string | null, displayMode: PlantDisplayMode, partId?: string) {
      selectedId = id
      selectedPart = partId
      mode = displayMode
      updateSelection()
    },
    focus() {
      const selected = assembly.children.find((group) => group.userData.nodeId === selectedId)
      const node = nodes.find((candidate) => candidate.id === selectedId)
      const bounds = !source && node && selectedPart ? plantPartBounds(node, selectedPart) : null
      if (selected) fit(bounds ?? new THREE.Box3().setFromObject(selected))
    },
    heat(data: EquipmentHeat[], enabled: boolean) {
      heatData = data
      heatEnabled = enabled && !source
      scene.remove(highlights)
      disposePlantObject(highlights)
      highlights = createFailureHighlights(nodes, heatEnabled ? data : [])
      scene.add(highlights)
      updateSelection()
    },
    view(view: PlantView) { fit(new THREE.Box3().setFromObject(assembly), view) },
    zoom(factor: number) {
      stopMotion()
      const offset = camera.position.clone().sub(controls.target)
      offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance))
      camera.position.copy(controls.target).add(offset)
      controls.update()
      render()
    },
    dispose() {
      disposed = true
      stopMotion()
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener("pointerdown", pointerDown)
      canvas.removeEventListener("pointerup", pointerUp)
      canvas.removeEventListener("pointercancel", pointerCancel)
      canvas.removeEventListener("pointermove", pointerMove)
      canvas.removeEventListener("webglcontextlost", contextLost)
      controls.dispose()
      disposePlantObject(scene)
      sun.shadow.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
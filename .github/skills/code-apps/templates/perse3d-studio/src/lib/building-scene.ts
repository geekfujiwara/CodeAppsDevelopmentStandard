import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { Sky } from "three/addons/objects/Sky.js"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import type { BuildingSpec, Materials } from "@/lib/building-spec"
import { finishesOf, floorBaseY, totalHeight } from "@/lib/building-spec"
import { Batch, FL, addFloor, addFoundation, addLowerRoofs, addRoof, addTopCeiling, findEntrance, siteLayout } from "@/lib/building-geometry"
import { applyPbr, getPbr, releasePbrSlots } from "@/lib/procedural-textures"
import { applyLibrary, disposeLibrary, loadLibrarySet } from "@/lib/material-library"
import { ceilingHeight, isCeilingMount, isOutdoor, obstacleBoxes, type FurnitureItem } from "@/lib/furniture"
import { FurnitureFactory } from "@/lib/furniture-render"
import { createCspSafeGltfLoader } from "@/lib/csp-safe-gltf"
import { canStep, guardBlocks, slabsWithOpenings, stairLayout, stairsOf, walkSurface, type StairLayout } from "@/lib/stairs"

export type ViewMode = "orbit" | "dollhouse" | "walk"
export type CameraPose = { mode: ViewMode; position: [number, number, number]; target: [number, number, number]; yaw: number; pitch: number; level: number }
export type ViewerStatus = { mode: ViewMode; x: number; z: number; yaw: number; level: number }
export type Pin = { id: string; position: [number, number, number]; color: string; label: string }
export type MoveInput = { forward: number; strafe: number; turn: number }

const EYE = 1.55
const RADIUS = 0.22
/**
 * ライトマップの明るさ係数。Blender の拡散光 → three.js の放射照度は π 倍。
 * 焼くのは間接光だけで、リアルタイムの半球光を弱めるぶんを 1.3 倍で補う（サンプルの LDK で GLB 無しの見た目と平均の明るさを合わせた値）
 */
const LIGHTMAP_GAIN = Math.PI * 1.3

function findExtra(o: THREE.Object3D, key: string): unknown {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData[key] !== undefined) return p.userData[key]
  return undefined
}

type MatKey =
  | "exteriorWall" | "interiorWall" | "floor" | "ceiling" | "roof" | "flatRoof" | "soffit" | "fascia" | "sash" | "windowBoard"
  | "casing" | "baseboard" | "door" | "section" | "foundation" | "concrete" | "road" | "glass" | "ground" | "foliage" | "foliageDark" | "trunk"

/** 太陽の方向（北 = -z、東 = +x、南 = +z）。6 時に東から昇り、12 時に南中、18 時に西へ沈む */
function sunDirection(hour: number) {
  const phi = (Math.PI * (hour - 6)) / 12
  const maxElev = (52 * Math.PI) / 180
  const elev = Math.max((2 * Math.PI) / 180, maxElev * Math.sin(Math.min(Math.PI, Math.max(0, phi))))
  return new THREE.Vector3(Math.cos(elev) * Math.cos(phi), Math.sin(elev), Math.cos(elev) * Math.sin(phi)).normalize()
}

export class BuildingViewer {
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private gtao: GTAOPass
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(55, 1, 0.05, 900)
  private controls: OrbitControls
  private sun = new THREE.DirectionalLight("#fff4e0", 3)
  private hemi = new THREE.HemisphereLight("#cfe6ff", "#5f6b45", 0.35)
  private sky = new Sky()
  private envScene = new THREE.Scene()
  private envSky = new Sky()
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private roomEnvRT: THREE.WebGLRenderTarget
  private envTimer = 0
  private building = new THREE.Group()
  private baseGroup = new THREE.Group()
  private landscape = new THREE.Group()
  private pinGroup = new THREE.Group()
  private imported: THREE.Object3D | null = null
  private floorGroups: THREE.Group[] = []
  private roofGroup = new THREE.Group()
  private ceilingGroup = new THREE.Group()
  private roomLights = new THREE.Group()
  private mats = {} as Record<MatKey, THREE.MeshStandardMaterial>
  private pendingMaterials: Materials | null = null
  private spec: BuildingSpec | null = null
  private mode: ViewMode = "orbit"
  private level = 0
  private stairLayouts: StairLayout[] = []
  /** 取り込んだ GLB に焼き込みの間接光がある（環境光を弱めて二重に明るくしない） */
  bakedLighting = false
  private cutLevel = 99
  private yaw = 0
  private pitch = 0
  private keys = new Set<string>()
  private touchInput: MoveInput = { forward: 0, strafe: 0, turn: 0 }
  private drag: { x: number; y: number; moved: boolean } | null = null
  private raf = 0
  private timer = new THREE.Timer()
  private lastStatus = 0
  private resizeObserver: ResizeObserver
  private raycaster = new THREE.Raycaster()
  private disposed = false
  private quality = true
  private glassMeshes: THREE.Mesh[] = []
  private hemiDay = 0.4
  private baseExposure = 0.5
  private floorTint = "#b98a5a"
  private container: HTMLElement

  pickMode = false
  onStatus?: (s: ViewerStatus) => void
  onPick?: (p: [number, number, number]) => void
  onPinClick?: (id: string) => void
  /** 家具: 選択（null = 解除）・ドラッグ移動の確定・配置クリック・キー操作 */
  onFurnitureSelect?: (id: string | null) => void
  onFurnitureMove?: (id: string, x: number, z: number) => void
  onFurniturePlace?: (type: string, x: number, z: number, level: number) => void
  onFurnitureAction?: (action: "rotate" | "delete" | "cancel") => void

  private furnitureFactory = new FurnitureFactory()
  private furniture: FurnitureItem[] = []
  private indoorFurniture = new Map<number, THREE.Group>()
  private outdoorFurniture = new THREE.Group()
  private selectedFurniture: string | null = null
  private selectionBox: THREE.BoxHelper | null = null
  private placeType: string | null = null
  private furnDrag: { id: string; group: THREE.Object3D; plane: THREE.Plane; offset: THREE.Vector3; moved: boolean } | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.5
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.style.display = "block"
    this.renderer.domElement.style.touchAction = "none"
    container.appendChild(this.renderer.domElement)

    // 後処理: シーン → GTAO（隅・入隅の陰影）→ トーンマップ
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.gtao = new GTAOPass(this.scene, this.camera, 512, 512)
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.5, scale: 1.1, samples: 16 })
    this.gtao.blendIntensity = 0.9
    // ガラスは AO の深度・法線から除外する（含めると窓が白く濁る）
    const gtaoRender = this.gtao.render.bind(this.gtao)
    this.gtao.render = (...args: Parameters<GTAOPass["render"]>) => {
      const shown = this.glassMeshes.filter(m => m.visible)
      for (const m of shown) m.visible = false
      gtaoRender(...args)
      for (const m of shown) m.visible = true
    }
    this.composer.addPass(this.gtao)
    this.composer.addPass(new OutputPass())

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.minDistance = 2
    this.controls.maxDistance = 80

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.radius = 3
    const sc = this.sun.shadow.camera
    sc.left = sc.bottom = -20
    sc.right = sc.top = 20
    sc.near = 1
    sc.far = 120

    // 物理ベースの空（時刻と連動）と、その空から作る環境光（映り込み・天空光）
    for (const s of [this.sky, this.envSky]) {
      s.scale.setScalar(450)
      const u = s.material.uniforms
      u.turbidity.value = 4
      u.rayleigh.value = 1.2
      u.mieCoefficient.value = 0.004
      u.mieDirectionalG.value = 0.8
    }
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: "#3d4a2f" }))
    envGround.rotation.x = -Math.PI / 2
    envGround.position.y = -1
    this.envScene.add(this.envSky, envGround)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    // 内見中は室内の拡散光（白い部屋の照り返し）を環境光に使う
    const room = new RoomEnvironment()
    this.roomEnvRT = this.pmrem.fromScene(room, 0.04)
    room.dispose()
    this.scene.environmentIntensity = 0.3

    this.scene.add(this.sky, this.sun, this.sun.target, this.hemi, this.building, this.landscape, this.pinGroup)
    this.building.position.y = FL
    this.scene.fog = new THREE.Fog("#cfdde8", 80, 380)

    this.createMaterials()

    const el = this.renderer.domElement
    el.addEventListener("pointerdown", this.handlePointerDown)
    window.addEventListener("pointermove", this.handlePointerMove)
    window.addEventListener("pointerup", this.handlePointerUp)
    el.tabIndex = 0
    el.addEventListener("keydown", this.handleKeyDown)
    el.addEventListener("keyup", this.handleKeyUp)
    el.addEventListener("blur", () => this.keys.clear())

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.setTimeOfDay(14)
    this.loop()
  }

  private createMaterials() {
    const std = (color: string, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
    this.mats = {
      exteriorWall: std("#ffffff", 1),
      interiorWall: std("#ffffff", 1),
      floor: std("#ffffff", 1),
      ceiling: std("#f7f6f2", 0.95),
      roof: std("#ffffff", 1),
      flatRoof: std("#5b5f63", 0.9),
      soffit: std("#f1efe9", 0.85),
      fascia: std("#2f2f2f", 0.45, 0.35),
      sash: std("#2f2f2f", 0.35, 0.6),
      windowBoard: std("#efe9df", 0.55),
      casing: std("#f3f1ec", 0.6),
      baseboard: std("#f0ede6", 0.6),
      door: std("#e9e2d5", 0.5),
      section: std("#e7e4dd", 0.9),
      foundation: std("#ffffff", 1),
      concrete: std("#ffffff", 1),
      road: std("#ffffff", 1),
      glass: new THREE.MeshPhysicalMaterial({
        color: "#d6e6ee",
        metalness: 0,
        roughness: 0.02,
        transparent: true,
        opacity: 0.12,
        envMapIntensity: 0.6,
        specularIntensity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      ground: std("#ffffff", 1),
      foliage: std("#4f7a3a", 0.85),
      foliageDark: std("#3d6330", 0.85),
      trunk: std("#6b4a2f", 0.9),
    }
    for (const m of [this.mats.foliage, this.mats.foliageDark]) m.flatShading = true
    applyPbr(this.mats.foundation, getPbr({ type: "concrete" }, "#a9a69f", "foundation"))
    applyPbr(this.mats.concrete, getPbr({ type: "concrete" }, "#c2bfb7", "concrete"))
    applyPbr(this.mats.road, getPbr({ type: "concrete" }, "#5d6063", "road"))
    for (const [mat, slot, hex] of [[this.mats.foundation, "concrete", "#a9a69f"], [this.mats.concrete, "concrete", "#c2bfb7"], [this.mats.road, "road", null]] as const) {
      loadLibrarySet(slot)?.then(set => !this.disposed && applyLibrary(mat, set, hex)).catch(() => undefined)
    }
  }

  // ───────────────────────── 建物生成 ─────────────────────────

  setSpec(spec: BuildingSpec) {
    this.spec = spec
    this.stairLayouts = stairsOf(spec).map(s => stairLayout(spec, s))
    for (const g of [this.building, this.baseGroup, this.landscape]) this.clearGroup(g)
    this.floorGroups = []
    this.roofGroup = new THREE.Group()
    this.ceilingGroup = new THREE.Group()
    this.roomLights = new THREE.Group()
    this.baseGroup = new THREE.Group()
    this.applyMaterials(spec.materials)

    const batch = new Batch()
    for (const floor of spec.floors) {
      const g = new THREE.Group()
      g.userData.level = floor.level
      const base = floorBaseY(spec, floor.level)
      addFloor(batch, spec, floor)
      g.add(...batch.build(this.mats))
      for (const room of floor.rooms) {
        const light = new THREE.PointLight("#ffe2b8", Math.max(8, room.area * 1.2), 9, 2)
        light.position.set(room.x, base + floor.height - 0.35, room.z)
        light.userData.level = floor.level
        this.roomLights.add(light)
      }
      this.floorGroups.push(g)
      this.building.add(g)
    }
    addFoundation(batch, spec.floors[0]?.walls ?? [])
    this.baseGroup.add(...batch.build(this.mats))
    addTopCeiling(batch, spec)
    this.ceilingGroup.add(...batch.build(this.mats))
    // 下の階だけの部分の陸屋根は屋根と一緒に扱う（ドールハウスでは隠し、内見では天井として見える）
    addLowerRoofs(batch, spec)
    addRoof(batch, spec)
    this.roofGroup.add(...batch.build(this.mats))
    this.building.add(this.baseGroup, this.roofGroup, this.ceilingGroup, this.roomLights)
    this.roomLights.visible = false
    this.buildLandscape(spec)
    this.renderFurniture()
    this.glassMeshes = []
    this.building.traverse(o => {
      if ((o as THREE.Mesh).isMesh && o.userData.glass) this.glassMeshes.push(o as THREE.Mesh)
    })
    this.fitShadow()
    this.applyVisibility()
    if (this.mode !== "walk") this.frame()
  }

  private buildLandscape(spec: BuildingSpec) {
    const { width: W, depth: D } = spec.footprint
    const site = siteLayout(spec)
    const b = new Batch()
    b.poly("ground", [[-200, 0, -200], [200, 0, -200], [200, 0, 200], [-200, 0, 200]], [0, 1, 0])
    b.poly("road", [[-200, 0.004, site.roadZ0], [200, 0.004, site.roadZ0], [200, 0.004, site.roadZ1], [-200, 0.004, site.roadZ1]], [0, 1, 0])
    // 縁石
    b.solid(-200, 0, site.curbZ0, 200, 0.12, site.roadZ0, "concrete")
    const { x0: ax0, x1: ax1 } = site.approach
    // アプローチと駐車場の土間コンクリート
    const pad = (r: { x0: number; x1: number; z0: number; z1: number }) =>
      b.poly("concrete", [[r.x0, 0.006, r.z0], [r.x1, 0.006, r.z0], [r.x1, 0.006, r.z1], [r.x0, 0.006, r.z1]], [0, 1, 0])
    pad(site.approach)
    if (site.parking) pad(site.parking)
    const px0 = site.parking?.x0 ?? W + 10
    const meshes = b.build(this.mats)
    for (const m of meshes) m.castShadow = false
    this.landscape.add(...meshes)

    const tree = (x: number, z: number, h: number, dark: boolean) => {
      const g = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, h * 0.5, 7), this.mats.trunk)
      trunk.position.y = h * 0.25
      g.add(trunk)
      for (let i = 0; i < 3; i++) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(h * (0.26 - i * 0.04), 1), dark ? this.mats.foliageDark : this.mats.foliage)
        crown.position.set((i - 1) * h * 0.08, h * (0.55 + i * 0.13), ((i * 7) % 3 - 1) * h * 0.06)
        crown.scale.y = 1.15
        g.add(crown)
      }
      g.traverse(o => ((o as THREE.Mesh).castShadow = true))
      g.position.set(x, 0, z)
      this.landscape.add(g)
    }
    const spots: [number, number][] = [[-3, -2], [W + 3, -1.5], [-3.5, D * 0.6], [W + 3.2, D * 0.7], [W * 0.7, -4], [-6, D + 2.5], [W + 6, D + 2]]
    spots.forEach(([x, z], i) => tree(x, z, 2.4 + (i % 3) * 0.7, i % 2 === 0))
    // 建物まわりの低木
    for (let x = 0.6; x < W - 0.4; x += 1.1) {
      if (x > ax0 - 0.4 && x < ax1 + 0.4) continue
      if (x > px0 - 0.3) continue
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), this.mats.foliageDark)
      s.scale.set(1.2, 0.8, 1)
      s.position.set(x, 0.22, D + 0.55)
      s.castShadow = true
      this.landscape.add(s)
    }
  }

  /** 影の範囲を建物＋外構に合わせて絞り、影の解像度（1 テクセルの実寸）を上げる */
  private fitShadow() {
    const size = this.quality ? 4096 : 2048
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size)
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
    if (!this.spec) return
    const { width: W, depth: D } = this.spec.footprint
    const half = Math.max(W, D, totalHeight(this.spec)) / 2 + 7
    const sc = this.sun.shadow.camera
    sc.left = sc.bottom = -half
    sc.right = sc.top = half
    sc.updateProjectionMatrix()
  }

  setMaterials(m: Materials) {
    // カラーピッカーの連続入力でテクスチャを作り直し過ぎないよう、次のフレームでまとめて反映する
    this.pendingMaterials = m
  }

  private applyMaterials(m: Materials) {
    const f = finishesOf(m)
    // まず手続き生成テクスチャで即時に表示し、実写材質が読めたら差し替える（読めなければ手続き生成のまま）
    applyPbr(this.mats.exteriorWall, getPbr({ type: "wall", finish: f.wall }, m.exteriorWall, "exteriorWall"))
    applyPbr(this.mats.roof, getPbr({ type: "roof", finish: f.roof }, m.roof, "roof"))
    applyPbr(this.mats.floor, getPbr({ type: "floor", finish: f.floor }, m.floor, "floor"))
    this.floorTint = m.floor
    applyPbr(this.mats.interiorWall, getPbr({ type: "interior" }, m.interiorWall, "interiorWall"))
    applyPbr(this.mats.ground, getPbr({ type: "grass" }, m.ground, "ground"))
    this.mats.flatRoof.color.set(m.roof)
    this.mats.fascia.color.set(m.trim)
    this.mats.sash.color.set(m.trim)
    this.pendingMaterials = null
    const token = ++this.materialToken
    const metal = (slot: string) => (slot.endsWith(":metal") ? 0.55 : 0)
    const swaps: [THREE.MeshStandardMaterial, string, string | null][] = [
      [this.mats.exteriorWall, `wall:${f.wall}`, m.exteriorWall],
      [this.mats.roof, `roof:${f.roof}`, m.roof],
      [this.mats.floor, `floor:${f.floor}`, m.floor],
      [this.mats.ground, "grass", m.ground],
    ]
    this.applyLibraryAsync(token, swaps.map(([mat, slot, hex]) => [mat, slot, hex, metal(slot)]))
  }

  private materialToken = 0
  /** 実写材質の読み込み状態（"library" = すべて実写、"procedural" = 1 つ以上が手続き生成のまま） */
  materialSource: "pending" | "library" | "procedural" = "pending"

  private applyLibraryAsync(token: number, swaps: [THREE.MeshStandardMaterial, string, string | null, number][]) {
    this.materialSource = "pending"
    Promise.allSettled(
      swaps.map(([mat, slot, hex, metalness]) => {
        const p = loadLibrarySet(slot)
        if (!p) return Promise.reject(new Error(`no library slot ${slot}`))
        return p.then(set => {
          // 読み込み中に色・仕上げが変わっていたら古い結果は捨てる
          if (token === this.materialToken && !this.disposed) applyLibrary(mat, set, hex, metalness)
        })
      }),
    ).then(results => {
      if (token !== this.materialToken) return
      const failed = results.filter(r => r.status === "rejected")
      this.materialSource = failed.length ? "procedural" : "library"
      if (failed.length) console.warn("[materials] 実写材質を読めなかったスロットは手続き生成のまま表示します", failed.map(f => (f as PromiseRejectedResult).reason?.message))
    })
  }

  // ───────────────────────── 表示モード ─────────────────────────

  setMode(mode: ViewMode) {
    const prev = this.mode
    this.mode = mode
    this.controls.enabled = mode !== "walk"
    this.camera.fov = mode === "walk" ? 70 : 55
    this.camera.updateProjectionMatrix()
    // 室内は天空光が回り込みにくい分を環境光で補う
    this.applyLighting()
    if (mode === "walk" && prev !== "walk") this.enterWalk()
    if (mode !== "walk" && prev === "walk") this.frame()
    this.applyVisibility()
    this.emitStatus(true)
    if (mode === "walk") this.renderer.domElement.focus()
  }

  getMode() {
    return this.mode
  }

  setCutLevel(level: number) {
    this.cutLevel = level
    this.applyVisibility()
  }

  setRoomLights(on: boolean) {
    this.roomLights.visible = on
  }

  /** 高品質（アンビエントオクルージョン）の切替。低スペック端末では off にする */
  setQuality(on: boolean) {
    this.quality = on
    this.fitShadow()
    this.resize()
  }

  setTimeOfDay(hour: number) {
    const dir = sunDirection(hour)
    const elev = Math.asin(dir.y)
    const day = Math.min(1, Math.max(0, elev / 0.35))
    const center = this.spec ? new THREE.Vector3(this.spec.footprint.width / 2, 0, this.spec.footprint.depth / 2) : new THREE.Vector3(5, 0, 4)
    this.sun.target.position.copy(center)
    this.sun.position.copy(center).addScaledVector(dir, 50)
    const warm = 1 - Math.min(1, elev / 0.5)
    this.sun.color.setRGB(1, 0.93 - 0.25 * warm, 0.82 - 0.45 * warm)
    this.sun.intensity = 0.6 + 5.4 * day
    this.hemiDay = 0.15 + 0.35 * day
    if (this.mode !== "walk") this.hemi.intensity = this.hemiDay
    for (const s of [this.sky, this.envSky]) s.material.uniforms.sunPosition.value.copy(dir)
    const fog = new THREE.Color().setRGB(0.72 + 0.2 * warm * (1 - day * 0.5), 0.8 - 0.05 * warm, 0.88 - 0.25 * warm).multiplyScalar(0.55 + 0.45 * day)
    ;(this.scene.fog as THREE.Fog).color.copy(fog)
    this.baseExposure = 0.5 + 0.25 * (1 - day)
    this.renderer.toneMappingExposure = this.baseExposure * (this.mode === "walk" ? 1.25 : 1)
    window.clearTimeout(this.envTimer)
    this.envTimer = window.setTimeout(() => this.updateEnvironment(), this.envRT ? 120 : 0)
  }

  private updateEnvironment() {
    if (this.disposed) return
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000)
    this.envRT?.dispose()
    this.envRT = rt
    this.applyLighting()
  }

  /** 外観は空の環境光、内見は室内の環境光 + 床からの照り返し */
  private applyLighting() {
    const walk = this.mode === "walk"
    // ソフトウェア描画（GPU の無い VDI・リモート デスクトップ等）では PMREM の環境マップを使うと
    // 照明を受ける面がすべて真っ黒になる。環境マップを外し、半球光を強めて代わりにする
    const env = this.softwareRenderer ? null : walk ? this.roomEnvRT.texture : (this.envRT?.texture ?? null)
    this.scene.environment = env
    this.scene.environmentIntensity = walk ? 0.9 : 0.3
    this.renderer.toneMappingExposure = this.baseExposure * (walk ? 1.25 : 1)
    if (walk) {
      this.hemi.color.set("#fff4e6")
      this.hemi.groundColor.set(this.floorTint)
      // 環境マップが無いと天井は床の照り返し色だけで照らされ、床の色に染まる（茶色い天井）。白い壁・天井からの反射ぶんを混ぜる
      if (this.softwareRenderer) this.hemi.groundColor.lerp(new THREE.Color("#f2efe9"), 0.65)
      this.hemi.intensity = 1.2
    } else {
      this.hemi.color.set("#cfe6ff")
      this.hemi.groundColor.set("#5f6b45")
      this.hemi.intensity = this.hemiDay
    }
    if (this.softwareRenderer) this.hemi.intensity += walk ? 0.6 : 0.9
    // 焼き込んだ間接光があるときは、それが室内の照り返しを担う。半球光・環境マップは窓の外と家具のために少しだけ残す
    if (this.bakedLighting && walk) {
      this.hemi.intensity *= 0.35
      this.scene.environmentIntensity = 0.35
    }
  }

  /** WebGL がソフトウェア描画（SwiftShader / WARP / llvmpipe）か。初回参照時に判定する */
  private softwareRendererCache: boolean | null = null
  get softwareRenderer(): boolean {
    if (this.softwareRendererCache === null) {
      try {
        const gl = this.renderer.getContext()
        const ext = gl.getExtension("WEBGL_debug_renderer_info")
        const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
        this.softwareRendererCache = /swiftshader|llvmpipe|software|microsoft basic render|warp/i.test(name)
      } catch {
        this.softwareRendererCache = false
      }
    }
    return this.softwareRendererCache
  }

  private applyVisibility() {
    const dollhouse = this.mode === "dollhouse"
    this.roofGroup.visible = !dollhouse
    this.ceilingGroup.visible = this.mode === "walk"
    for (const g of this.floorGroups) g.visible = !dollhouse || g.userData.level <= this.cutLevel
    for (const [level, g] of this.indoorFurniture) {
      g.visible = !dollhouse || level <= this.cutLevel
      // 天井の照明器具は内見でだけ見せる（上から見ると宙に浮いて部屋を隠す）。選択中は位置が分かるよう表示する
      for (const c of g.children) if (c.userData.ceiling) c.visible = this.mode === "walk" || c.userData.furnitureId === this.selectedFurniture
    }
    this.roomLights.children.forEach(l => (l.visible = !dollhouse || l.userData.level <= this.cutLevel))
    // Blender の GLB を取り込んだ場合は手続き生成モデルと外構を隠す（当たり判定は spec の壁を引き続き使う）
    this.building.visible = !this.imported
    this.landscape.visible = !this.imported
    this.outdoorFurniture.visible = !this.imported
    this.updateSelectionBox()
  }

  // ───────────────────────── 家具・車 ─────────────────────────

  setFurniture(items: FurnitureItem[]) {
    this.furniture = items
    this.renderFurniture()
  }

  /** 次のクリックでこの種類を置く（null で解除） */
  setPlaceType(type: string | null) {
    this.placeType = type
    this.renderer.domElement.style.cursor = type ? "crosshair" : ""
  }

  selectFurniture(id: string | null) {
    this.selectedFurniture = id
    this.applyVisibility()
  }

  private renderFurniture() {
    for (const g of this.indoorFurniture.values()) g.removeFromParent()
    this.indoorFurniture.clear()
    this.outdoorFurniture.clear()
    if (!this.spec) return
    if (!this.outdoorFurniture.parent) this.scene.add(this.outdoorFurniture)
    for (const item of this.furniture) {
      const ceiling = isCeilingMount(item.type)
      const g = this.furnitureFactory.build(item, ceiling ? ceilingHeight(this.spec, item.level) : 0)
      if (!g) continue
      g.userData.ceiling = ceiling
      if (isOutdoor(item.type)) {
        this.outdoorFurniture.add(g)
        continue
      }
      let lg = this.indoorFurniture.get(item.level)
      if (!lg) {
        lg = new THREE.Group()
        lg.position.y = floorBaseY(this.spec, item.level)
        this.indoorFurniture.set(item.level, lg)
        this.building.add(lg)
      }
      lg.add(g)
    }
    this.applyVisibility()
  }

  private findFurnitureGroup(id: string | null): THREE.Object3D | null {
    if (!id) return null
    let found: THREE.Object3D | null = null
    const visit = (root: THREE.Object3D) =>
      root.traverse(o => {
        if (!found && o.userData.furnitureId === id && !(o as THREE.Mesh).isMesh) found = o
      })
    for (const g of this.indoorFurniture.values()) visit(g)
    visit(this.outdoorFurniture)
    return found
  }

  private updateSelectionBox() {
    const g = this.findFurnitureGroup(this.selectedFurniture)
    if (!g || !g.parent?.visible || !this.building.visible) {
      if (this.selectionBox) {
        this.scene.remove(this.selectionBox)
        this.selectionBox.dispose()
        this.selectionBox = null
      }
      return
    }
    if (!this.selectionBox) {
      this.selectionBox = new THREE.BoxHelper(g, 0xf59e0b)
      ;(this.selectionBox.material as THREE.LineBasicMaterial).depthTest = false
      this.selectionBox.renderOrder = 20
      this.scene.add(this.selectionBox)
    }
    this.selectionBox.setFromObject(g)
  }

  private raycastFurniture(): { id: string; group: THREE.Object3D; point: THREE.Vector3 } | null {
    const targets: THREE.Object3D[] = []
    for (const g of this.indoorFurniture.values()) if (g.visible) g.traverseVisible(o => (o as THREE.Mesh).isMesh && targets.push(o))
    if (this.outdoorFurniture.visible) this.outdoorFurniture.traverseVisible(o => (o as THREE.Mesh).isMesh && targets.push(o))
    if (!targets.length || !this.building.visible) return null
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit) return null
    const id = hit.object.userData.furnitureId as string
    const group = this.findFurnitureGroup(id)
    return group ? { id, group, point: hit.point } : null
  }

  /** 配置クリック: 屋内家具は見えている床、車は地面・土間を狙う（屋根は貫通する） */
  private raycastPlacement(outdoor: boolean): { x: number; z: number; level: number } | null {
    const targets: THREE.Object3D[] = []
    if (outdoor) {
      this.landscape.traverseVisible(o => (o as THREE.Mesh).isMesh && ["ground", "concrete", "road"].includes(o.name) && targets.push(o))
    } else {
      for (const g of this.floorGroups) {
        if (!g.visible) continue
        g.traverseVisible(o => (o as THREE.Mesh).isMesh && o.name === "floor" && targets.push(o))
      }
    }
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit) return null
    let level = 0
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (typeof o.userData.level === "number") {
        level = o.userData.level
        break
      }
    }
    return { x: Math.round(hit.point.x * 100) / 100, z: Math.round(hit.point.z * 100) / 100, level }
  }

  private setNdc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
  }

  frame() {
    if (!this.spec) return
    const { width: W, depth: D } = this.spec.footprint
    const H = totalHeight(this.spec) + FL
    const size = Math.max(W, D, H)
    this.controls.target.set(W / 2, H * 0.4, D / 2)
    this.camera.position.set(W / 2 + size * 1.1, H * 0.55 + size * 0.45, D + size * 1.35)
    this.controls.update()
  }

  // ───────────────────────── 内見（ウォークスルー） ─────────────────────────

  private eyeY(x: number, z: number, level: number) {
    if (!this.spec) return EYE
    const s = this.surface(x, z, level)
    return (s ? s.y : FL + floorBaseY(this.spec, level)) + EYE
  }

  private surface(x: number, z: number, level: number) {
    return this.spec ? walkSurface(this.spec, this.stairLayouts, x, z, level, FL) : null
  }

  private onSlab(x: number, z: number, level: number) {
    const floor = this.spec?.floors.find(f => f.level === level)
    if (!floor || !this.spec) return false
    const e = level > 0 ? 0 : 0.1
    return slabsWithOpenings(this.spec, floor).some(s => x >= s.x - e && x <= s.x + s.w + e && z >= s.z - e && z <= s.z + s.d + e)
  }

  /** 1 歩ぶん動けるか（段差・壁・家具）。階段の中ほどを越えたら階を切り替える */
  private tryStep(nx: number, nz: number): boolean {
    const p = this.camera.position
    const cur = this.surface(p.x, p.z, this.level)
    const next = this.surface(nx, nz, this.level)
    if (!next || !canStep(cur, next)) return false
    // 段の上を上り下りしているあいだは、吹き抜けの手すり壁（頭上にある開口の縁）にぶつけない
    if (!this.walkable(nx, nz, next.level, !!cur?.stair && next.stair)) return false
    p.x = nx
    p.z = nz
    if (next.level !== this.level) {
      this.level = next.level
      this.emitStatus(true)
    }
    return true
  }

  private enterWalk() {
    if (!this.spec) return
    const ent = findEntrance(this.spec)
    const { width: W, depth: D } = this.spec.footprint
    this.level = 0
    if (ent) {
      const d = ent.door
      const cx = d.x + d.w / 2
      const cz = d.z + d.d / 2
      const off = 2.6
      const s = ent.side
      const pos = s === "+z" ? [cx, cz + off] : s === "-z" ? [cx, cz - off] : s === "+x" ? [cx + off, cz] : [cx - off, cz]
      this.camera.position.set(pos[0], EYE, pos[1])
      this.yaw = s === "+z" ? 0 : s === "-z" ? Math.PI : s === "+x" ? Math.PI / 2 : -Math.PI / 2
    } else {
      const room = this.spec.floors[0]?.rooms[0]
      const x = room?.x ?? W / 2
      const z = room?.z ?? D + 3
      this.camera.position.set(x, this.eyeY(x, z, 0), z)
      this.yaw = 0
    }
    this.pitch = -0.05
    this.applyLook()
  }

  setFloor(level: number) {
    if (!this.spec) return
    const floor = this.spec.floors.find(f => f.level === level)
    if (!floor) return
    this.level = level
    this.cutLevel = this.mode === "dollhouse" ? level : this.cutLevel
    if (this.mode === "walk") {
      const { x, z } = this.camera.position
      if (!this.walkable(x, z, level) || (level > 0 && !this.onSlab(x, z, level))) {
        const room = floor.rooms[0]
        const s = floor.slabs[0]
        const nx = room?.x ?? s.x + s.w / 2
        const nz = room?.z ?? s.z + s.d / 2
        this.camera.position.set(nx, this.eyeY(nx, nz, level), nz)
      } else {
        this.camera.position.y = this.eyeY(x, z, level)
      }
    }
    this.applyVisibility()
    this.emitStatus(true)
  }

  goTo(level: number, x: number, z: number) {
    if (!this.spec) return
    if (this.mode !== "walk") this.setMode("walk")
    let target: [number, number] | null = this.walkable(x, z, level) ? [x, z] : null
    for (let r = 0.1; !target && r <= 2.5; r += 0.1) {
      for (let a = 0; a < Math.PI * 2 && !target; a += Math.PI / 8) {
        const tx = x + Math.cos(a) * r
        const tz = z + Math.sin(a) * r
        if (this.walkable(tx, tz, level)) target = [tx, tz]
      }
    }
    if (!target) return
    this.level = level
    this.camera.position.set(target[0], this.eyeY(target[0], target[1], level), target[1])
    this.applyVisibility()
    this.emitStatus(true)
  }

  setMoveInput(input: MoveInput) {
    this.touchInput = input
  }

  private walkable(x: number, z: number, level: number, climbing = false) {
    if (!this.spec) return true
    const floor = this.spec.floors.find(f => f.level === level)
    if (!floor) return false
    for (const w of floor.walls) {
      if (w.kind === "door") continue
      const cx = Math.max(w.x, Math.min(x, w.x + w.w))
      const cz = Math.max(w.z, Math.min(z, w.z + w.d))
      if ((x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS) return false
    }
    // 家具・車にもぶつかる（ラグなど平らなものは除く）
    const r = RADIUS * 0.6
    const boxes = [...obstacleBoxes(this.furniture, level, false), ...(level === 0 ? obstacleBoxes(this.furniture, 0, true) : [])]
    if (boxes.some(b => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r)) return false
    if (guardBlocks(this.stairLayouts, x, z, level, RADIUS, climbing)) return false
    if (level > 0) return floor.slabs.some(s => x >= s.x && x <= s.x + s.w && z >= s.z && z <= s.z + s.d)
    const { width: W, depth: D } = this.spec.footprint
    return x > -25 && x < W + 25 && z > -25 && z < D + 25
  }

  private applyLook() {
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
    this.camera.lookAt(this.camera.position.clone().add(dir))
  }

  private updateWalk(dt: number) {
    const k = this.keys
    const run = k.has("shift") ? 2 : 1
    let fwd = this.touchInput.forward
    let str = this.touchInput.strafe
    let turn = this.touchInput.turn
    if (k.has("w") || k.has("arrowup")) fwd += 1
    if (k.has("s") || k.has("arrowdown")) fwd -= 1
    if (k.has("a")) str -= 1
    if (k.has("d")) str += 1
    if (k.has("arrowleft") || k.has("q")) turn += 1
    if (k.has("arrowright") || k.has("e")) turn -= 1
    this.yaw += turn * dt * 1.6
    const speed = 1.5 * run * dt
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw)
    const rz = -Math.sin(this.yaw)
    const dx = (fx * fwd + rx * str) * speed
    const dz = (fz * fwd + rz * str) * speed
    const p = this.camera.position
    if (dx) this.tryStep(p.x + dx, p.z)
    if (dz) this.tryStep(p.x, p.z + dz)
    // 玄関ポーチ・階段の段差を上り下りするように視点の高さをなめらかに追従させる
    const ty = this.eyeY(p.x, p.z, this.level)
    p.y += (ty - p.y) * Math.min(1, dt * 8)
    this.applyLook()
  }

  // ───────────────────────── 入力 ─────────────────────────

  private handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    if (key === "escape" && (this.placeType || this.selectedFurniture)) {
      this.onFurnitureAction?.("cancel")
      return
    }
    if (this.selectedFurniture && (key === "r" || key === "delete" || key === "backspace")) {
      this.onFurnitureAction?.(key === "r" ? "rotate" : "delete")
      e.preventDefault()
      return
    }
    if (this.mode !== "walk") return
    if (["w", "a", "s", "d", "q", "e", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      this.keys.add(key)
      e.preventDefault()
    }
  }

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase())
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: false }
    this.renderer.domElement.focus()
    if (this.pickMode || this.placeType || e.button !== 0) return
    // 家具・車をつかんだら、その高さの水平面に沿ってドラッグで動かす
    this.setNdc(e)
    const hit = this.raycastFurniture()
    if (!hit) return
    const worldY = hit.group.getWorldPosition(new THREE.Vector3()).y
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -worldY)
    const onPlane = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    const groupWorld = hit.group.getWorldPosition(new THREE.Vector3())
    this.furnDrag = { id: hit.id, group: hit.group, plane, offset: onPlane ? groupWorld.sub(onPlane) : new THREE.Vector3(), moved: false }
    this.controls.enabled = false
    if (this.selectedFurniture !== hit.id) {
      this.selectedFurniture = hit.id
      this.updateSelectionBox()
      this.onFurnitureSelect?.(hit.id)
    }
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.drag) return
    const dx = e.clientX - this.drag.x
    const dy = e.clientY - this.drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true
    if (this.furnDrag) {
      if (!this.drag.moved) return
      this.furnDrag.moved = true
      this.setNdc(e)
      const p = this.raycaster.ray.intersectPlane(this.furnDrag.plane, new THREE.Vector3())
      if (p) {
        p.add(this.furnDrag.offset)
        this.furnDrag.group.position.x = p.x
        this.furnDrag.group.position.z = p.z
        this.updateSelectionBox()
      }
      return
    }
    if (this.mode === "walk" && this.drag.moved) {
      this.yaw += dx * 0.004
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * 0.004))
      this.drag.x = e.clientX
      this.drag.y = e.clientY
      this.applyLook()
    }
  }

  private handlePointerUp = (e: PointerEvent) => {
    const drag = this.drag
    this.drag = null
    const fd = this.furnDrag
    if (fd) {
      this.furnDrag = null
      this.controls.enabled = this.mode !== "walk"
      if (fd.moved) this.onFurnitureMove?.(fd.id, Math.round(fd.group.position.x * 100) / 100, Math.round(fd.group.position.z * 100) / 100)
      return
    }
    if (!drag || drag.moved || e.target !== this.renderer.domElement) return
    this.setNdc(e)
    if (this.placeType) {
      const at = this.raycastPlacement(isOutdoor(this.placeType))
      if (at) this.onFurniturePlace?.(this.placeType, at.x, at.z, at.level)
      return
    }
    const pinHit = this.raycaster.intersectObjects(this.pinGroup.children, false)[0]
    if (pinHit) {
      this.onPinClick?.(pinHit.object.userData.pinId)
      return
    }
    if (!this.pickMode) {
      if (this.selectedFurniture) {
        this.selectedFurniture = null
        this.updateSelectionBox()
        this.onFurnitureSelect?.(null)
      }
      return
    }
    const targets: THREE.Object3D[] = []
    const root = this.imported ?? this.building
    root.traverseVisible(o => {
      if ((o as THREE.Mesh).isMesh && !o.userData.glass) targets.push(o)
    })
    this.landscape.traverseVisible(o => {
      if ((o as THREE.Mesh).isMesh) targets.push(o)
    })
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (hit) this.onPick?.([hit.point.x, hit.point.y, hit.point.z].map(v => Math.round(v * 100) / 100) as [number, number, number])
  }

  // ───────────────────────── ピン（コメント） ─────────────────────────

  setPins(pins: Pin[]) {
    this.clearGroup(this.pinGroup)
    for (const pin of pins) {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 64
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = pin.color
      ctx.beginPath()
      ctx.arc(32, 32, 26, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 5
      ctx.strokeStyle = "#fff"
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = "bold 28px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(pin.label, 32, 34)
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }))
      sprite.scale.set(0.45, 0.45, 0.45)
      sprite.position.set(pin.position[0], pin.position[1] + 0.25, pin.position[2])
      sprite.renderOrder = 10
      sprite.userData.pinId = pin.id
      this.pinGroup.add(sprite)
    }
  }

  // ───────────────────────── カメラ姿勢・キャプチャ ─────────────────────────

  getPose(): CameraPose {
    const p = this.camera.position
    const t = this.controls.target
    return { mode: this.mode, position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], yaw: this.yaw, pitch: this.pitch, level: this.level }
  }

  setPose(pose: CameraPose) {
    if (pose.mode !== this.mode) this.setMode(pose.mode)
    this.camera.position.set(...pose.position)
    if (pose.mode === "walk") {
      this.yaw = pose.yaw
      this.pitch = pose.pitch
      this.level = pose.level
      this.applyLook()
    } else {
      this.controls.target.set(...pose.target)
      this.controls.update()
    }
    this.applyVisibility()
    this.emitStatus(true)
  }

  private render() {
    if (this.pendingMaterials) this.applyMaterials(this.pendingMaterials)
    if (this.quality) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  capture(maxWidth?: number): string {
    const box = this.selectionBox
    if (box) box.visible = false
    this.render()
    if (box) box.visible = true
    const src = this.renderer.domElement
    if (!maxWidth || src.width <= maxWidth) return src.toDataURL("image/jpeg", 0.88)
    const canvas = document.createElement("canvas")
    canvas.width = maxWidth
    canvas.height = Math.round(src.height * (maxWidth / src.width))
    canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.78)
  }

  // ───────────────────────── Blender GLB 取り込み ─────────────────────────

  async loadGlb(buffer: ArrayBuffer) {
    // 埋め込み画像（ライトマップ・家具のテクスチャ）は blob: URL を使わずにデコードする（既定 CSP）
    const gltf = await createCspSafeGltfLoader().parseAsync(buffer, "")
    this.clearImported()
    const root = gltf.scene
    const known = this.mats as Record<string, THREE.Material>
    let baked = 0
    root.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Blender の書き出しは材質名 = 材質キー（ライトマップ付きは複製なので "floor.001"）。同じ PBR 材質（テクスチャ・凹凸）に差し替える
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined
      const name = src?.name?.replace(/\.\d{3}$/, "")
      if (src && name && known[name]) {
        const lightMap = src.aoMap && mesh.geometry.getAttribute("uv1") ? src.aoMap : null
        if (lightMap) {
          // 室内の間接光（blender/lightmap.py）。occlusionTexture（UV 2）で運んだ明るさを lightMap に移す
          const scale = Number(findExtra(mesh, "lightmapScale") ?? 1)
          const m = (known[name] as THREE.MeshStandardMaterial).clone()
          lightMap.channel = 1
          lightMap.colorSpace = THREE.NoColorSpace
          m.lightMap = lightMap
          m.lightMapIntensity = scale * LIGHTMAP_GAIN
          // 色・凹凸のテクスチャは共有材質のもの。後始末ではライトマップだけを捨てる
          m.userData.lightmapClone = true
          mesh.material = m
          baked++
        } else {
          ;(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose())
          mesh.material = known[name]
        }
      }
      if (name === "glass") {
        mesh.castShadow = false
        mesh.userData.glass = true
        this.glassMeshes.push(mesh)
      }
    })
    this.imported = root
    this.bakedLighting = baked > 0
    this.scene.add(root)
    this.applyLighting()
    this.applyVisibility()
    if (!this.spec) {
      const box = new THREE.Box3().setFromObject(root)
      const c = box.getCenter(new THREE.Vector3())
      const s = box.getSize(new THREE.Vector3()).length()
      this.controls.target.copy(c)
      this.camera.position.set(c.x + s * 0.8, c.y + s * 0.5, c.z + s * 0.9)
      this.controls.update()
    }
  }

  clearImported() {
    this.bakedLighting = false
    if (this.imported) {
      this.glassMeshes = this.glassMeshes.filter(m => !this.imported?.getObjectById(m.id))
      this.scene.remove(this.imported)
      this.disposeObject(this.imported)
      this.imported = null
    }
    this.applyVisibility()
  }

  hasImported() {
    return this.imported !== null
  }

  // ───────────────────────── ループ・後始末 ─────────────────────────

  private emitStatus(force = false) {
    const now = performance.now()
    if (!force && now - this.lastStatus < 120) return
    this.lastStatus = now
    const p = this.camera.position
    const yaw = this.mode === "walk" ? this.yaw : Math.atan2(-(this.controls.target.x - p.x), -(this.controls.target.z - p.z))
    this.onStatus?.({ mode: this.mode, x: p.x, z: p.z, yaw, level: this.level })
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    this.timer.update()
    const dt = Math.min(0.05, this.timer.getDelta())
    if (this.mode === "walk") this.updateWalk(dt)
    else this.controls.update()
    this.emitStatus()
    this.render()
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    const ratio = Math.min(window.devicePixelRatio, this.quality ? 1.5 : 2)
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(w, h)
    this.composer.setPixelRatio(ratio)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private isShared(mat: THREE.Material) {
    return (Object.values(this.mats) as THREE.Material[]).includes(mat)
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse(o => {
      // 家具のジオメトリ・材質は FurnitureFactory のキャッシュを共有している
      if (o.userData.furnitureId) return
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined
      const list = Array.isArray(m) ? m : m ? [m] : []
      for (const mat of list) {
        if (this.isShared(mat)) continue
        if (mat.userData.lightmapClone) (mat as THREE.MeshStandardMaterial).lightMap?.dispose()
        else (mat as THREE.MeshStandardMaterial).map?.dispose()
        mat.dispose()
      }
    })
  }

  private clearGroup(g: THREE.Group) {
    for (const child of [...g.children]) {
      g.remove(child)
      this.disposeObject(child)
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.envTimer)
    this.resizeObserver.disconnect()
    window.removeEventListener("pointermove", this.handlePointerMove)
    window.removeEventListener("pointerup", this.handlePointerUp)
    this.controls.dispose()
    for (const g of [this.building, this.landscape, this.pinGroup]) this.clearGroup(g)
    this.clearImported()
    this.selectionBox?.dispose()
    this.furnitureFactory.dispose()
    for (const m of Object.values(this.mats)) m.dispose()
    releasePbrSlots()
    disposeLibrary()
    for (const s of [this.sky, this.envSky]) {
      s.geometry.dispose()
      s.material.dispose()
    }
    this.envRT?.dispose()
    this.pmrem.dispose()
    this.gtao.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

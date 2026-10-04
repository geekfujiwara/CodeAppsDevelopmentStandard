import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber"
import { Edges, OrbitControls } from "@react-three/drei"
import { DoubleSide, FrontSide, MeshStandardMaterial, Vector3 } from "three"
import { RotateCcw } from "lucide-react"
import type { Project, Task } from "@/services/construction-service"
import {
  buildConstructionScene,
  MODEL_TYPE_LABEL,
  type ContextMesh,
  type ModelPart,
  type ModelProp,
  type PartShape,
  type Vec3,
} from "@/lib/construction-models"
import { expectedProgress, taskState, TASK_STATE_COLOR, TASK_STATE_LABEL, type TaskState } from "@/lib/construction-schedule"

type Visual = { state: TaskState; ratio: number }

const AXIS = { x: 0, y: 1, z: 2 } as const
const EMISSIVE: Partial<Record<TaskState, string>> = { active: "#06b6d4", delayed: "#f59e0b" }

function partVisual(part: ModelPart, task: Task | undefined, completed: boolean): Visual {
  if (!task) return completed ? { state: "done", ratio: 1 } : { state: "planned", ratio: 0 }
  const progress = Math.min(1, Math.max(0, task.progress / 100))
  const working: TaskState = taskState(task) === "delayed" ? "delayed" : "active"
  if (part.segment) {
    const [index, count] = part.segment
    const built = progress * count
    if (built >= index + 1 - 1e-6) return { state: "done", ratio: 1 }
    if (built > index) return { state: working, ratio: Math.max(0.15, built - index) }
    return { state: "planned", ratio: 0 }
  }
  if (progress >= 1) return { state: "done", ratio: 1 }
  if (progress > 0) return { state: working, ratio: Math.max(0.15, progress) }
  return { state: "planned", ratio: 0 }
}

function Shape({ shape, size, material, edges }: { shape: PartShape; size: Vec3; material: MeshStandardMaterial; edges: boolean }) {
  const [w, h, d] = size
  if (shape === "cylinder") {
    return <mesh material={material} castShadow receiveShadow><cylinderGeometry args={[w, d, h, 20]} /></mesh>
  }
  if (shape === "halfTube") {
    return <mesh material={material} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow><cylinderGeometry args={[w, h, d, 28, 1, true, Math.PI / 2, Math.PI]} /></mesh>
  }
  if (shape === "uchannel") {
    const t = Math.min(0.2, h / 4)
    return (
      <group>
        <mesh material={material} position={[0, -h / 2 + t / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, t, d]} /></mesh>
        <mesh material={material} position={[0, 0, -d / 2 + t / 2]} castShadow><boxGeometry args={[w, h, t]} /></mesh>
        <mesh material={material} position={[0, 0, d / 2 - t / 2]} castShadow><boxGeometry args={[w, h, t]} /></mesh>
      </group>
    )
  }
  if (shape === "frame") {
    const columnsX = Math.max(2, Math.round(w / 2.4) + 1)
    const columnsZ = Math.max(2, Math.round(d / 2.4) + 1)
    const xs = Array.from({ length: columnsX }, (_, i) => -w / 2 + (w * i) / (columnsX - 1))
    const zs = Array.from({ length: columnsZ }, (_, i) => -d / 2 + (d * i) / (columnsZ - 1))
    return (
      <group>
        {xs.flatMap((x) => zs.map((z) => (
          <mesh key={`c-${x}-${z}`} material={material} position={[x, 0, z]} castShadow><boxGeometry args={[0.2, h, 0.2]} /></mesh>
        )))}
        {zs.map((z) => <mesh key={`bx-${z}`} material={material} position={[0, h / 2 - 0.1, z]} castShadow><boxGeometry args={[w, 0.2, 0.16]} /></mesh>)}
        {xs.map((x) => <mesh key={`bz-${x}`} material={material} position={[x, h / 2 - 0.1, 0]} castShadow><boxGeometry args={[0.16, 0.2, d]} /></mesh>)}
      </group>
    )
  }
  return (
    <mesh material={material} castShadow receiveShadow>
      <boxGeometry args={size} />
      {edges && <Edges color="#cbd5e1" />}
    </mesh>
  )
}

type PartMeshProps = {
  part: ModelPart
  visual: Visual
  selected: boolean
  onHover: (zone: string | null) => void
  onSelect: (zone: string) => void
}

function PartMesh({ part, visual, selected, onHover, onSelect }: PartMeshProps) {
  const ghost = visual.state === "planned" && !part.invert
  const working = visual.state === "active" || visual.state === "delayed"
  const material = useMemo(() => {
    const translucent = ghost || part.opacity !== undefined
    const color = ghost ? "#94a3b8" : part.invert && visual.state === "done" ? part.doneColor ?? part.color : part.color
    const result = new MeshStandardMaterial({
      color,
      roughness: part.shape === "frame" ? 0.45 : 0.78,
      metalness: part.shape === "frame" ? 0.45 : 0.05,
      transparent: translucent,
      opacity: ghost ? (selected ? 0.38 : 0.13) : part.opacity ?? 1,
      depthWrite: !translucent,
      side: part.shape === "halfTube" ? DoubleSide : FrontSide,
    })
    if (selected) {
      result.emissive.set("#facc15")
      result.emissiveIntensity = 0.55
    } else if (working) {
      result.emissive.set(EMISSIVE[visual.state] ?? "#06b6d4")
      result.emissiveIntensity = 0.45
    }
    return result
  }, [ghost, part, selected, visual.state, working])

  useEffect(() => () => material.dispose(), [material])
  useFrame(({ clock }) => {
    if (working && !selected) material.emissiveIntensity = 0.3 + 0.35 * (1 + Math.sin(clock.elapsedTime * 3)) / 2
  })

  const axis = AXIS[part.grow ?? "y"]
  const ratio = part.invert
    ? visual.state === "done" ? 0.08 : visual.state === "planned" ? 1 : Math.max(0.08, 1 - visual.ratio)
    : working ? visual.ratio : 1
  const scale: Vec3 = [1, 1, 1]
  const offset: Vec3 = [0, 0, 0]
  scale[axis] = ratio
  offset[axis] = -part.size[axis] / 2 + (part.size[axis] * ratio) / 2

  const handlers = {
    onPointerOver: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onHover(part.zone) },
    onPointerOut: () => onHover(null),
    onClick: (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(part.zone) },
  }

  return (
    <group position={part.position} rotation={part.rotation} {...handlers}>
      <group position={offset} scale={scale}>
        <Shape shape={part.shape} size={part.size} material={material} edges={ghost && part.shape === "box"} />
      </group>
      {working && !part.invert && part.shape === "box" && (
        <mesh>
          <boxGeometry args={part.size} />
          <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.25} />
        </mesh>
      )}
    </group>
  )
}

function ContextObject({ item }: { item: ContextMesh }) {
  const transparent = item.opacity !== undefined && item.opacity < 1
  return (
    <mesh position={item.position} rotation={item.rotation} scale={item.shape === "sphere" ? item.size : [1, 1, 1]} receiveShadow>
      {item.shape === "sphere"
        ? <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        : item.shape === "cylinder"
          ? <cylinderGeometry args={[item.size[0], item.size[2], item.size[1], 24]} />
          : <boxGeometry args={item.size} />}
      <meshStandardMaterial color={item.color} transparent={transparent} opacity={item.opacity ?? 1} depthWrite={!transparent} roughness={0.9} />
    </mesh>
  )
}

function Box({ size, position, color, rotation }: { size: Vec3; position: Vec3; color: string; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  )
}

function Equipment({ item }: { item: ModelProp }) {
  const s = item.scale ?? 1
  let body: React.ReactNode = null
  if (item.kind === "crawlerCrane") {
    body = <>
      <Box size={[4, 0.8, 3]} position={[0, 0.4, 0]} color="#1f2937" />
      <Box size={[3, 1.6, 2.4]} position={[0, 1.6, 0]} color="#dc2626" />
      <Box size={[1, 1.1, 1]} position={[1.2, 2.6, 0.7]} color="#bfdbfe" />
      <Box size={[0.35, 15, 0.35]} position={[3.6, 7.6, 0]} rotation={[0, 0, -0.55]} color="#ef4444" />
      <Box size={[0.05, 6, 0.05]} position={[7.6, 11.6, 0]} color="#111827" />
    </>
  } else if (item.kind === "towerCrane") {
    body = <>
      <Box size={[1.2, 24, 1.2]} position={[0, 12, 0]} color="#facc15" />
      <Box size={[22, 0.6, 0.6]} position={[-6, 24.3, 0]} color="#facc15" />
      <Box size={[2, 1.2, 1.4]} position={[4, 23.6, 0]} color="#475569" />
      <Box size={[1.4, 1.4, 1.4]} position={[0.4, 25.2, 0]} color="#e2e8f0" />
      <Box size={[0.05, 8, 0.05]} position={[-12, 20.2, 0]} color="#111827" />
    </>
  } else if (item.kind === "excavator") {
    body = <>
      <Box size={[3.2, 0.7, 2.4]} position={[0, 0.35, 0]} color="#1f2937" />
      <Box size={[2.6, 1.2, 2]} position={[0, 1.3, 0]} color="#f59e0b" />
      <Box size={[0.9, 1, 0.9]} position={[0.6, 2.3, 0.5]} color="#bfdbfe" />
      <Box size={[0.4, 3.4, 0.4]} position={[2.2, 2.6, 0]} rotation={[0, 0, -0.9]} color="#eab308" />
      <Box size={[0.35, 2.4, 0.35]} position={[3.8, 2.4, 0]} rotation={[0, 0, 0.6]} color="#eab308" />
    </>
  } else if (item.kind === "dumpTruck") {
    body = <>
      <Box size={[1.4, 1.4, 2]} position={[1.9, 1.1, 0]} color="#2563eb" />
      <Box size={[3, 1.2, 2.2]} position={[-0.6, 1.2, 0]} color="#d4d4d8" />
      <Box size={[4.4, 0.5, 2]} position={[0.2, 0.35, 0]} color="#111827" />
    </>
  } else if (item.kind === "paver") {
    body = <>
      <Box size={[3, 1.2, 3.4]} position={[0, 0.6, 0]} color="#facc15" />
      <Box size={[1.2, 1, 1.2]} position={[-0.6, 1.7, 0]} color="#eab308" />
      <Box size={[0.6, 0.4, 4]} position={[-1.8, 0.2, 0]} color="#374151" />
    </>
  } else {
    body = <>
      <Box size={[5, 2.6, 2.4]} position={[0, 1.3, 0]} color="#e2e8f0" />
      <Box size={[5.02, 0.3, 2.42]} position={[0, 2.2, 0]} color="#1d4ed8" />
    </>
  }
  return <group position={item.position} rotation={[0, item.rotation ?? 0, 0]} scale={s}>{body}</group>
}

function topOf(part: ModelPart): Vec3 {
  return [part.position[0], part.position[1] + part.size[1] / 2 + 1.2, part.position[2]]
}

type Pin = { zone: string; position: Vec3; task: Task; state: TaskState }

/** 3D 座標のピンを Canvas の外にある DOM ボタンへ毎フレーム投影する（drei Html を使わず React root を増やさない） */
function PinProjector({ pins, elements }: { pins: Pin[]; elements: MutableRefObject<Array<HTMLButtonElement | null>> }) {
  const vector = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    pins.forEach((pin, index) => {
      const element = elements.current[index]
      if (!element) return
      vector.set(...pin.position).project(camera)
      const x = ((vector.x + 1) / 2) * size.width
      const y = ((1 - vector.y) / 2) * size.height
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
      element.style.visibility = vector.z < 1 ? "visible" : "hidden"
    })
  })
  return null
}

type Props = {
  project: Project
  tasks: Task[]
  selectedTaskId?: string
  onSelectTask?: (taskId: string) => void
}

export function ProjectModel3d({ project, tasks, selectedTaskId, onSelectTask }: Props) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [viewKey, setViewKey] = useState(0)
  const useIdAsZone = !tasks.some((task) => task.zone)
  const zoneOf = (task: Task) => (useIdAsZone ? task.id : task.zone)
  const taskByZone = useMemo(() => {
    const map = new Map<string, Task>()
    for (const task of tasks) {
      const zone = useIdAsZone ? task.id : task.zone
      if (zone && !map.has(zone)) map.set(zone, task)
    }
    return map
  }, [tasks, useIdAsZone])
  const scene = useMemo(
    () => buildConstructionScene(project.modelType, project.modelCenter, tasks.map((task) => ({ zone: zoneOf(task), label: task.name }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.modelType, project.modelCenter, tasks, useIdAsZone],
  )
  const completed = project.status === 100000002
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const selectedZone = selectedTask ? zoneOf(selectedTask) : undefined
  const visuals = useMemo(
    () => new Map(scene.parts.map((part) => [part.id, partVisual(part, taskByZone.get(part.zone), completed)])),
    [completed, scene.parts, taskByZone],
  )
  const pins = useMemo(() => {
    const result: Pin[] = []
    for (const [zone, task] of taskByZone) {
      const state = taskState(task)
      if (task.progress <= 0 || task.progress >= 100) continue
      const working = scene.parts.filter((part) => part.zone === zone && ["active", "delayed"].includes(visuals.get(part.id)?.state ?? ""))
      const anchor = working[working.length - 1] ?? scene.parts.find((part) => part.zone === zone)
      if (anchor) result.push({ zone, position: topOf(anchor), task, state })
    }
    // 近い位置のピンが重ならないよう、高さを少しずつずらす
    return result.slice(0, 5).map((pin, index) => ({ ...pin, position: [pin.position[0], pin.position[1] + index * 1.3, pin.position[2]] as Vec3 }))
  }, [scene.parts, taskByZone, visuals])
  const pinElements = useRef<Array<HTMLButtonElement | null>>([])
  const focusTask = (hoveredZone ? taskByZone.get(hoveredZone) : undefined) ?? selectedTask
  const focusState = focusTask ? taskState(focusTask) : undefined
  const missingZones = !useIdAsZone && scene.parts.length > 0 && !scene.parts.some((part) => taskByZone.has(part.zone))
  const select = (zone: string) => {
    const task = taskByZone.get(zone)
    if (task) onSelectTask?.(task.id)
  }

  return (
    <div className="relative h-[34rem] min-h-80 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950" data-tour="project-3d">
      <Canvas key={viewKey} shadows="percentage" camera={{ position: scene.camera, fov: 42 }} aria-label="工事進捗 3D モデル" onPointerMissed={() => setHoveredZone(null)}>
        <color attach="background" args={["#0b1220"]} />
        <fog attach="fog" args={["#0b1220", 70, 160]} />
        <hemisphereLight args={["#e0f2fe", "#334155", 0.9]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[18, 30, 14]} intensity={2.1} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.05} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-far={120} />
        {!scene.ground.hidden && (
          <mesh position={[0, -0.06, 0]} receiveShadow>
            <boxGeometry args={[scene.ground.size[0], 0.1, scene.ground.size[1]]} />
            <meshStandardMaterial color={scene.ground.color} roughness={1} />
          </mesh>
        )}
        {scene.context.map((item) => <ContextObject key={item.id} item={item} />)}
        {scene.props.map((item) => <Equipment key={item.id} item={item} />)}
        {scene.parts.map((part) => (
          <PartMesh
            key={part.id}
            part={part}
            visual={visuals.get(part.id) ?? { state: "planned", ratio: 0 }}
            selected={selectedZone === part.zone}
            onHover={setHoveredZone}
            onSelect={select}
          />
        ))}
        <PinProjector pins={pins} elements={pinElements} />
        <OrbitControls makeDefault target={scene.target} minDistance={6} maxDistance={140} maxPolarAngle={Math.PI / 2.05} enableDamping />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pins.map((pin, index) => (
          <button
            key={pin.zone}
            ref={(element) => { pinElements.current[index] = element }}
            type="button"
            onClick={() => onSelectTask?.(pin.task.id)}
            style={{ visibility: "hidden" }}
            className={`pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-black shadow-lg ring-2 ring-white/70 ${
              selectedZone === pin.zone ? "bg-yellow-300 text-slate-950" : pin.state === "delayed" ? "bg-amber-400 text-slate-950" : "bg-cyan-400 text-slate-950"
            }`}
          >
            ▼ {pin.task.name} {pin.task.progress}%
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white backdrop-blur">{MODEL_TYPE_LABEL[project.modelType] ?? "工程"}モデル · {scene.title}</span>
        {completed && <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">竣工済</span>}
      </div>
      <button
        type="button"
        onClick={() => setViewKey((value) => value + 1)}
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-white/20"
      >
        <RotateCcw className="h-3.5 w-3.5" />視点をリセット
      </button>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-xl bg-slate-950/70 px-3 py-2 text-xs font-bold text-slate-100 backdrop-blur">
        {(["done", "active", "delayed", "planned"] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TASK_STATE_COLOR[state] }} />{TASK_STATE_LABEL[state]}
          </span>
        ))}
      </div>
      {focusTask && focusState && (
        <div className="pointer-events-none absolute bottom-3 right-3 w-[min(19rem,calc(100%-1.5rem))] rounded-xl border border-white/10 bg-slate-950/85 p-3 text-xs text-slate-100 shadow-xl backdrop-blur">
          <p className="font-black text-white">{focusTask.name}</p>
          <p className="mt-1 text-slate-300">{focusTask.plannedStart.slice(0, 10)} 〜 {focusTask.plannedEnd.slice(0, 10)}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 font-black text-slate-950" style={{ background: TASK_STATE_COLOR[focusState] }}>{TASK_STATE_LABEL[focusState]}</span>
            <span>実績 {focusTask.progress}% / 予定 {expectedProgress(focusTask)}%</span>
          </div>
          {focusTask.issue && <p className="mt-2 text-amber-300">阻害要因: {focusTask.issue}</p>}
        </div>
      )}
      {missingZones && (
        <p className="absolute inset-x-3 top-12 rounded-lg bg-amber-100 p-2 text-xs font-bold text-amber-900">作業に 3D 部位（${PUBLISHER_PREFIX}_zone）が未設定のため、計画形状のみ表示しています。</p>
      )}
    </div>
  )
}

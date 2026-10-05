import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import {
  Box3,
  EdgesGeometry,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  Vector3,
  type Material,
  type Object3D,
} from "three"
import { Eye, EyeOff, Layers, Loader2, RotateCcw } from "lucide-react"
import type { Project, Task } from "@/services/construction-service"
import {
  buildConstructionModel,
  disposeModel,
  MODEL_TYPE_LABEL,
  SEE_THROUGH_DEFAULT,
  type ConstructionModel,
  type GrowAxis,
  type Vec3,
  type ZoneInfo,
} from "@/lib/models"
import { loadModelAsset } from "@/lib/models/gltf-loader"
import { expectedProgress, taskState, TASK_STATE_COLOR, TASK_STATE_LABEL, type TaskState } from "@/lib/construction-schedule"

type Visual = { state: TaskState; ratio: number }
type LoadedModel = ConstructionModel & { source: "gltf" | "procedural"; notice?: string; key: string }

type Entry = {
  mesh: Mesh
  info: ZoneInfo
  base: Material
  bounds: Box3
  outline: LineSegments
  plane: Plane
  active?: MeshStandardMaterial
  highlight?: MeshStandardMaterial
}

type OutlineKind = "planned" | "active" | "delayed" | "selected"

type Prepared = {
  entries: Entry[]
  terrains: Array<{ mesh: Mesh; base: Material; clear: Material }>
  size: number
  center: Vector3
  materials: Material[]
  outlines: Record<OutlineKind, LineDashedMaterial>
}

type Pin = { zone: string; position: Vec3; task: Task; state: TaskState }

const EMISSIVE: Partial<Record<TaskState, string>> = { active: "#06b6d4", delayed: "#f59e0b" }
const OUTLINE_COLORS = { planned: "#cbd5e1", active: "#22d3ee", delayed: "#fbbf24", selected: "#fde047" }

function partVisual(info: ZoneInfo, task: Task | undefined, completed: boolean): Visual {
  if (!task) return completed ? { state: "done", ratio: 1 } : { state: "planned", ratio: 0 }
  const progress = Math.min(1, Math.max(0, task.progress / 100))
  const working: TaskState = taskState(task) === "delayed" ? "delayed" : "active"
  if (info.segment) {
    const [index, count] = info.segment
    const built = progress * count
    if (built >= index + 1 - 1e-6) return { state: "done", ratio: 1 }
    if (built > index) return { state: working, ratio: Math.max(0.12, built - index) }
    return { state: "planned", ratio: 0 }
  }
  if (progress >= 1) return { state: "done", ratio: 1 }
  if (progress > 0) return { state: working, ratio: Math.max(0.12, progress) }
  return { state: "planned", ratio: 0 }
}

/** 施工方向（grow）に沿って、進捗 ratio までの範囲だけを残すクリッピング平面 */
function updatePlane(plane: Plane, bounds: Box3, grow: GrowAxis, ratio: number, invert: boolean): number {
  const axis = grow.replace("-", "") as "x" | "y" | "z"
  const negative = grow.startsWith("-")
  const min = bounds.min[axis]
  const max = bounds.max[axis]
  const span = max - min
  const normal = new Vector3()
  // invert（切土・床掘）は上から削られるため、残る範囲は「下側の 1 - ratio」
  const keepFromMin = invert ? true : !negative
  const amount = invert ? 1 - ratio : ratio
  const edge = keepFromMin ? min + span * amount : max - span * amount
  normal[axis] = keepFromMin ? -1 : 1
  plane.normal.copy(normal)
  plane.constant = keepFromMin ? edge : -edge
  return edge
}

function prepare(model: LoadedModel): Prepared {
  model.root.updateMatrixWorld(true)
  const all = new Box3()
  const entries: Entry[] = []
  const terrains: Prepared["terrains"] = []
  const materials: Material[] = []
  model.root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const data = object.userData as Partial<ZoneInfo> & { terrain?: boolean }
    if (data.terrain) {
      const base = object.material as Material
      const clear = base.clone()
      clear.transparent = true
      clear.opacity = 0.35
      clear.depthWrite = false
      materials.push(clear)
      terrains.push({ mesh: object, base, clear })
      return
    }
    if (!data.zone) return
    const bounds = new Box3().setFromObject(object)
    all.union(bounds)
    entries.push({ mesh: object, info: data as ZoneInfo, base: object.material as Material, bounds, outline: new LineSegments(), plane: new Plane() })
  })
  const size = Math.max(10, all.getSize(new Vector3()).length())
  const dashed = (color: string, opacity: number) => new LineDashedMaterial({ color, dashSize: size / 160, gapSize: size / 260, transparent: true, opacity, depthWrite: false })
  const outlines: Record<OutlineKind, LineDashedMaterial> = {
    planned: dashed(OUTLINE_COLORS.planned, 0.5),
    active: dashed(OUTLINE_COLORS.active, 0.9),
    delayed: dashed(OUTLINE_COLORS.delayed, 0.9),
    selected: dashed(OUTLINE_COLORS.selected, 1),
  }
  materials.push(...Object.values(outlines))
  for (const entry of entries) {
    const outline = new LineSegments(new EdgesGeometry(entry.mesh.geometry, 28), outlines.planned)
    outline.computeLineDistances()
    outline.userData = { outlineOf: entry.info.zone }
    outline.raycast = () => undefined
    entry.mesh.add(outline)
    entry.outline = outline
  }
  return { entries, terrains, size, center: all.getCenter(new Vector3()), materials, outlines }
}

const GHOST = new MeshBasicMaterial({ color: "#94a3b8", transparent: true, opacity: 0.05, depthWrite: false })

function useConstructionModel(project: Project, tasks: Task[]) {
  const [model, setModel] = useState<LoadedModel>()
  const [loading, setLoading] = useState(false)
  const fallbackKey = project.modelType ? "" : tasks.map((task) => task.id).join(",")
  useEffect(() => {
    let cancelled = false
    const procedural = (notice?: string): LoadedModel => ({
      ...buildConstructionModel(project.modelType, project.modelCenter, tasks.map((task) => ({ zone: task.zone || task.id, label: task.name }))),
      source: "procedural", notice, key: `${project.id}-procedural`,
    })
    if (!project.modelUrl) {
      setModel(procedural())
      return () => { cancelled = true }
    }
    setLoading(true)
    loadModelAsset(project.modelUrl)
      .then((loaded) => { if (!cancelled) setModel({ ...loaded, source: "gltf", key: `${project.id}-gltf` }) })
      .catch((error: unknown) => {
        if (cancelled) return
        const reason = error instanceof Error ? error.message : "不明なエラー"
        setModel(procedural(`モデルファイル（${project.modelUrl}）を読み込めないため標準モデルを表示しています。外部 URL の場合は Code Apps の CSP の connect-src に許可が必要です。（${reason}）`))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.modelType, project.modelCenter, project.modelUrl, fallbackKey])
  useEffect(() => () => { if (model) disposeModel(model.root) }, [model])
  return { model, loading }
}

function ModelScene({ model, onHover, onSelect, pulses }: {
  model: LoadedModel
  onHover: (zone: string | null) => void
  onSelect: (zone: string) => void
  pulses: MutableRefObject<MeshStandardMaterial[]>
}) {
  useFrame(({ clock }) => {
    const intensity = 0.25 + 0.4 * (1 + Math.sin(clock.elapsedTime * 3)) / 2
    for (const item of pulses.current) item.emissiveIntensity = intensity
  })
  const zoneAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    for (const hit of event.intersections) {
      let object: Object3D | null = hit.object
      let visible = true
      while (object) {
        if (!object.visible) visible = false
        const zone = (object.userData as { zone?: string }).zone
        if (zone && visible) return zone
        object = object.parent
      }
    }
    return null
  }
  return (
    <primitive
      object={model.root}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onHover(zoneAt(event)) }}
      onPointerOut={() => onHover(null)}
      onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); const zone = zoneAt(event); if (zone) onSelect(zone) }}
    />
  )
}

/** 3D 座標のピンを Canvas の外にある DOM ボタンへ毎フレーム投影する */
function PinProjector({ pins, elements }: { pins: Pin[]; elements: MutableRefObject<Array<HTMLButtonElement | null>> }) {
  const vector = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    pins.forEach((pin, index) => {
      const element = elements.current[index]
      if (!element) return
      vector.set(...pin.position).project(camera)
      element.style.transform = `translate(${((vector.x + 1) / 2) * size.width}px, ${((1 - vector.y) / 2) * size.height}px) translate(-50%, -100%)`
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
  const { model, loading } = useConstructionModel(project, tasks)
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [viewKey, setViewKey] = useState(0)
  const [showGhost, setShowGhost] = useState(true)
  const [seeThrough, setSeeThrough] = useState(Boolean(SEE_THROUGH_DEFAULT[project.modelType]))
  const pulses = useRef<MeshStandardMaterial[]>([])
  const pinElements = useRef<Array<HTMLButtonElement | null>>([])
  const zoneOf = (task: Task) => task.zone || task.id
  const taskByZone = useMemo(() => {
    const map = new Map<string, Task>()
    for (const task of tasks) if (!map.has(zoneOf(task))) map.set(zoneOf(task), task)
    return map
  }, [tasks])
  const prepared = useMemo(() => (model ? prepare(model) : undefined), [model])
  useEffect(() => () => {
    prepared?.materials.forEach((item) => item.dispose())
    prepared?.entries.forEach((entry) => entry.outline.geometry.dispose())
  }, [prepared])
  useEffect(() => { setSeeThrough(Boolean(SEE_THROUGH_DEFAULT[project.modelType])) }, [project.modelType])

  const completed = project.status === 100000002
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const selectedZone = selectedTask ? zoneOf(selectedTask) : undefined

  // 進捗・選択・表示切替に応じて、各部位の材質・クリッピング・点線を更新する
  const pins = useMemo(() => {
    if (!prepared) return []
    const active: MeshStandardMaterial[] = []
    const zoneTops = new Map<string, { box: Box3; top: number }>()
    for (const entry of prepared.entries) {
      const { mesh, info, outline } = entry
      const task = taskByZone.get(info.zone)
      const visual = partVisual(info, task, completed)
      const selected = info.zone === selectedZone
      mesh.visible = true
      mesh.castShadow = true
      outline.visible = false
      if (info.temporary && visual.state === "planned") {
        mesh.visible = false
        continue
      }
      if (visual.state === "done") {
        if (info.invert) { mesh.visible = false; continue }
        if (selected) {
          if (!entry.highlight) { entry.highlight = (entry.base as MeshStandardMaterial).clone(); prepared.materials.push(entry.highlight) }
          entry.highlight.emissive?.set("#facc15")
          entry.highlight.emissiveIntensity = 0.45
          mesh.material = entry.highlight
        } else mesh.material = entry.base
        continue
      }
      if (visual.state === "planned") {
        if (info.invert) { mesh.material = entry.base; continue }
        mesh.material = GHOST
        mesh.castShadow = false
        outline.visible = showGhost || selected
        outline.material = prepared.outlines[selected ? "selected" : "planned"]
        continue
      }
      // 施工中：完成形の点線の中を、施工方向に進捗分だけ実体化する
      if (!entry.active) { entry.active = (entry.base as MeshStandardMaterial).clone(); prepared.materials.push(entry.active) }
      const edge = updatePlane(entry.plane, entry.bounds, info.grow ?? "y", visual.ratio, Boolean(info.invert))
      entry.active.clippingPlanes = [entry.plane]
      entry.active.clipShadows = true
      entry.active.emissive?.set(selected ? "#facc15" : EMISSIVE[visual.state] ?? "#06b6d4")
      mesh.material = entry.active
      if (selected) entry.active.emissiveIntensity = 0.5
      else active.push(entry.active)
      outline.visible = showGhost && !info.invert
      outline.material = prepared.outlines[selected ? "selected" : visual.state === "delayed" ? "delayed" : "active"]
      const top = (info.grow ?? "y").includes("y") ? edge : entry.bounds.max.y
      const current = zoneTops.get(info.zone)
      if (!current) zoneTops.set(info.zone, { box: entry.bounds.clone(), top })
      else { current.box.union(entry.bounds); current.top = Math.max(current.top, top) }
    }
    for (const item of prepared.terrains) item.mesh.material = seeThrough ? item.clear : item.base
    pulses.current = active
    const result: Pin[] = []
    for (const [zone, { box, top }] of zoneTops) {
      const task = taskByZone.get(zone)
      if (!task) continue
      const center = box.getCenter(new Vector3())
      result.push({ zone, task, state: taskState(task), position: [center.x, top + prepared.size * 0.015, center.z] })
    }
    // 近い位置のピンが重ならないよう、高さを少しずつずらす
    return result.slice(0, 6).map((pin, index) => ({ ...pin, position: [pin.position[0], pin.position[1] + index * prepared.size * 0.012, pin.position[2]] as Vec3 }))
  }, [completed, prepared, seeThrough, selectedZone, showGhost, taskByZone])

  const focusTask = (hoveredZone ? taskByZone.get(hoveredZone) : undefined) ?? selectedTask
  const focusState = focusTask ? taskState(focusTask) : undefined
  const hoveredLabel = hoveredZone && !taskByZone.has(hoveredZone)
    ? prepared?.entries.find((entry) => entry.info.zone === hoveredZone)?.info.label.replace(/ \d+\/\d+$/, "")
    : undefined
  const missingZones = Boolean(prepared && tasks.length && !prepared.entries.some((entry) => taskByZone.has(entry.info.zone)))
  const select = (zone: string) => {
    const task = taskByZone.get(zone)
    if (task) onSelectTask?.(task.id)
  }
  const size = prepared?.size ?? 100

  return (
    <div className="relative h-[36rem] min-h-80 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950" data-tour="project-3d">
      {model && prepared && (
        <Canvas
          key={`${model.key}-${viewKey}`}
          shadows="percentage"
          camera={{ position: model.camera, fov: 40, near: 0.5, far: size * 12 }}
          onCreated={({ gl }) => { gl.localClippingEnabled = true }}
          aria-label="工事進捗 3D モデル"
          onPointerMissed={() => setHoveredZone(null)}
        >
          <color attach="background" args={["#0b1220"]} />
          <fog attach="fog" args={["#0b1220", size * 1.4, size * 4]} />
          <hemisphereLight args={["#e0f2fe", "#3f3a2e", 0.95]} />
          <ambientLight intensity={0.3} />
          <directionalLight
            position={[size * 0.5, size * 0.8, size * 0.35]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.04}
            shadow-camera-left={-size * 0.6}
            shadow-camera-right={size * 0.6}
            shadow-camera-top={size * 0.6}
            shadow-camera-bottom={-size * 0.6}
            shadow-camera-far={size * 3}
          />
          <ModelScene model={model} onHover={setHoveredZone} onSelect={select} pulses={pulses} />
          <PinProjector pins={pins} elements={pinElements} />
          <OrbitControls makeDefault target={model.target} minDistance={size * 0.05} maxDistance={size * 4} maxPolarAngle={Math.PI / 2.02} enableDamping />
        </Canvas>
      )}

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

      {(loading || !model) && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/70 text-sm font-bold text-slate-100">
          <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />3D モデルを読み込み中…</span>
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white backdrop-blur">{MODEL_TYPE_LABEL[project.modelType] ?? "工程"} · {model?.title ?? "読み込み中"}</span>
        {model && <span className={`rounded-full px-3 py-1 text-xs font-black ${model.source === "gltf" ? "bg-violet-400 text-slate-950" : "bg-white/10 text-slate-200"}`}>{model.source === "gltf" ? "モデルファイル（glTF）" : "標準モデル"}</span>}
        {completed && <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">竣工済</span>}
      </div>
      <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
        <button type="button" onClick={() => setShowGhost((value) => !value)} aria-pressed={showGhost} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur ${showGhost ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-white hover:bg-white/20"}`}>
          {showGhost ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}完成形（点線）
        </button>
        <button type="button" onClick={() => setSeeThrough((value) => !value)} aria-pressed={seeThrough} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur ${seeThrough ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-white hover:bg-white/20"}`}>
          <Layers className="h-3.5 w-3.5" />地盤を透かす
        </button>
        <button type="button" onClick={() => setViewKey((value) => value + 1)} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-white/20">
          <RotateCcw className="h-3.5 w-3.5" />視点をリセット
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-xl bg-slate-950/75 px-3 py-2 text-xs font-bold text-slate-100 backdrop-blur">
        {(["done", "active", "delayed"] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TASK_STATE_COLOR[state] }} />{TASK_STATE_LABEL[state]}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed border-slate-300" />完成形（未着手）</span>
      </div>
      {(focusTask && focusState) ? (
        <div className="pointer-events-none absolute bottom-3 right-3 w-[min(19rem,calc(100%-1.5rem))] rounded-xl border border-white/10 bg-slate-950/85 p-3 text-xs text-slate-100 shadow-xl backdrop-blur">
          <p className="font-black text-white">{focusTask.name}</p>
          <p className="mt-1 text-slate-300">{focusTask.plannedStart.slice(0, 10)} 〜 {focusTask.plannedEnd.slice(0, 10)}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 font-black text-slate-950" style={{ background: TASK_STATE_COLOR[focusState] }}>{TASK_STATE_LABEL[focusState]}</span>
            <span>実績 {focusTask.progress}% / 予定 {expectedProgress(focusTask)}%</span>
          </div>
          {focusTask.issue && <p className="mt-2 text-amber-300">阻害要因: {focusTask.issue}</p>}
        </div>
      ) : hoveredLabel ? (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-xl border border-white/10 bg-slate-950/85 p-3 text-xs text-slate-100 shadow-xl backdrop-blur">
          <p className="font-black text-white">{hoveredLabel}</p>
          <p className="mt-1 text-slate-300">この工事の工程に含まれない部位（完成形として表示）</p>
        </div>
      ) : null}
      {model?.notice && <p className="absolute inset-x-3 top-12 rounded-lg bg-amber-100 p-2 text-xs font-bold text-amber-900">{model.notice}</p>}
      {missingZones && !model?.notice && (
        <p className="absolute inset-x-3 top-12 rounded-lg bg-amber-100 p-2 text-xs font-bold text-amber-900">作業に 3D 部位（${PUBLISHER_PREFIX}_zone）が未設定のため、完成形のみ表示しています。</p>
      )}
    </div>
  )
}

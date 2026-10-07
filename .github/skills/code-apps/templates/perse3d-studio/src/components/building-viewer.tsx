import { generationProgress, nextFrame } from "@/lib/generation-progress"
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react"
import { Box, Camera, DoorOpen, Footprints, Home, Lightbulb, Maximize2, Minimize2, Sparkles, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BuildingViewer, type CameraPose, type MoveInput, type Pin, type ViewMode, type ViewerStatus } from "@/lib/building-scene"
import type { BuildingSpec, Materials } from "@/lib/building-spec"
import type { FurnitureItem } from "@/lib/furniture"
import { cn } from "@/lib/utils"

export type ViewerHandle = {
  capture: (maxWidth?: number) => string | null
  getPose: () => CameraPose | null
  setPose: (pose: CameraPose) => void
  getMode: () => ViewMode
  setMode: (mode: ViewMode) => void
}

type Props = {
  spec: BuildingSpec | null
  materials: Materials
  pins?: Pin[]
  pickMode?: boolean
  onPick?: (p: [number, number, number]) => void
  onPinClick?: (id: string) => void
  glb?: ArrayBuffer | null
  furniture?: FurnitureItem[]
  selectedFurniture?: string | null
  placeType?: string | null
  onFurnitureSelect?: (id: string | null) => void
  onFurnitureMove?: (id: string, x: number, z: number) => void
  onFurniturePlace?: (type: string, x: number, z: number, level: number) => void
  onFurnitureAction?: (action: "rotate" | "delete" | "cancel") => void
  className?: string
  ref?: Ref<ViewerHandle>
}

const MODES: { value: ViewMode; label: string; icon: typeof Home }[] = [
  { value: "orbit", label: "外観", icon: Home },
  { value: "dollhouse", label: "ドールハウス", icon: Box },
  { value: "walk", label: "内見", icon: Footprints },
]

export function BuildingViewer3D({
  spec,
  materials,
  pins = [],
  pickMode = false,
  onPick,
  onPinClick,
  glb,
  furniture = [],
  selectedFurniture = null,
  placeType = null,
  onFurnitureSelect,
  onFurnitureMove,
  onFurniturePlace,
  onFurnitureAction,
  className,
  ref,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<BuildingViewer | null>(null)
  const [mode, setMode] = useState<ViewMode>("orbit")
  const [level, setLevel] = useState(0)
  const [hour, setHour] = useState(14)
  const [lights, setLights] = useState(false)
  const [quality, setQuality] = useState(true)
  const [status, setStatus] = useState<ViewerStatus | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const callbacks = useRef({ onPick, onPinClick, onFurnitureSelect, onFurnitureMove, onFurniturePlace, onFurnitureAction })
  callbacks.current = { onPick, onPinClick, onFurnitureSelect, onFurnitureMove, onFurniturePlace, onFurnitureAction }

  useEffect(() => {
    if (!hostRef.current) return
    let viewer: BuildingViewer
    try {
      viewer = new BuildingViewer(hostRef.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : "WebGL を初期化できませんでした")
      return
    }
    viewer.onStatus = s => {
      setStatus(s)
      setLevel(s.level)
    }
    viewer.onPick = p => callbacks.current.onPick?.(p)
    viewer.onPinClick = id => callbacks.current.onPinClick?.(id)
    viewer.onFurnitureSelect = id => callbacks.current.onFurnitureSelect?.(id)
    viewer.onFurnitureMove = (id, x, z) => callbacks.current.onFurnitureMove?.(id, x, z)
    viewer.onFurniturePlace = (t, x, z, l) => callbacks.current.onFurniturePlace?.(t, x, z, l)
    viewer.onFurnitureAction = a => callbacks.current.onFurnitureAction?.(a)
    viewerRef.current = viewer
    // 開発時と、明示的に ?debug3d を付けた検証時だけ、ヘッドレス試験用にビューアを公開する
    if (import.meta.env.DEV || /[?&]debug3d\b/.test(location.search + location.hash)) (window as unknown as { __viewer?: BuildingViewer }).__viewer = viewer
    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
  }, [])

  // 家具だけの変更（保存のたびに spec が新しいオブジェクトになる）で建物を作り直さない
  const specKey = useMemo(() => (spec ? JSON.stringify({ ...spec, furniture: undefined, materials: undefined }) : ""), [spec])
  useEffect(() => {
    if (!spec || !viewerRef.current) return
    viewerRef.current.setSpec({ ...spec, materials })
    // 生成の進み具合（最後の段）は、建物を組み終えて 1 コマ描いたところで完了にする
    const walls = spec.floors.reduce((n, f) => n + f.walls.length, 0)
    nextFrame().then(() => generationProgress.viewerReady(`${spec.floors.length} 階・壁 ${walls} 枚`))
    // materials は下の effect で個別反映する（spec 再生成を避ける）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey])

  useEffect(() => {
    viewerRef.current?.setFurniture(furniture)
  }, [furniture])

  useEffect(() => {
    viewerRef.current?.selectFurniture(selectedFurniture)
  }, [selectedFurniture])

  useEffect(() => {
    viewerRef.current?.setPlaceType(placeType)
  }, [placeType])

  useEffect(() => {
    viewerRef.current?.setMaterials(materials)
  }, [materials])

  useEffect(() => {
    viewerRef.current?.setPins(pins)
  }, [pins])

  useEffect(() => {
    if (viewerRef.current) viewerRef.current.pickMode = pickMode
  }, [pickMode])

  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    if (glb) v.loadGlb(glb).catch(e => setError(`GLB を読み込めませんでした: ${e instanceof Error ? e.message : e}`))
    else v.clearImported()
  }, [glb])

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === frameRef.current)
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  useImperativeHandle(ref, () => ({
    capture: (maxWidth?: number) => viewerRef.current?.capture(maxWidth) ?? null,
    getPose: () => viewerRef.current?.getPose() ?? null,
    setPose: (pose: CameraPose) => {
      viewerRef.current?.setPose(pose)
      setMode(pose.mode)
    },
    getMode: () => viewerRef.current?.getMode() ?? "orbit",
    setMode: (m: ViewMode) => changeMode(m),
  }))

  const changeMode = (m: ViewMode) => {
    setMode(m)
    viewerRef.current?.setMode(m)
    if (m === "dollhouse") viewerRef.current?.setCutLevel(level)
  }

  const changeLevel = (l: number) => {
    setLevel(l)
    viewerRef.current?.setCutLevel(l)
    viewerRef.current?.setFloor(l)
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await frameRef.current?.requestFullscreen()
    } catch {
      setFullscreen(f => !f)
    }
  }

  const floors = spec?.floors ?? []
  const currentFloor = floors.find(f => f.level === level)

  return (
    <div
      ref={frameRef}
      className={cn(
        "relative overflow-hidden rounded-lg border bg-slate-900",
        fullscreen && "fixed inset-0 z-50 rounded-none border-0",
        className,
      )}
      data-tour="viewer"
    >
      <div ref={hostRef} className="absolute inset-0" aria-label="3D ビューア" />
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/90">{error}</div>
      )}
      {!spec && !glb && !error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">
          3D モデルがまだありません。「画像から 3D 化」タブでパースや間取り図を解析してください。
        </div>
      )}

      {/* 上部ツールバー */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex flex-wrap gap-1 rounded-md bg-black/55 p-1 backdrop-blur">
          {MODES.map(m => (
            <Button
              key={m.value}
              size="sm"
              variant={mode === m.value ? "default" : "ghost"}
              className={cn("h-8 gap-1", mode !== m.value && "text-white hover:bg-white/15 hover:text-white")}
              onClick={() => changeMode(m.value)}
              data-tour={`mode-${m.value}`}
            >
              <m.icon className="h-4 w-4" />
              {m.label}
            </Button>
          ))}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-md bg-black/55 p-1 text-white backdrop-blur">
          {floors.length > 1 &&
            floors.map(f => (
              <Button
                key={f.level}
                size="sm"
                variant={level === f.level ? "default" : "ghost"}
                className={cn("h-8 px-2", level !== f.level && "text-white hover:bg-white/15 hover:text-white")}
                onClick={() => changeLevel(f.level)}
              >
                {f.level + 1}F
              </Button>
            ))}
          <label className="flex items-center gap-1 px-2 text-xs" title="時刻（太陽の位置）">
            <Sun className="h-4 w-4" />
            <input
              type="range"
              min={6}
              max={18.5}
              step={0.25}
              value={hour}
              onChange={e => {
                const h = Number(e.target.value)
                setHour(h)
                viewerRef.current?.setTimeOfDay(h)
              }}
              className="w-20 accent-amber-400"
              aria-label="時刻"
            />
            <span className="w-10 tabular-nums">{`${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`}</span>
          </label>
          <Button
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8 text-white hover:bg-white/15 hover:text-white", quality && "text-sky-300")}
            onClick={() => {
              setQuality(!quality)
              viewerRef.current?.setQuality(!quality)
            }}
            title={quality ? "高品質表示（陰影）: オン" : "高品質表示（陰影）: オフ（軽量）"}
            aria-label="高品質表示の切替"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8 text-white hover:bg-white/15 hover:text-white", lights && "text-amber-300")}
            onClick={() => {
              setLights(!lights)
              viewerRef.current?.setRoomLights(!lights)
            }}
            title="室内照明"
            aria-label="室内照明"
          >
            <Lightbulb className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
            onClick={() => {
              const url = viewerRef.current?.capture()
              if (!url) return
              const a = document.createElement("a")
              a.href = url
              a.download = `${spec?.name ?? "model"}-${mode}.jpg`
              a.click()
            }}
            title="スクリーンショットを保存"
            aria-label="スクリーンショットを保存"
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
            onClick={toggleFullscreen}
            title={fullscreen ? "全画面を終了" : "全画面"}
            aria-label={fullscreen ? "全画面を終了" : "全画面"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* 内見モード: 部屋ジャンプ + 操作パッド */}
      {mode === "walk" && spec && (
        <>
          <div className="absolute left-2 top-14 flex max-w-[60%] flex-wrap gap-1">
            {currentFloor?.rooms.map(r => (
              <button
                key={`${r.name}-${r.x}`}
                type="button"
                onClick={() => viewerRef.current?.goTo(level, r.x, r.z)}
                className="flex items-center gap-1 rounded bg-black/55 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/75"
              >
                <DoorOpen className="h-3 w-3" />
                {r.name}
              </button>
            ))}
          </div>
          <TouchPad onChange={input => viewerRef.current?.setMoveInput(input)} />
          <p className="absolute bottom-2 left-1/2 hidden -translate-x-1/2 rounded bg-black/55 px-2 py-1 text-[11px] text-white/90 md:block">
            クリックしてから W/A/S/D・矢印キーで移動、ドラッグで見回し、Shift で早歩き
          </p>
        </>
      )}

      {spec && status && (
        <Minimap
          spec={spec}
          status={status}
          level={level}
          onTeleport={(x, z) => {
            setMode("walk")
            viewerRef.current?.goTo(level, x, z)
          }}
        />
      )}
      {pickMode && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-amber-500 px-3 py-1 text-xs font-medium text-black shadow">
          コメントを置く場所をクリックしてください
        </div>
      )}
      {placeType && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-amber-500 px-3 py-1 text-xs font-medium text-black shadow">
          置きたい場所をクリック（壁の近くは壁に寄せて向きを合わせます／Esc で中止）
        </div>
      )}
    </div>
  )
}

function TouchPad({ onChange }: { onChange: (i: MoveInput) => void }) {
  const state = useRef<MoveInput>({ forward: 0, strafe: 0, turn: 0 })
  const set = (patch: Partial<MoveInput>) => {
    state.current = { ...state.current, ...patch }
    onChange(state.current)
  }
  const hold = (patch: Partial<MoveInput>, reset: Partial<MoveInput>) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      set(patch)
    },
    onPointerUp: () => set(reset),
    onPointerLeave: () => set(reset),
    onPointerCancel: () => set(reset),
  })
  const btn = "grid h-10 w-10 place-items-center rounded-md bg-black/55 text-white backdrop-blur active:bg-primary select-none"
  return (
    <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1" aria-label="移動パッド">
      <span />
      <button type="button" className={btn} {...hold({ forward: 1 }, { forward: 0 })} aria-label="前進">▲</button>
      <span />
      <button type="button" className={btn} {...hold({ turn: 1 }, { turn: 0 })} aria-label="左を向く">⟲</button>
      <button type="button" className={btn} {...hold({ forward: -1 }, { forward: 0 })} aria-label="後退">▼</button>
      <button type="button" className={btn} {...hold({ turn: -1 }, { turn: 0 })} aria-label="右を向く">⟳</button>
    </div>
  )
}

function Minimap({ spec, status, level, onTeleport }: { spec: BuildingSpec; status: ViewerStatus; level: number; onTeleport: (x: number, z: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = 150
  const margin = 3
  const { width: W, depth: D } = spec.footprint
  const scale = (size - 16) / Math.max(W + margin * 2, D + margin * 2)
  const ox = (size - (W + margin * 2) * scale) / 2 + margin * scale
  const oz = (size - (D + margin * 2) * scale) / 2 + margin * scale

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = "rgba(15,23,42,0.7)"
    ctx.fillRect(0, 0, size, size)
    const floor = spec.floors.find(f => f.level === level) ?? spec.floors[0]
    ctx.fillStyle = "rgba(255,255,255,0.12)"
    for (const s of floor.slabs) ctx.fillRect(ox + s.x * scale, oz + s.z * scale, s.w * scale, s.d * scale)
    for (const w of floor.walls) {
      ctx.fillStyle = w.kind === "wall" ? "#e2e8f0" : w.kind === "door" ? "rgba(245,158,11,0.6)" : "#38bdf8"
      ctx.fillRect(ox + w.x * scale, oz + w.z * scale, Math.max(1, w.w * scale), Math.max(1, w.d * scale))
    }
    ctx.fillStyle = "rgba(255,255,255,0.75)"
    ctx.font = "9px system-ui, sans-serif"
    ctx.textAlign = "center"
    for (const r of floor.rooms) if (r.area >= 4) ctx.fillText(r.name, ox + r.x * scale, oz + r.z * scale + 3)
    if (status.mode === "walk") {
      const px = ox + status.x * scale
      const pz = oz + status.z * scale
      ctx.save()
      ctx.translate(px, pz)
      ctx.rotate(-status.yaw)
      ctx.fillStyle = "rgba(250,204,21,0.25)"
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, 18, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6)
      ctx.fill()
      ctx.fillStyle = "#facc15"
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(4, 4)
      ctx.lineTo(-4, 4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }, [spec, status, level, ox, oz, scale])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="absolute bottom-2 right-2 cursor-crosshair rounded-md border border-white/20"
      title="クリックした地点へ移動（内見モード）"
      onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) * (size / rect.width) - ox) / scale
        const z = ((e.clientY - rect.top) * (size / rect.height) - oz) / scale
        onTeleport(Math.round(x * 100) / 100, Math.round(z * 100) / 100)
      }}
      data-tour="minimap"
    />
  )
}

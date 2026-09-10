import { useEffect, useRef, useState } from "react"
import { Focus, Home, Maximize2, Minimize2, Minus, Plus, RotateCcw, View } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { PlantNode } from "@/data/plant-model"
import type { ImportedPlant } from "@/lib/plant-glb"
import type { EquipmentHeat } from "@/data/plant-maintenance"
import type { PlantDesign } from "@/data/plant-design"
import { createPlantViewer, type PlantDisplayMode, type PlantView } from "@/lib/plant-scene"
import "./plant-viewer.css"

type Props = {
  selectedId: string | null
  onSelect: (id: string | null, partId?: string) => void
  selectedPart?: string
  heat: EquipmentHeat[]
  heatEnabled: boolean
  modelCode: string
  focusRequest: number
  nodes: PlantNode[]
  imported: ImportedPlant | null
  site?: PlantDesign["site"]
}

export function PlantViewer({ selectedId, selectedPart, onSelect, focusRequest, nodes, imported, heat, heatEnabled, modelCode, site }: Props) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const viewerRef = useRef<ReturnType<typeof createPlantViewer> | null>(null)
  const onSelectRef = useRef(onSelect)
  const [mode, setMode] = useState<PlantDisplayMode>("all")
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState<PlantView>("perspective")
  const [expanded, setExpanded] = useState(false)
  const expandButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => {
    if (!host) return
    try {
      viewerRef.current = createPlantViewer(host, nodes, (id, partId) => onSelectRef.current(id, partId), (message) => setError(message), imported?.root, site)
    } catch {
      queueMicrotask(() => setError("3D を開始できませんでした。WebGL 2 とハードウェア アクセラレーションが利用できるブラウザで再試行してください。"))
    }
    return () => { viewerRef.current?.dispose(); viewerRef.current = null }
  }, [attempt, nodes, imported, site, host])

  useEffect(() => { viewerRef.current?.heat(heat, heatEnabled) }, [heat, heatEnabled, attempt, imported, nodes, site, host])
  useEffect(() => { viewerRef.current?.select(selectedId, mode, selectedPart) }, [selectedId, selectedPart, mode, attempt, imported, nodes, site, host])
  useEffect(() => { viewerRef.current?.view(view) }, [view, attempt, imported, nodes, site, host])
  useEffect(() => { if (focusRequest > 0) viewerRef.current?.focus() }, [focusRequest])

  const changeView = (next: PlantView) => { setView(next); viewerRef.current?.view(next) }

  const viewport = (
    <section className="plant-viewport" aria-label="3D ビューアー" data-tour="plant-viewer">
      <div className="plant-view-toolbar">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Button ref={expanded ? undefined : expandButtonRef} variant="ghost" size="icon" title={expanded ? "元のサイズに戻す" : "3Dを最大化"} aria-label={expanded ? "元のサイズに戻す" : "3Dを最大化"} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button>
          <Button variant="ghost" size="icon" title="全体表示" aria-label="全体表示" onClick={() => { setMode("all"); changeView("perspective") }}><Home /></Button>
          <Button variant="ghost" size="icon" title="選択設備にフォーカス" aria-label="選択設備にフォーカス" disabled={!selectedId || !!error} onClick={() => viewerRef.current?.focus()}><Focus /></Button>
          <Button variant="ghost" size="icon" title="拡大" aria-label="拡大" disabled={!!error} onClick={() => viewerRef.current?.zoom(0.8)}><Plus /></Button>
          <Button variant="ghost" size="icon" title="縮小" aria-label="縮小" disabled={!!error} onClick={() => viewerRef.current?.zoom(1.25)}><Minus /></Button>
          <label className="plant-view-select"><View size={15} aria-hidden="true" /><span className="sr-only">視点</span>
            <select aria-label="視点" value={view} onChange={(event) => changeView(event.target.value as PlantView)}>
              <option value="perspective">立体</option><option value="top">上面</option><option value="front">正面</option>
            </select>
          </label>
        </div>
        <div className="plant-segments" role="group" aria-label="設備表示モード">
          {([ ["all", "全体"], ["ghost", "半透明"], ["isolate", "選択のみ"] ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mode === value} disabled={value !== "all" && !selectedId} onClick={() => setMode(value)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="plant-canvas-wrap">
        <div ref={setHost} className="plant-canvas" />
        <div className="plant-canvas-caption" aria-live="polite">{selectedId ? nodes.find((node) => node.id === selectedId)?.tag : imported ? "GLB" : modelCode}</div>
        {error && <div className="plant-view-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => { setError(""); setAttempt((previous) => previous + 1) }}><RotateCcw />再読み込み</Button></div>}
      </div>
      <footer className="plant-viewport-footer"><span>{imported ? "GLB / ローカル" : modelCode}</span><span>単位 m · {nodes.length} ノード</span></footer>
    </section>
  )
  return <>
    {expanded ? <section className="plant-viewport plant-viewport-placeholder" aria-hidden="true" /> : viewport}
    <Dialog open={expanded} onOpenChange={setExpanded}>
      {expanded && <DialogContent className="plant-fullscreen-dialog" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); expandButtonRef.current?.focus() }}>
        <DialogTitle className="sr-only">プラント3D 最大化表示</DialogTitle>
        {viewport}
      </DialogContent>}
    </Dialog>
  </>
}
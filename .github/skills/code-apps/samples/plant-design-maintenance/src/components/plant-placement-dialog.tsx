import { useEffect, useState } from "react"
import { ArrowLeft, Check, ImageOff, Loader2, RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PlantViewer } from "@/components/plant-viewer"
import { compilePlantDesign, unitFootprint, validatePlantDesign, type PlantDesign, type PlantModule, type PlantUnit } from "@/data/plant-design"
import { confirmPlacement, placementCandidate, snapPlacementPoint } from "@/data/plant-placement"
import { renderModuleThumbnails } from "@/lib/plant-module-thumbnails"

const noHeat: [] = []
const points = (ring: [number, number][]) => ring.map((point) => point.join(",")).join(" ")

function ModuleGallery({ modules, choose }: { modules: PlantModule[]; choose: (module: PlantModule) => void }) {
  const [images, setImages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      try { const rendered = renderModuleThumbnails(modules); if (active) setImages(rendered) }
      catch { if (active) setImages({}) }
      finally { if (active) setLoading(false) }
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [modules])
  return <div className="placement-gallery" aria-label="オブジェクトギャラリー">
    {modules.map((module) => <button type="button" className="placement-gallery-item" key={module.id} onClick={() => choose(module)} aria-label={`${module.name} の配置場所を選択`}>
      <div className="placement-gallery-image">{images[module.id] ? <img src={images[module.id]} alt={`${module.name} の3D形状`} /> : loading ? <Loader2 className="animate-spin" aria-label="画像生成中" /> : <span><ImageOff size={24} />画像を生成できません</span>}</div>
      <strong>{module.name}</strong><span>{module.equipment.length} 設備 / {module.connections.length} 内部接続</span>
    </button>)}
  </div>
}

export function PlantPlacementDialog({ design, duplicate, onClose, onConfirm }: {
  design: PlantDesign
  duplicate?: PlantUnit
  onClose: () => void
  onConfirm: (next: PlantDesign, unitId: string) => void
}) {
  const [basis] = useState(() => JSON.stringify(design))
  const [draft, setDraft] = useState<PlantUnit | null>(() => duplicate ? { ...duplicate, id: `u-${crypto.randomUUID().slice(0, 8)}`, name: `${duplicate.name} コピー` } : null)
  const [positioned, setPositioned] = useState(false)
  const [error, setError] = useState("")
  const choose = (module: PlantModule) => {
    setDraft({ id: `u-${crypto.randomUUID().slice(0, 8)}`, moduleId: module.id, name: module.name, position: [0, 0, 0], rotation: 0 })
    setPositioned(false); setError("")
  }
  let candidate = design
  let issues: string[] = []
  if (draft && positioned) {
    try { candidate = placementCandidate(design, draft); issues = validatePlantDesign(candidate).map((issue) => issue.message) }
    catch (caught) { issues = [caught instanceof Error ? caught.message : "配置を確認できません。"] }
  }
  const minX = Math.min(...design.site.boundary.map((point) => point[0])) - 3
  const minZ = Math.min(...design.site.boundary.map((point) => point[1])) - 3
  const width = Math.max(...design.site.boundary.map((point) => point[0])) - minX + 3
  const depth = Math.max(...design.site.boundary.map((point) => point[1])) - minZ + 3
  let ghost: [number, number][] = []
  try { if (draft && positioned) ghost = unitFootprint(candidate, draft) } catch { ghost = [] }
  let nodes: ReturnType<typeof compilePlantDesign> = []
  try { nodes = compilePlantDesign(candidate) } catch { nodes = [] }
  const setPosition = (horizontal: number, vertical: number) => {
    if (!draft) return
    setDraft({ ...draft, position: snapPlacementPoint(horizontal, vertical) }); setPositioned(true); setError("")
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="placement-dialog sm:max-w-6xl" aria-describedby="placement-stage">
    <DialogHeader><DialogTitle>{draft ? "配置場所を選択" : "オブジェクトを選択"}</DialogTitle><DialogDescription id="placement-stage">{draft ? `${draft.name} / ${positioned ? `X ${draft.position[0]} m · Z ${draft.position[2]} m` : "位置未指定"}` : "ユニットライブラリ"}</DialogDescription></DialogHeader>
    {!draft ? <ModuleGallery modules={design.modules} choose={choose} /> : <>
      <div className="placement-toolbar">
        <Button variant="ghost" onClick={() => { setDraft(null); setPositioned(false); setError("") }}><ArrowLeft size={16} />ギャラリー</Button>
        <div className="placement-coordinates">{([0, 2] as const).map((axis) => <label key={axis}>{axis === 0 ? "X" : "Z"} (m)<input type="number" step="0.5" min="-1000" max="1000" aria-label={`配置 ${axis === 0 ? "X" : "Z"} (m)`} value={positioned ? draft.position[axis] : ""} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) setPosition(axis === 0 ? value : draft.position[0], axis === 2 ? value : draft.position[2]) }} /></label>)}</div>
        <Button variant="outline" title="90度回転" aria-label="配置を90度回転" onClick={() => setDraft({ ...draft, rotation: ((draft.rotation + 90) % 360) as PlantUnit["rotation"] })}><RotateCw size={16} />{draft.rotation}°</Button>
      </div>
      <div className="placement-scene">
        {nodes.length > 0 && <PlantViewer nodes={nodes} selectedId={draft && positioned ? `${draft.id}/${design.modules.find((module) => module.id === draft.moduleId)?.equipment[0]?.id}` : null} onSelect={() => {}} heat={noHeat} heatEnabled={false} imported={null} site={design.site} modelCode="配置プレビュー" focusRequest={0} />}
        <div className="placement-map-area"><h3>配置位置</h3><svg className="placement-map" viewBox={`${minX} ${minZ} ${width} ${depth}`} role="img" aria-label="配置位置を選ぶ敷地図" onClick={(event) => {
          const matrix = event.currentTarget.getScreenCTM()
          if (!matrix) return
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
          setPosition(point.x, point.y)
        }}>
          <polygon points={points(design.site.boundary)} className="designer-boundary" />
          {design.site.exclusions.map((zone) => <polygon key={zone.id} points={points(zone.polygon)} className="designer-exclusion"><title>{zone.name}</title></polygon>)}
          {design.units.map((unit) => { let ring; try { ring = unitFootprint(design, unit) } catch { return null } return <g key={unit.id}><polygon points={points(ring)} className="designer-unit" /><text x={unit.position[0]} y={unit.position[2]} fontSize={width / 55} textAnchor="middle">{unit.name}</text></g> })}
          {ghost.length > 0 && <polygon points={points(ghost)} className={`placement-ghost ${issues.length ? "is-invalid" : "is-valid"}`} />}
          {positioned && <circle cx={draft.position[0]} cy={draft.position[2]} r={width / 150} className="placement-anchor" />}
        </svg></div>
      </div>
      <div className="placement-status" role="status">{!positioned ? "位置未指定" : issues.length ? issues.map((issue, index) => <p key={index}>{issue}</p>) : "配置可能"}</div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="placement-footer"><Button variant="outline" onClick={onClose}><X size={16} />キャンセル</Button><Button disabled={!positioned || issues.length > 0} onClick={() => {
        try { onConfirm(confirmPlacement(design, basis, draft), draft.id) } catch (caught) { setError(caught instanceof Error ? caught.message : "配置できませんでした。") }
      }}><Check size={16} />この場所に配置</Button></div>
    </>}
  </DialogContent></Dialog>
}
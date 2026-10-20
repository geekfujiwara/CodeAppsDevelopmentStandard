import { useRef, useState, type PointerEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EDIT_CATEGORIES, editRect, imageRect, roomName, type EditCategory, type FloorplanEdit, type PlanPoint } from "@/lib/floorplan-edits"
import type { FloorplanResult } from "@/lib/floorplan-analyzer"

type Props = {
  edits: FloorplanEdit[]
  result: FloorplanResult | null
  size: { width: number; height: number }
  disabled?: boolean
  onChange: (edits: FloorplanEdit[]) => void
  children: React.ReactNode
}
type Gesture = { start: PlanPoint; current: PlanPoint; action: "draw" | "move" | "resize"; original?: FloorplanEdit; pointerId: number }
const distance = (a: PlanPoint, b: PlanPoint, size: Props["size"]) => Math.hypot((a.x - b.x) * size.width, (a.y - b.y) * size.height)
const inside = (e: FloorplanEdit, p: PlanPoint) => p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h

/** 描画は元画像比率の SVG、保存は元画像に対する 0〜1 の矩形。ズームと CSS の縮小に影響されない。 */
export function FloorplanManualEditor({ edits, result, size, disabled, onChange, children }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [category, setCategory] = useState<EditCategory>("wall")
  const [mode, setMode] = useState<"assign" | "select">("assign")
  const [selected, setSelected] = useState<string | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [zoom, setZoom] = useState(1)
  const history = useRef<FloorplanEdit[][]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const label = (v: EditCategory) => EDIT_CATEGORIES.find(c => c.value === v)!.label
  const color = (v: EditCategory) => EDIT_CATEGORIES.find(c => c.value === v)!.color
  const commit = (next: FloorplanEdit[]) => {
    history.current = [...history.current.slice(-29), edits]
    onChange(next)
  }
  const pos = (e: PointerEvent<SVGSVGElement>): PlanPoint => {
    const b = e.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }
  }
  const draft = (g: Gesture): FloorplanEdit => {
    const delta = { x: g.current.x - g.start.x, y: g.current.y - g.start.y }
    if (g.original && g.action === "move") return {
      ...g.original, x: Math.max(0, Math.min(1 - g.original.w, g.original.x + delta.x)), y: Math.max(0, Math.min(1 - g.original.h, g.original.y + delta.y)),
    }
    if (g.original && g.action === "resize") return {
      ...g.original, w: Math.max(0.002, Math.min(1 - g.original.x, g.original.w + delta.x)), h: Math.max(0.002, Math.min(1 - g.original.y, g.original.h + delta.y)),
    }
    return { id: "", category, ...editRect(g.start, g.current) }
  }
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    const p = pos(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    const original = [...edits].reverse().find(r => inside(r, p) || (r.point && distance({ x: r.x, y: r.y }, p, size) < 15))
    if (mode === "select") {
      setSelected(original?.id ?? null)
      if (original) {
        const corner = distance({ x: original.x + original.w, y: original.y + original.h }, p, size) < 18
        setGesture({ start: p, current: p, action: corner && !original.point ? "resize" : "move", original, pointerId: e.pointerId })
      }
    } else setGesture({ start: p, current: p, action: "draw", pointerId: e.pointerId })
  }
  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!gesture || gesture.pointerId !== e.pointerId || disabled) return
    const g = { ...gesture, current: pos(e) }
    setGesture(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (g.action !== "draw") {
      if (distance(g.start, g.current, size) > 2) commit(edits.map(r => r.id === g.original?.id ? draft(g) : r))
      return
    }
    let region = editRect(g.start, g.current)
    let point = false
    if (distance(g.start, g.current, size) < 5) {
      if (roomName(category)) {
        if (!result?.floor.rooms.length) {
          toast.info("部屋が未検出です。用途を指定する範囲をドラッグしてください")
          return
        }
        region = { x: Math.min(g.start.x, 0.998), y: Math.min(g.start.y, 0.998), w: 0.002, h: 0.002 }
        point = true
      } else if (result) {
        const mx = (g.start.x * size.width - result.bboxPx.x) / result.pxPerMeter
        const mz = (g.start.y * size.height - result.bboxPx.y) / result.pxPerMeter
        const hit = result.floor.walls.find(w => mx >= w.x - 0.04 && mx <= w.x + w.w + 0.04 && mz >= w.z - 0.04 && mz <= w.z + w.d + 0.04)
        if (!hit) {
          toast.info("この場所に検出結果がありません。追加したい範囲をドラッグしてください")
          return
        }
        region = imageRect(hit, size, result)
      } else {
        toast.info("まず「床範囲」を選び、建物全体をドラッグしてください")
        return
      }
    } else if (region.w * size.width < 2 || region.h * size.height < 2) {
      // 水平・垂直の線のドラッグでも、壁厚 15cm 相当の矩形にする。
      const thickX = Math.min(0.03, (result?.pxPerMeter ?? size.width / 9.1) * 0.15 / size.width)
      const thickY = Math.min(0.03, (result?.pxPerMeter ?? size.width / 9.1) * 0.15 / size.height)
      region = { ...region, w: Math.max(region.w, thickX), h: Math.max(region.h, thickY) }
    }
    region = { ...region, x: Math.max(0, region.x), y: Math.max(0, region.y),
      w: Math.min(region.w, 1 - region.x), h: Math.min(region.h, 1 - region.y) }
    if (region.w <= 0 || region.h <= 0) return
    const next: FloorplanEdit = { ...region, id: crypto.randomUUID(), category, ...(point ? { point: true } : {}) }
    commit([...edits, next])
    setSelected(next.id)
  }
  const active = edits.find(e => e.id === selected)
  const changeCategory = (v: EditCategory) => {
    setCategory(v)
    if (mode === "select" && active) {
      if (active.point && !roomName(v)) {
        toast.info("部屋のクリック指定は壁に変更できません。範囲をドラッグして追加してください")
        return
      }
      commit(edits.map(e => e.id === active.id ? { ...e, category: v } : e))
    }
  }
  const display = gesture?.original ? edits.filter(e => e.id !== gesture.original?.id) : edits
  return (
    <div className="space-y-2" data-testid="manual-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={enabled ? "default" : "outline"} disabled={disabled} onClick={() => setEnabled(!enabled)} data-testid="manual-toggle">
          {enabled ? "手動補正を終了" : "クリック・ドラッグで手動補正"}
        </Button>
        {edits.length > 0 && <span className="text-xs text-muted-foreground">手動指定 {edits.length} 件（自動判定より優先）</span>}
      </div>
      {enabled && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={mode === "assign" ? "default" : "outline"} onClick={() => setMode("assign")} disabled={disabled}>追加・分類</Button>
            <Button size="sm" variant={mode === "select" ? "default" : "outline"} onClick={() => setMode("select")} disabled={disabled}>選択・移動・サイズ</Button>
            <Button size="sm" variant="outline" disabled={disabled || !history.current.length} onClick={() => {
              const prev = history.current.pop()
              if (prev) { onChange(prev); setSelected(null) }
            }}>元に戻す</Button>
            <Button size="sm" variant="outline" disabled={disabled || !active} onClick={() => { commit(edits.filter(e => e.id !== selected)); setSelected(null) }}>選択を削除</Button>
            <label className="flex items-center gap-1 text-xs">拡大
              <select aria-label="図面の表示倍率" className="rounded border bg-background p-1" value={zoom} onChange={e => setZoom(Number(e.target.value))}>
                <option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="手動指定のカテゴリ">
            {EDIT_CATEGORIES.map(c => (
              <button key={c.value} type="button" disabled={disabled} aria-pressed={category === c.value}
                data-category={c.value} onClick={() => changeCategory(c.value)}
                className={`rounded border px-2 py-1 text-xs ${category === c.value ? "border-primary bg-primary/10 font-semibold" : "bg-background"}`}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />{c.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            「追加・分類」：カテゴリを選び、検出部分をクリック／未検出部分をドラッグ。部屋はクリックで用途変更、ドラッグで領域指定。
            「選択・移動・サイズ」：補正枠をドラッグして移動、右下の四角でサイズ変更。通れない壁は「扉」か「通路・消去」に変更してください。
            収納などの用途指定だけでは仕切り壁は作りません。必要な壁・扉も指定してください。
          </p>
        </div>
      )}
      <div className="overflow-auto rounded border" style={{ maxHeight: enabled ? 720 : undefined }}>
        <div className="relative" style={{ width: `${(enabled ? zoom : 1) * 100}%` }}>
          {children}
          {(enabled || edits.length > 0) && (
            <svg ref={svgRef} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="図面の手動補正エリア"
              className={`absolute inset-0 h-full w-full ${enabled ? "touch-none cursor-crosshair" : "pointer-events-none"}`}
              onPointerDown={enabled ? onDown : undefined}
              onPointerMove={e => { if (gesture?.pointerId === e.pointerId) setGesture({ ...gesture, current: pos(e) }) }}
              onPointerUp={onUp} onPointerCancel={() => setGesture(null)}
              data-testid="manual-surface">
              {[...display, ...(gesture ? [draft(gesture)] : [])].map((r, i) => (
                <g key={r.id || `draft-${i}`}>
                  {r.point ? <ellipse cx={(r.x + r.w / 2) * 1000} cy={(r.y + r.h / 2) * 1000} rx={10} ry={10} fill={color(r.category)} />
                    : <rect x={r.x * 1000} y={r.y * 1000} width={r.w * 1000} height={r.h * 1000}
                      fill={color(r.category)} fillOpacity={0.22} stroke={r.id === selected ? "#0f172a" : color(r.category)}
                      strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={r.category === "erase" ? "5 3" : undefined} />}
                  <text x={r.x * 1000 + 2} y={Math.max(15, r.y * 1000 - 4)} fill={color(r.category)} fontSize={16} stroke="white" strokeWidth={3} paintOrder="stroke">{label(r.category)}</text>
                  {enabled && mode === "select" && r.id === selected && !r.point && <rect x={(r.x + r.w) * 1000 - 7} y={(r.y + r.h) * 1000 - 7} width={14} height={14} fill="#0f172a" />}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
      {enabled && edits.length > 0 && (
        <div className="flex max-h-28 flex-wrap gap-1 overflow-auto" aria-label="手動補正一覧">
          {edits.map((e, i) => <button type="button" key={e.id} className={`rounded border px-2 py-1 text-xs ${e.id === selected ? "bg-primary/10" : ""}`}
            onClick={() => { setSelected(e.id); setCategory(e.category); setMode("select") }}>{i + 1}. {label(e.category)}</button>)}
        </div>
      )}
    </div>
  )
}

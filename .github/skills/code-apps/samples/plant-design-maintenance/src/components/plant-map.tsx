import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, Maximize2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { STATUS_COLOR, type OperationStatus, type PlantSite } from "@/data/plant-site-repository"
import { JAPAN_VIEW, clampZoom, pinPositions } from "@/lib/map-projection"
import "./plant-map.css"

export type PlantMapProps = {
  sites: PlantSite[]
  selectedId: string | null
  onSelect: (site: PlantSite) => void
}

export function PlantMap({ sites, selectedId, onSelect }: PlantMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState(JAPAN_VIEW)

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const selected = sites.find((site) => site.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    setView({ latitude: selected.latitude, longitude: selected.longitude, zoom: 12 })
  }, [selected])

  const pins = useMemo(() => pinPositions(sites, view, size), [sites, view, size])

  const embedUrl = `https://www.google.com/maps?ll=${view.latitude},${view.longitude}&z=${view.zoom}&hl=ja&output=embed`
  const externalUrl = selected
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}`
    : `https://www.google.com/maps/@${view.latitude},${view.longitude},${view.zoom}z`

  const zoomBy = (delta: number) =>
    setView((current) => ({ ...current, zoom: clampZoom(current.zoom + delta) }))

  return (
    <div className="plant-map">
      <div className="plant-map-canvas" ref={canvasRef}>
        <iframe title="プラント拠点の地図" src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        {!pins.length && <p className="plant-map-fallback">表示範囲に拠点がありません。「全体表示」で日本全域に戻せます。</p>}
        {pins.map((pin) => (
          <button
            key={pin.site.id}
            type="button"
            className="plant-map-pin"
            style={{ left: pin.left, top: pin.top }}
            aria-pressed={pin.site.id === selectedId}
            title={`${pin.site.name}（${pin.site.status}）`}
            onClick={() => onSelect(pin.site)}
          >
            <i style={{ background: STATUS_COLOR[pin.site.status] }} aria-hidden="true" />
            <span>{pin.site.name}</span>
          </button>
        ))}
        <div className="plant-map-controls">
          <Button variant="secondary" size="icon" aria-label="拡大" onClick={() => zoomBy(1)}><Plus /></Button>
          <Button variant="secondary" size="icon" aria-label="縮小" onClick={() => zoomBy(-1)}><Minus /></Button>
          <Button variant="secondary" size="icon" aria-label="全体表示" title="全体表示" onClick={() => setView(JAPAN_VIEW)}>
            <Maximize2 />
          </Button>
          <Button variant="secondary" size="icon" asChild>
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" aria-label="Google マップで開く" title="Google マップで開く">
              <ExternalLink />
            </a>
          </Button>
        </div>
      </div>
      <div className="plant-map-legend">
        {(Object.keys(STATUS_COLOR) as OperationStatus[]).map((status) => (
          <span key={status}>
            <i style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
            {status}
          </span>
        ))}
        <span>ピンをクリックすると拠点の詳細を開きます。</span>
      </div>
    </div>
  )
}

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ZoomIn } from "lucide-react"
import { listAll } from "@/data/dataverse-client"
import type { PlantPageImage } from "@/lib/plant-page-images"
import { loadPlantPageImages } from "@/lib/plant-page-image-loader"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import "./plant-agent-images.css"

const P = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || ""
const TP = import.meta.env.VITE_TABLE_PREFIX?.trim() || `${P}_kb`

export function PlantAgentImages({ sourceIds, reply, principalKey, direct = false }: { sourceIds: string[]; reply: string; principalKey: string; direct?: boolean }) {
  const [expanded, setExpanded] = useState<PlantPageImage | null>(null)
  const images = useQuery({ queryKey: ["plant-page-images", principalKey, sourceIds, reply, direct], queryFn: () => loadPlantPageImages(listAll, sourceIds, reply, direct, P, TP), retry: false, gcTime: 0, staleTime: 0 })
  if (images.isPending) return <p role="status" className="flex items-center gap-2 text-xs"><Loader2 size={14} className="animate-spin" aria-hidden="true" />図面画像を確認中</p>
  if (images.isError) return <p role="status">図面画像を取得できません。資料のアクセス権を確認してください。</p>
  const unavailable = images.data?.unavailable ?? 0
  if (!images.data?.images.length) {
    if (unavailable) return <p role="status">図面ページ画像がまだ用意されていません（{unavailable} 件）。図面 PDF の取り込み後に表示されます。別図面では代用しません。</p>
    return direct ? <p role="status">選択した設備で参照できる検証済み図面ページの索引がありません。別設備の図面では代用しません。</p> : null
  }
  return <div className="agent-page-images">
    <p>関連図面</p>
    <div className="agent-page-image-grid">{images.data.images.map(image => <button type="button" key={`${image.sha256}-${image.page}`} onClick={() => setExpanded(image)} title={`図面を拡大: ${image.drawingNumber} ${image.revision} p.${image.page}`}>
      <img src={image.src} alt={`${image.drawingNumber} ${image.revision} p.${image.page}`} width={image.width} height={image.height} loading="lazy" />
      <span><ZoomIn size={14} aria-hidden="true" />{image.drawingNumber} {image.revision} p.{image.page}</span>
    </button>)}</div>
    {unavailable > 0 && <p role="status">図面ページ画像が未用意の索引が {unavailable} 件あります。</p>}
    <Dialog open={!!expanded} onOpenChange={open => { if (!open) setExpanded(null) }}>
      <DialogContent className="agent-page-image-dialog">
        <DialogTitle>{expanded?.drawingNumber} {expanded?.revision} p.{expanded?.page}</DialogTitle>
        <DialogDescription>Azure FilesのPDFから取り込んだ図面ページ</DialogDescription>
        {expanded && <div className="agent-page-image-scroll"><img src={expanded.src} alt={`${expanded.drawingNumber} p.${expanded.page}`} width={expanded.width} height={expanded.height} /></div>}
      </DialogContent>
    </Dialog>
  </div>
}
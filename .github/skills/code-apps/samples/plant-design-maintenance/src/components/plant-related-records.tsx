import { useState } from "react"
import { FileQuestion, FileText, Focus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { drawingsForEquipment, plantParts, type PlantDrawing } from "@/data/plant-catalog"
import { inquiriesForEquipment, type PlantInquiry } from "@/data/plant-maintenance"
import type { PlantNode } from "@/data/plant-model"

export function PlantRelatedRecords({ modelId, node, onPart, onActivity }: { modelId: string; node: PlantNode; onPart: (partId?: string) => void; onActivity?: (activity: "drawings" | "evidence") => void }) {
  const inquiries = inquiriesForEquipment(modelId, node.id)
  const drawings = drawingsForEquipment(modelId, node.id)
  const [opened, setOpened] = useState<PlantInquiry | PlantDrawing | null>(null)
  const openRecord = (record: PlantInquiry | PlantDrawing) => {
    setOpened(record)
    onActivity?.("question" in record ? "evidence" : "drawings")
  }
  const parts = plantParts(node)
  return <>
    <section><h4 className="plant-section-title"><FileQuestion size={14} />問い合わせ <span>{inquiries.length}</span></h4>
      <div className="plant-document-list">{inquiries.map((record) => <button type="button" key={record.id} onClick={() => openRecord(record)}><FileQuestion size={16} /><span><strong>{record.title}</strong><span>{record.openedOn} / {record.status}</span></span></button>)}</div>
      {!inquiries.length && <p className="text-xs text-muted-foreground">紐づく問い合わせはありません。</p>}
    </section>
    <section><h4 className="plant-section-title"><FileText size={14} />図面 <span>{drawings.length}</span></h4>
      <div className="plant-document-list">{drawings.map((record) => <button type="button" key={record.id} onClick={() => openRecord(record)}><FileText size={16} /><span><strong>{record.title}</strong><span>{record.number} / {record.revision}</span></span></button>)}</div>
    </section>
    <Dialog open={!!opened} onOpenChange={(open) => { if (!open) setOpened(null) }}>
      {opened && <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto [overflow-wrap:anywhere]">
        <DialogHeader><DialogTitle className="pr-6 leading-snug">{opened.title}</DialogTitle><DialogDescription>{node.tag} / サンプル / {"number" in opened ? opened.number : opened.id}</DialogDescription></DialogHeader>
        {"question" in opened ? <div className="space-y-4 text-sm leading-7">
          <p>{opened.openedOn} / {opened.status}</p><p>{opened.question}</p><p><strong>回答: </strong>{opened.answer ?? "回答待ち"}</p>
          <p className="text-xs">故障記録: {opened.failureId}</p>
          <Button variant="outline" onClick={() => { onPart(opened.partId); setOpened(null) }}><Focus />故障箇所と履歴を表示</Button>
          {drawings.filter((record) => record.id === opened.drawingId).map((record) => <Button key={record.id} variant="outline" className="w-full whitespace-normal h-auto py-2" onClick={() => openRecord(record)}><FileText />{record.number}</Button>)}
        </div> : <div className="space-y-4">
          <svg viewBox="0 0 600 320" className="w-full border bg-muted" role="img" aria-label={`${node.tag} の模式配置図と部位番号`}>
            <text x="24" y="30" fontSize="16" fill="currentColor">{node.tag} / 正面模式図</text>
            <rect x="170" y="70" width="250" height="185" rx={node.kind === "tank" || node.kind === "tower" ? 35 : 5} fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="130" y1="268" x2="460" y2="268" stroke="currentColor" />
            {parts.map((part, index) => {
              const horizontal = Math.max(175, Math.min(425, 295 + part.position[0] / node.size[0] * 230))
              const vertical = Math.max(80, Math.min(255, 255 - part.position[1] / Math.max(node.size[1], 1) * 160))
              return <g key={part.id}><circle cx={horizontal} cy={vertical} r="12" fill="var(--background)" stroke="currentColor" /><text x={horizontal} y={vertical + 4} textAnchor="middle" fontSize="12" fill="currentColor">{index + 1}</text></g>
            })}
            <text x="24" y="303" fontSize="12" fill="currentColor">Rev.1 / 非縮尺 / 施工・設計判断用ではありません</text>
          </svg>
          <dl className="plant-properties"><div><dt>プラント ID</dt><dd>{modelId}</dd></div><div><dt>設備 ID</dt><dd>{node.id}</dd></div><div><dt>配置座標 (m)</dt><dd>{node.position.join(", ")}</dd></div></dl>
          <div className="space-y-2">{parts.map((part, index) => <Button variant="outline" key={part.id} className="w-full" onClick={() => { onPart(part.id); setOpened(null) }}><Focus />{index + 1}. {part.name}</Button>)}</div>
        </div>}
      </DialogContent>}
    </Dialog>
  </>
}
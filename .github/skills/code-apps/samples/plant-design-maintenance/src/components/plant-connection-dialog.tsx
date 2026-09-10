import { useState } from "react"
import { Cable, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PlantViewer } from "@/components/plant-viewer"
import { compilePlantDesign, type PlantDesign } from "@/data/plant-design"
import { acceptPlantConnection, proposePlantConnections, type ConnectionProposals } from "@/data/plant-connection-proposals"

const noHeat: [] = []

export function PlantConnectionDialog({ design, batch, onClose, onConfirm }: {
  design: PlantDesign
  batch: ConnectionProposals
  onClose: () => void
  onConfirm: (next: PlantDesign, batch: ConnectionProposals) => void
}) {
  const [selected, setSelected] = useState("")
  const [error, setError] = useState("")
  const proposal = batch.proposals.find((item) => item.key === selected)
  const preview = proposal ? { ...design, connections: [...design.connections, proposal.connection] } : design
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="connection-dialog sm:max-w-6xl">
    <DialogHeader><DialogTitle>接続先を選択</DialogTitle><DialogDescription>{design.units.find((unit) => unit.id === batch.unitId)?.name} / 接続候補 {batch.proposals.length} 件</DialogDescription></DialogHeader>
    <div className="connection-dialog-layout">
      <PlantViewer nodes={compilePlantDesign(preview)} site={design.site} selectedId={proposal ? `link/${proposal.connection.id}` : null} onSelect={() => {}} heat={noHeat} heatEnabled={false} imported={null} modelCode={proposal ? "接続経路プレビュー / 未確定" : "配置済み"} focusRequest={0} />
      <fieldset className="connection-options"><legend>接続候補</legend>
        {!batch.proposals.length && <p role="status">{batch.reason || "接続可能な未使用端点がありません。"}</p>}
        {batch.proposals.map((item) => <label className="connection-option" key={item.key}>
          <input type="radio" name="connection-candidate" checked={selected === item.key} onChange={() => { setSelected(item.key); setError("") }} />
          <span><strong><Cable size={14} />{item.medium === "power" ? "電源" : "配管"} / 端点間 {item.distance.toFixed(1)} m</strong><span>{item.fromLabel}<br />→ {item.toLabel}</span></span>
        </label>)}
      </fieldset>
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="placement-footer"><Button variant="outline" onClick={onClose}>接続せず閉じる</Button><Button disabled={!proposal} onClick={() => {
      try {
        const next = acceptPlantConnection(design, batch, selected)
        onConfirm(next, proposePlantConnections(next, batch.unitId)); setSelected(""); setError("")
      } catch (caught) { setError(caught instanceof Error ? caught.message : "接続できませんでした。") }
    }}><Check size={16} />接続を確定</Button></div>
  </DialogContent></Dialog>
}
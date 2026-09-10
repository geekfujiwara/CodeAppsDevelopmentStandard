import { useMemo } from "react"
import { ArrowRight, Check, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PlantSitePlan } from "@/components/plant-site-plan"
import { compareDesigns, planViewBox } from "@/lib/plant-design-comparison"
import type { PlantDesign } from "@/data/plant-design"
import "./plant-design-comparison.css"

export function PlantDesignComparison({ before, after, notes = "", busy = false, onConfirm, onCancel }: {
  before: PlantDesign
  after: PlantDesign
  notes?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const view = useMemo(() => planViewBox([before, after]), [before, after])
  const comparison = useMemo(() => compareDesigns(before, after), [before, after])
  const columns = [
    { key: "before", title: "変更前（現在の編集中）", design: before, summary: comparison.before, highlight: comparison.removedUnitIds, note: "適用しない場合はこの配置のままです。" },
    { key: "after", title: "変更後（AI の提案）", design: after, summary: comparison.after, highlight: comparison.changedUnitIds, note: "確定すると編集下書きがこの配置になります。" },
  ]
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
    <DialogContent className="design-comparison sm:max-w-5xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }} onInteractOutside={(event) => { if (busy) event.preventDefault() }}>
      <DialogHeader>
        <DialogTitle><Sparkles size={18} aria-hidden="true" />AI の変更を確認</DialogTitle>
        <DialogDescription>変更前と変更後の配置を比べ、確定すると編集下書きへ適用します。共有保存は別操作です。</DialogDescription>
      </DialogHeader>
      {notes && <p className="design-comparison-notes">{notes}</p>}
      <div className="design-comparison-columns">
        {columns.map((column) => <section className="design-comparison-column" key={column.key} aria-label={column.title}>
          <h3>{column.title}</h3>
          <PlantSitePlan design={column.design} view={view} className="design-comparison-plan" label={`${column.title}の配置図`} changedUnitIds={column.highlight} />
          <p><strong>{column.summary.units}</strong> ユニット / <strong>{column.summary.connections}</strong> 接続</p>
          <p>{column.note}</p>
        </section>)}
      </div>
      <p className="design-comparison-legend"><span><i className="design-comparison-swatch-changed" aria-hidden="true" />強調表示: 変更のあるユニット（左は削除、右は追加・移動・回転）</span></p>
      <h4 className="design-comparison-heading">変更点<ArrowRight size={14} aria-hidden="true" />{comparison.changes.length} 件</h4>
      {comparison.changes.length
        ? <ul className="design-comparison-changes">{comparison.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
        : <p className="design-comparison-notes">配置に差分はありません。</p>}
      <p className="design-comparison-notes">概念設計 / 法規・耐震・防爆・流体解析・3D 干渉は未評価</p>
      <div className="design-comparison-actions">
        <Button variant="outline" disabled={busy} onClick={onCancel}><X />取り消す</Button>
        <Button disabled={busy} onClick={onConfirm}><Check />確定して反映</Button>
      </div>
    </DialogContent>
  </Dialog>
}

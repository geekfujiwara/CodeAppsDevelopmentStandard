import { useMemo, useRef, useState } from "react"
import { Box, Cable, Check, Copy, Download, FileJson, FolderOpen, Plus, Redo2, RefreshCw, Save, Sparkles, Trash2, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { PlantViewer } from "@/components/plant-viewer"
import { usePlantAgentDock } from "@/hooks/use-plant-agent-dock"
import { PlantPlacementDialog } from "@/components/plant-placement-dialog"
import { PlantConnectionDialog } from "@/components/plant-connection-dialog"
import { PlantDesignWizard } from "@/components/plant-design-wizard"
import { PlantDesignChat } from "@/components/plant-design-chat"
import { PlantDesignComparison } from "@/components/plant-design-comparison"
import { PlantSitePlan } from "@/components/plant-site-plan"
import { planViewBox } from "@/lib/plant-design-comparison"
import { designChatSelection } from "@/lib/plant-design-chat"
import { DEFAULT_PLANT_DESIGN } from "@/data/plant-design-sample"
import { assertPlantDesign, compilePlantDesign, designDiff, parsePlantDesign, removeUnit, validatePlantDesign, type PlantDesign, type PlantUnit } from "@/data/plant-design"
import { designHash, saveDesignRevision, type DesignProposal, type DesignRevision } from "@/data/plant-design-store"
import { createPlantDesignRecord, listPlantDesigns, listDesignRevisions, listDesignProposals, sharedDesignStorage, rejectDesignProposal } from "@/lib/plant-design-repository"
import { DESIGN_QUICK_REPLIES, designContextJson } from "@/lib/plant-design-assistant"
import { renderPlantNodeThumbnail } from "@/lib/plant-thumbnail"
import { equipmentPorts } from "@/data/plant-network"
import { acceptPlantConnection, proposePlantConnections, type ConnectionProposals } from "@/data/plant-connection-proposals"
import type { PlantNode } from "@/data/plant-model"
import "./plant-3d.css"
import "./plant-designer.css"

const noHeat: [] = []
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }))
  const anchor = document.createElement("a")
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function preview(design: PlantDesign) {
  try { const checked = parsePlantDesign(JSON.stringify(design)); return { nodes: compilePlantDesign(checked), issues: validatePlantDesign(checked) } }
  catch (error) { return { nodes: [] as PlantNode[], issues: [{ code: "reference", message: String(error) }] } }
}

export default function PlantDesignerPage() {
  const [design, setDesign] = useState<PlantDesign>(() => structuredClone(DEFAULT_PLANT_DESIGN))
  const [scene, setScene] = useState(() => preview(DEFAULT_PLANT_DESIGN))
  const [past, setPast] = useState<PlantDesign[]>([])
  const [future, setFuture] = useState<PlantDesign[]>([])
  const [selected, setSelected] = useState("feed1")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPartId, setSelectedPartId] = useState<string | undefined>(undefined)
  const [tab, setTab] = useState("layout")
  const [placement, setPlacement] = useState<{ duplicate?: PlantUnit } | null>(null)
  const [json, setJson] = useState("")
  const [jsonOpen, setJsonOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [designId, setDesignId] = useState("")
  const [base, setBase] = useState<DesignRevision | null>(null)
  const [records, setRecords] = useState<{ id: string; name: string }[]>([])
  const [revisions, setRevisions] = useState<DesignRevision[]>([])
  const [proposals, setProposals] = useState<DesignProposal[]>([])
  const [review, setReview] = useState<{ proposal: DesignProposal; candidate: PlantDesign } | null>(null)
  const [plan, setPlan] = useState<{ candidate: PlantDesign; basis: string; notes: string } | null>(null)
  const [loadTarget, setLoadTarget] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [autoConnect, setAutoConnect] = useState(true)
  const [connectionProposals, setConnectionProposals] = useState<ConnectionProposals | null>(null)
  const [connectionWizard, setConnectionWizard] = useState<ConnectionProposals | null>(null)
  const [designWizard, setDesignWizard] = useState(false)
  const [designChat, setDesignChat] = useState(false)
  const [editVersion, setEditVersion] = useState(0)
  const currentDesign = useRef(design)
  currentDesign.current = design
  const unit = design.units.find((candidate) => candidate.id === selected)
  const currentScene = review ? preview(review.candidate) : scene
  const selectedNode = currentScene.nodes.find((node) => node.id === selectedNodeId && node.id.split("/")[0] === selected) ?? null
  const shown = review?.candidate ?? design
  const shownUnit = shown.units.find((candidate) => candidate.id === selected)
  const dirty = !base || JSON.stringify(design) !== JSON.stringify(parsePlantDesign(base.json))
  const previewImage = useMemo(() => selectedNode ? renderPlantNodeThumbnail(selectedNode) ?? undefined : undefined, [selectedNode])
  // 共有保存前の設計でも選択中のオブジェクトについて質問できるように、編集中の設計そのものを文脈として渡す。
  const agentDesign = useMemo(() => ({ json: designContextJson(shown, selected, selectedNode?.id ?? null, selectedNode ? selectedPartId : undefined), quickReplies: DESIGN_QUICK_REPLIES }), [shown, selected, selectedNode, selectedPartId])
  usePlantAgentDock({
    previewImage,
    design: agentDesign,
    selection: { modelId: shown.id, modelRevision: shown.revision, unitId: shownUnit?.id, nodeId: selectedNode?.id ?? null, partId: selectedNode ? selectedPartId : undefined, label: selectedNode ? `${shownUnit?.name ?? selectedNode.name} / ${selectedNode.tag}` : shownUnit ? `${shownUnit.name} / ユニット全体` : `${shown.name} / 設計全体` },
  }, !designChat)
  const terminals = scene.nodes.filter((node) => !node.route).flatMap((node) => equipmentPorts(node).map((port) => ({ value: `${node.id}/${port.id}`, label: `${node.tag} / ${port.id}` })))
  const update = (next: PlantDesign, history = true, proposalUnitId?: string) => {
    currentDesign.current = next
    setEditVersion((version) => version + 1)
    if (history) { setPast((items) => [...items.slice(-29), design]); setFuture([]) }
    setDesign(next); setScene(preview(next)); setReview(null); setPlan(null)
    setConnectionWizard(null)
    setMessage("")
    setConnectionProposals(autoConnect && proposalUnitId ? proposePlantConnections(next, proposalUnitId) : null)
  }
  // AI の変更は確定操作まで下書きへ適用しない。確定時に基準が動いていないことを再確認する。
  const confirmPlan = () => {
    if (!plan) return
    if (busyRef.current || JSON.stringify(currentDesign.current) !== plan.basis) { setPlan(null); setMessage("編集中の設計が変更されたため、AI の変更は適用しませんでした。"); return }
    const next = plan.candidate
    update(next)
    if (!next.units.some((candidate) => candidate.id === selected)) { setSelected(next.units[0]?.id ?? ""); setSelectedNodeId(null); setSelectedPartId(undefined) }
    setMessage(`AI の変更を確定し、編集下書きへ適用しました。共有保存は未実行です。${plan.notes ? `\n${plan.notes}` : ""}`)
  }
  const work = async (operation: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setMessage("")
    try { await operation() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const refresh = async (id = designId) => {
    setRecords(await listPlantDesigns())
    if (id) { setRevisions(await listDesignRevisions(id)); setProposals(await listDesignProposals(id)) }
  }
  const load = async (id: string) => {
    const loaded = await listDesignRevisions(id)
    const latest = loaded[0] ?? null
    if (latest && await designHash(latest.json) !== latest.hash) throw new Error("保存済み設計のハッシュが一致しません。")
    const next = latest ? assertPlantDesign(latest.json) : structuredClone(DEFAULT_PLANT_DESIGN)
    update(next); setDesignId(id); setBase(latest); setRevisions(loaded); setSelected(next.units[0]?.id ?? ""); setPast([]); setFuture([])
    setProposals(await listDesignProposals(id))
  }
  const patchUnit = (patch: Partial<PlantUnit>) => update({ ...design, units: design.units.map((candidate) => candidate.id === selected ? { ...candidate, ...patch } : candidate) }, true, patch.position || patch.rotation !== undefined ? selected : undefined)
  const save = async () => {
    assertPlantDesign(JSON.stringify(design))
    const id = designId || await createPlantDesignRecord(design.name)
    setDesignId(id)
    const saved = await saveDesignRevision(sharedDesignStorage, id, design, base)
    setBase(saved); update(parsePlantDesign(saved.json)); setMessage(`Rev.${saved.revision} を共有保存しました。`)
    await refresh(id)
  }
  const addConnection = () => {
    const terminal = (value: string) => { const [unitId, nodeId, portId] = value.split("/"); return { unitId, nodeId, portId } }
    const next = { ...design, connections: [...design.connections, { id: `c-${crypto.randomUUID().slice(0, 8)}`, from: terminal(from), to: terminal(to), elevation: 4, lane: 0 }] }
    compilePlantDesign(next); update(next)
  }
  const sitePlanView = planViewBox([shown])
  return <div className="plant-designer">
    {designWizard && <PlantDesignWizard design={design} designId={designId} base={base} onShowProposals={async () => { await refresh(designId); setTab("shared"); setDesignWizard(false) }} onClose={() => setDesignWizard(false)} onApply={(next, notes) => {
      setDesignWizard(false)
      setPlan({ candidate: next, basis: JSON.stringify(currentDesign.current), notes })
    }} />}
    {plan && <PlantDesignComparison before={design} after={plan.candidate} notes={plan.notes} busy={busy} onConfirm={confirmPlan} onCancel={() => { setPlan(null); setMessage("AI の変更を取り消しました。編集下書きは変更していません。") }} />}
    {connectionWizard && <PlantConnectionDialog design={design} batch={connectionWizard} onClose={() => setConnectionWizard(null)} onConfirm={(next, batch) => {
      update(next, true, batch.unitId); setConnectionProposals(batch); setConnectionWizard(batch); setMessage("接続を確定しました。共有保存は未実行です。")
    }} />}
    {placement && <PlantPlacementDialog design={design} duplicate={placement.duplicate} onClose={() => setPlacement(null)} onConfirm={(next, unitId) => {
      update(next, true, unitId); setSelected(unitId); setSelectedNodeId(null); setSelectedPartId(undefined); setPlacement(null); setMessage("配置を追加しました。共有保存は未実行です。")
      const batch = proposePlantConnections(next, unitId)
      setConnectionProposals(batch); setConnectionWizard(batch)
    }} />}
    <header className="designer-heading"><div><h1><Box size={22} />プラント設計</h1><p>{design.name} / Rev.{base?.revision ?? design.revision} / {dirty ? "未保存の変更" : "共有保存済み"}</p></div>
      <div className="designer-actions">
        <Button variant="outline" disabled={busy || !!review} onClick={() => setDesignChat(true)}><Sparkles />AI と設計</Button>
        <Button size="icon" variant="outline" title="元に戻す" aria-label="元に戻す" disabled={busy || !past.length || !!review} onClick={() => { const previous = past.at(-1)!; setPast(past.slice(0, -1)); setFuture([design, ...future]); update(previous, false) }}><Undo2 /></Button>
        <Button size="icon" variant="outline" title="やり直す" aria-label="やり直す" disabled={busy || !future.length || !!review} onClick={() => { setPast([...past, design]); setFuture(future.slice(1)); update(future[0], false) }}><Redo2 /></Button>
        <Button variant="outline" disabled={busy} onClick={() => { setJson(JSON.stringify(design, null, 2)); setJsonOpen(true) }}><FileJson />JSON</Button>
        <Button size="icon" variant="outline" title="JSON を読み込む" aria-label="JSON を読み込む" disabled={busy} onClick={() => fileRef.current?.click()}><FolderOpen /></Button>
        <input type="file" accept=".json" ref={fileRef} hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void work(async () => { if (file.size > 500000) throw new Error("500 KB 以下にしてください。"); setJson(await file.text()); setJsonOpen(true) }) }} />
        <Button size="icon" variant="outline" title="JSON を出力" aria-label="JSON を出力" onClick={() => download(`${design.id}-${Date.now()}.json`, design)}><Download /></Button>
        <Button data-tour="designer-save" disabled={busy || !!review || scene.issues.length > 0} onClick={() => void work(save)}><Save />共有保存</Button>
      </div>
    </header>
    {message && <p role="status" className="designer-message">{message}</p>}
    <div data-tour="designer-tabs" className="designer-tabs" role="tablist" aria-label="設計ビュー">{[["layout", "配置"], ["connections", "接続"], ["shared", "共有・提案"]].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    <div className="designer-workspace">
      <aside className="designer-controls"><fieldset disabled={busy || !!review}>
        {tab === "layout" && <>
          <label>設計名<input value={design.name} maxLength={200} onChange={(event) => update({ ...design, name: event.target.value })} /></label>
          <Button data-tour="designer-place" variant="outline" disabled={design.units.length >= 30} onClick={() => setPlacement({})}><Plus />オブジェクトを配置</Button>
          <label data-tour="designer-auto-connect" className="designer-auto-connect"><input type="checkbox" checked={autoConnect} onChange={(event) => { setAutoConnect(event.target.checked); setConnectionProposals(event.target.checked && selected ? proposePlantConnections(design, selected) : null) }} />配置時に接続を提案</label>
          <label>配置ユニット<select value={selected} onChange={(event) => { setSelected(event.target.value); setSelectedNodeId(null); setSelectedPartId(undefined) }}><option value="">未選択</option>{design.units.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
          {unit && <><label>ユニット名<input value={unit.name} maxLength={200} onChange={(event) => patchUnit({ name: event.target.value })} /></label>
            <div className="designer-coordinates">{[0, 2].map((axis) => <label key={axis}>{axis === 0 ? "X" : "Z"} (m)<input type="number" step="0.5" min="-1000" max="1000" value={unit.position[axis]} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) { const position: PlantUnit["position"] = [...unit.position]; position[axis] = value; patchUnit({ position }) } }} /></label>)}</div>
            <label>回転<select value={unit.rotation} onChange={(event) => patchUnit({ rotation: Number(event.target.value) as PlantUnit["rotation"] })}>{[0, 90, 180, 270].map((rotation) => <option key={rotation} value={rotation}>{rotation}°</option>)}</select></label>
            <div className="designer-actions"><Button variant="outline" title="ユニットを複製" aria-label="ユニットを複製" size="icon" disabled={design.units.length >= 30} onClick={() => setPlacement({ duplicate: unit })}><Copy /></Button><Button variant="outline" title="ユニットと接続を削除" aria-label="ユニットと接続を削除" size="icon" disabled={design.units.length <= 1} onClick={() => { update(removeUnit(design, unit.id)); setSelected("") }}><Trash2 /></Button></div>
          </>}
          <label>ユニット間余白 (m)<input type="number" min="0" max="10" step="0.5" value={design.site.clearance} onChange={(event) => { const clearance = event.target.valueAsNumber; if (Number.isFinite(clearance)) update({ ...design, site: { ...design.site, clearance } }) }} /></label>
          <Button variant="outline" onClick={() => { setJson(JSON.stringify(design, null, 2)); setJsonOpen(true) }}><FileJson />敷地・モジュール定義</Button>
        </>}
        {tab === "connections" && <><h2>ユニット間接続</h2>{[[from, setFrom, "接続元"], [to, setTo, "接続先"]].map(([value, setter, label], index) => <label key={index}>{label as string}<select value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)}><option value="">選択</option>{terminals.map((terminal) => <option key={terminal.value} value={terminal.value}>{terminal.label}</option>)}</select></label>)}
          <Button variant="outline" disabled={!from || !to || from === to || design.connections.length >= 100} onClick={() => void work(async () => addConnection())}><Cable />接続を追加</Button>
          {design.connections.map((connection) => <div className="designer-connection" key={connection.id}><strong>{connection.id}</strong><span>{connection.from.unitId}:{connection.from.portId} → {connection.to.unitId}:{connection.to.portId}</span><div className="designer-coordinates">{(["elevation", "lane"] as const).map((property) => <label key={property}>{property === "elevation" ? "高さ (m)" : "経路 Z (m)"}<input type="number" step="0.5" value={connection[property]} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) update({ ...design, connections: design.connections.map((item) => item.id === connection.id ? { ...item, [property]: event.target.valueAsNumber } : item) }) }} /></label>)}</div><Button variant="ghost" size="icon" title="接続を削除" aria-label={`${connection.id} を削除`} onClick={() => update({ ...design, connections: design.connections.filter((item) => item.id !== connection.id) })}><Trash2 /></Button></div>)}
        </>}
      </fieldset>
      {tab === "shared" && <div className="designer-shared"><Button variant="outline" disabled={busy} onClick={() => void work(() => refresh())}><RefreshCw />台帳を更新</Button>
        <label>共有設計<select disabled={busy} value={designId} onChange={(event) => { if (event.target.value) setLoadTarget(event.target.value) }}><option value="">選択</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
        {designId && <Button variant="outline" disabled={busy} onClick={() => setLoadTarget(designId)}><RefreshCw />最新改訂を読み込む</Button>}
        <Button variant="outline" disabled={busy} onClick={() => { setDesignId(""); setBase(null); setRevisions([]); setProposals([]); setReview(null); update({ ...design, id: `design-${crypto.randomUUID().slice(0, 8)}`, revision: 1 }); setMessage("新しい設計として保存できます。") }}><Copy />別の設計として保存</Button>
        {designId && <p className="text-xs break-all">設計 ID: {designId}</p>}
        <h2>改訂履歴</h2>{revisions.map((revision) => <div className="designer-record" key={revision.id}><span>Rev.{revision.revision}</span><Button variant="ghost" size="icon" title="改訂 JSON を出力" aria-label={`Rev.${revision.revision} を出力`} onClick={() => { try { download(`revision-${revision.revision}.json`, JSON.parse(revision.json)) } catch { setMessage("JSON が不正です。") } }}><Download /></Button></div>)}
        <h2>提案</h2>{proposals.map((proposal) => { const accepted = revisions.some((revision) => revision.proposalId === proposal.id); return <div className="designer-record" key={proposal.id}><p>{proposal.reason || "理由未記入"}</p><span>基準 Rev.{proposal.baseRevision} / {accepted ? "採用済み" : proposal.rejected ? "却下" : "未審査"}</span><Button variant="outline" disabled={busy || accepted || proposal.rejected || dirty} onClick={() => void work(async () => { const candidate = assertPlantDesign(proposal.json); setReview({ proposal, candidate }); setMessage("") })}>差分を確認</Button></div> })}
        {!proposals.length && <p>提案はありません。</p>}
      </div>}
      </aside>
      <main className="designer-canvas-area">
        {currentScene.nodes.length > 0 && <PlantViewer nodes={currentScene.nodes} site={shown.site} selectedId={selectedNode?.id ?? null} selectedPart={selectedPartId} onSelect={(id, partId) => { setSelectedNodeId(id); setSelectedPartId(partId); setSelected(id?.split("/")[0] ?? "") }} heat={noHeat} heatEnabled={false} imported={null} modelCode={`${review ? "提案" : "編集中"} / Rev.${shown.revision}`} focusRequest={0} />}
        <PlantSitePlan design={shown} view={sitePlanView} label="敷地とユニット配置図" selectedUnitId={selected} onSelectUnit={setSelected} />
      </main>
      <aside className="designer-validation">
        {designChat && <PlantDesignChat design={design} editVersion={editVersion} selection={designChatSelection(shown, selected, selectedNode?.id ?? null)} blocked={busy || !!review || !!plan} onClose={() => setDesignChat(false)} onManual={() => setDesignWizard(true)} onApply={(next, basis) => {
          if (busyRef.current || JSON.stringify(currentDesign.current) !== basis) throw new Error("編集中の設計が変更されたため、AI の結果は反映しません。")
          setPlan({ candidate: next, basis, notes: "" })
          setMessage("AI の配置案を作成しました。変更前後を比較して確定してください。")
        }} />}
        {!review && <section className="designer-connection-proposals" aria-label="接続候補">
          <div className="designer-proposal-heading"><h2><Cable size={15} />接続候補</h2><Button variant="ghost" size="icon" disabled={busy || !selected} title="選択ユニットの接続候補を更新" aria-label="接続候補を更新" onClick={() => setConnectionProposals(proposePlantConnections(design, selected))}><RefreshCw size={14} /></Button></div>
          {connectionProposals ? <>
            <p className="text-muted-foreground">{design.units.find((candidate) => candidate.id === connectionProposals.unitId)?.name} / {connectionProposals.proposals.length} 件</p>
            {connectionProposals.reason && <p role="status">{connectionProposals.reason}</p>}
            {connectionProposals.proposals.map((proposal) => <div className="designer-connection-candidate" key={proposal.key}>
              <div className="designer-proposal-heading"><strong>{proposal.medium === "power" ? "電源" : "配管"}</strong><span>端点間 {proposal.distance.toFixed(1)} m</span></div>
              <p>{proposal.fromLabel}<br />→ {proposal.toLabel}</p>
              <div className="designer-actions"><Button variant="outline" disabled={busy} aria-label={`${proposal.fromLabel} から ${proposal.toLabel} の接続を採用`} onClick={() => void work(async () => { const next = acceptPlantConnection(design, connectionProposals, proposal.key); update(next, true, connectionProposals.unitId); setMessage("接続を追加しました。共有保存は未実行です。") })}><Check size={14} />採用</Button><Button variant="ghost" size="icon" disabled={busy} title="この候補を除外" aria-label={`${proposal.fromLabel} から ${proposal.toLabel} の候補を除外`} onClick={() => setConnectionProposals({ ...connectionProposals, proposals: connectionProposals.proposals.filter((candidate) => candidate.key !== proposal.key) })}><X size={14} /></Button></div>
            </div>)}
          </> : <p className="text-muted-foreground">候補未選択</p>}
        </section>}
        <h2>設計チェック</h2><p className={currentScene.issues.length ? "text-destructive" : "text-primary"}>{currentScene.issues.length ? `${currentScene.issues.length} 件の要確認` : "形状・配置・接続: 適合"}</p>{currentScene.issues.map((issue, index) => <p className="designer-issue" key={index}>{issue.message}</p>)}<p className="text-xs text-muted-foreground">概念設計 / 法規・耐震・防爆・流体解析・3D 干渉は未評価</p>
        {review && <section><h2>提案レビュー</h2><p>{review.proposal.reason}</p><ul>{designDiff(design, review.candidate).map((change, index) => <li key={index}>{change}</li>)}</ul><div className="designer-actions"><Button disabled={busy || currentScene.issues.length > 0} onClick={() => void work(async () => { const fresh = (await listDesignProposals(designId)).find((proposal) => proposal.id === review.proposal.id); if (!fresh) throw new Error("提案が見つかりません。"); const saved = await saveDesignRevision(sharedDesignStorage, designId, review.candidate, base, fresh); setBase(saved); update(parsePlantDesign(saved.json)); await refresh(); setMessage(`提案を採用し Rev.${saved.revision} として保存しました。`) })}><Check />採用</Button><Button variant="outline" disabled={busy} onClick={() => void work(async () => { await rejectDesignProposal(review.proposal); setReview(null); await refresh() })}><X />却下</Button><Button variant="ghost" onClick={() => setReview(null)}>閉じる</Button></div></section>}
      </aside>
    </div>
    <Dialog open={jsonOpen} onOpenChange={setJsonOpen}><DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>設計 JSON</DialogTitle><DialogDescription>schemaVersion 1 / 単位 m / 編集中の設計へ反映</DialogDescription></DialogHeader><textarea className="designer-json" aria-label="設計 JSON" spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} /><Button disabled={busy} onClick={() => void work(async () => { const next = parsePlantDesign(json); update(next); setSelected(next.units[0]?.id ?? ""); setJsonOpen(false) })}><Check />編集へ反映</Button>{message && <p role="alert" className="whitespace-pre-wrap text-destructive">{message}</p>}</DialogContent></Dialog>
    <Dialog open={!!loadTarget} onOpenChange={(open) => { if (!open) setLoadTarget("") }}><DialogContent><DialogHeader><DialogTitle>共有設計を読み込む</DialogTitle><DialogDescription>現在の未保存の編集は置き換えられます。必要な場合は先に JSON を出力してください。</DialogDescription></DialogHeader><Button disabled={busy} onClick={() => void work(async () => { await load(loadTarget); setLoadTarget("") })}><FolderOpen />読み込む</Button><Button variant="outline" disabled={busy} onClick={() => setLoadTarget("")}>キャンセル</Button>{message && <p role="alert">{message}</p>}</DialogContent></Dialog>
  </div>
}
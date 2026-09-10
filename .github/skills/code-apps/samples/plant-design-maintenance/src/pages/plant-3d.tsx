import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Box, ChevronRight, Download, FileText, Focus, Layers, RotateCcw, Search, Upload, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PlantViewer } from "@/components/plant-viewer"
import { PlantMaintenancePanel } from "@/components/plant-maintenance-panel"
import { PlantRelatedRecords } from "@/components/plant-related-records"
import { usePlantAgentDock } from "@/hooks/use-plant-agent-dock"
import { PLANT_SAMPLES, plantParts } from "@/data/plant-catalog"
import { HEAT_BANDS, heatColor, plantHeat } from "@/data/plant-maintenance"
import { loadPlantGlb, type ImportedPlant } from "@/lib/plant-glb"
import { disposePlantObject } from "@/lib/plant-scene"
import { renderPlantNodeThumbnail } from "@/lib/plant-thumbnail"
import type { PlantAgentActivity } from "@/lib/plant-agent-quick-replies"
import { KIND_LABELS, PLANT_MODEL_ID, documentsForNode, searchPlantNodes, type PLANT_DOCUMENTS } from "@/data/plant-model"
import "./plant-3d.css"

type SampleDocument = typeof PLANT_DOCUMENTS[number]

export default function Plant3dPage() {
  const [params, setParams] = useSearchParams()
  const [imported, setImported] = useState<ImportedPlant | null>(null)
  const [importError, setImportError] = useState("")
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const sample = PLANT_SAMPLES.find((candidate) => candidate.id === params.get("plant")) ?? PLANT_SAMPLES[0]
  const modelId = imported?.id ?? sample.id
  const nodes = imported?.nodes ?? sample.nodes
  const [heatEnabled, setHeatEnabled] = useState(true)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [unresolvedOnly, setUnresolvedOnly] = useState(false)
  const invalidDates = !!from && !!to && from > to
  const heat = plantHeat(modelId, { from, to, unresolvedOnly })
  const areas = [...new Set(nodes.map((node) => node.area))]
  const requestedId = params.get("node")
  const selected = nodes.find((node) => node.id === requestedId) ?? null
  const selectedPart = selected ? plantParts(selected).find((part) => part.id === params.get("part"))?.id : undefined
  const selectedHeat = heat.find((entry) => entry.nodeId === selected?.id)
  const [query, setQuery] = useState("")
  const [area, setArea] = useState("all")
  const [kind, setKind] = useState("all")
  const [focusRequest, setFocusRequest] = useState(0)
  const [mobilePanel, setMobilePanel] = useState<"nodes" | "details">("nodes")
  const [document, setDocument] = useState<SampleDocument | null>(null)
  const [activity, setActivity] = useState<{ scope: string; group: PlantAgentActivity } | null>(null)
  const activityScope = JSON.stringify([modelId, selected?.id ?? null, selectedPart ?? null])
  const activate = (group: PlantAgentActivity) => setActivity({ scope: activityScope, group })
  const deferredQuery = useDeferredValue(query)
  const results = searchPlantNodes(deferredQuery, area, kind, nodes)
  const documents = selected && !imported && sample.id === PLANT_MODEL_ID ? documentsForNode(selected.id) : []
  const previewImage = useMemo(() => selected && !imported ? renderPlantNodeThumbnail(selected) ?? undefined : undefined, [selected, imported])
  usePlantAgentDock({
    unavailableReason: imported ? "ローカルモデルの改訂は未登録です。" : invalidDates ? "期間の開始日と終了日を確認してください。" : undefined,
    previewImage,
    activity: activity?.scope === activityScope ? activity.group : undefined,
    selection: { modelId, modelRevision: imported ? undefined : 1, nodeId: selected?.id ?? null, partId: selectedPart, label: selected ? `${selected.tag} ${selected.name}` : `${imported?.name ?? sample.name} / 図面全体` },
  })
  useEffect(() => () => { if (imported) disposePlantObject(imported.root) }, [imported])
  useEffect(() => () => { requestRef.current++ }, [])
  const choose = (id: string | null, focus = false, partId?: string) => {
    setActivity(null)
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (id) next.set("node", id)
      else next.delete("node")
      if (partId) next.set("part", partId)
      else next.delete("part")
      return next
    }, { replace: true })
    setDocument(null)
    if (id) setMobilePanel("details")
    if (focus) setFocusRequest((value) => value + 1)
  }

  const openFile = async (file: File) => {
    const request = ++requestRef.current
    setLoading(true)
    setImportError("")
    try {
      const model = await loadPlantGlb(file)
      if (request !== requestRef.current) { disposePlantObject(model.root); return }
      choose(null)
      setQuery(""); setArea("all"); setKind("all")
      setImported(model)
    } catch (error) {
      if (request === requestRef.current) setImportError(error instanceof Error ? `読み込み失敗: ${error.message}` : "GLB を読み込めませんでした。")
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }

  return (
    <div className="plant-page">
      <header className="plant-heading">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Box size={22} className="text-primary" /><h1 className="text-2xl font-bold">プラント 3D</h1><Badge variant="secondary">{imported ? "ローカル GLB" : "サンプル"}</Badge></div><p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{imported?.name ?? sample.name}</p></div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".glb" className="hidden" aria-label="GLB ファイル" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void openFile(file) }} />
          <Button variant="outline" disabled={loading} onClick={() => fileRef.current?.click()}><Upload />{loading ? "読み込み中..." : "GLB を開く"}</Button>
          {imported && <Button variant="outline" title="サンプルモデルに戻る" aria-label="サンプルモデルに戻る" size="icon" onClick={() => { requestRef.current++; setLoading(false); choose(null); setImported(null); setQuery(""); setArea("all"); setKind("all"); setImportError("") }}><RotateCcw /></Button>}
          <Button variant="outline" size="icon" asChild><a href={`${import.meta.env.BASE_URL}models/${sample.id === PLANT_MODEL_ID ? "process-plant-demo" : sample.id}.glb`} download title={`${sample.code} の GLB をダウンロード`} aria-label={`${sample.code} の GLB をダウンロード`}><Download /></a></Button>
          <Button variant="outline" asChild><Link to="/drawings"><Layers />図面索引</Link></Button>
        </div>
      </header>
      <section className="plant-model-gallery" aria-label="3D 図面ギャラリー">
        <div className="plant-gallery-heading"><div><h2>3D 図面</h2><p>管理対象のモデルを選択</p></div><span>{PLANT_SAMPLES.length} 件</span></div>
        <div className="plant-gallery-list">
          {PLANT_SAMPLES.map((plant, index) => {
            const active = !imported && plant.id === sample.id
            const kinds = new Set(plant.nodes.filter((node) => !node.route).map((node) => node.kind)).size
            return <button key={plant.id} type="button" aria-pressed={active} onClick={() => {
              setImported(null); setQuery(""); setArea("all"); setKind("all"); setDocument(null); setFocusRequest(0)
              setParams({ plant: plant.id }, { replace: true })
            }}>
              <span className={`plant-gallery-visual plant-gallery-visual-${index + 1}`} aria-hidden="true"><Box /><i /><i /><i /></span>
              <span className="plant-gallery-copy"><strong>{plant.name.split(" / ")[0]}</strong><span>{plant.code} · 設備 {plant.nodes.filter((node) => !node.route).length} · 種別 {kinds}</span></span>
              {active && <span className="plant-gallery-current">表示中</span>}
            </button>
          })}
        </div>
      </section>
      <div className="plant-heat-toolbar">
        <label className="plant-toggle"><input type="checkbox" checked={heatEnabled && !imported} disabled={!!imported} onChange={(event) => { setHeatEnabled(event.target.checked); activate(event.target.checked ? "failures" : "overview") }} />故障ヒートマップ</label>
        <label>開始日<input aria-label="故障集計の開始日" type="date" value={from} onChange={(event) => { setFrom(event.target.value); activate("failures") }} /></label>
        <label>終了日<input aria-label="故障集計の終了日" type="date" value={to} onChange={(event) => { setTo(event.target.value); activate("failures") }} /></label>
        <label className="plant-toggle"><input type="checkbox" checked={unresolvedOnly} onChange={(event) => { setUnresolvedOnly(event.target.checked); activate("failures") }} />未解決のみ</label>
      </div>
      {invalidDates && <p role="alert" className="text-sm text-destructive py-2">終了日は開始日以降を指定してください。</p>}
      {!imported && <div className="plant-heat-legend" aria-label="故障件数の凡例">
        {HEAT_BANDS.map((band) => <span key={band.minimum}><i style={{ backgroundColor: band.color }} />{band.label}</span>)}
        <span>対象故障 {heat.reduce((sum, entry) => sum + entry.total, 0)} 件 / {from || "全期間"}{to ? ` ～ ${to}` : ""}</span>
        <span>色: 設備の件数 / 局所表示: 部位の件数（模式位置）</span>
      </div>}
      {importError && <p role="alert" className="mb-3 text-sm text-destructive [overflow-wrap:anywhere]">{importError}</p>}
      <div className="plant-workspace">
        <PlantViewer key={modelId} selectedId={selected?.id ?? null} selectedPart={selectedPart} onSelect={(id, partId) => choose(id, false, partId)} focusRequest={focusRequest} nodes={nodes} imported={imported} heat={heat} heatEnabled={heatEnabled && !invalidDates && !imported} modelCode={sample.code} />
        <div className="plant-mobile-tabs" role="group" aria-label="サイドパネル">
          <button type="button" aria-pressed={mobilePanel === "nodes"} onClick={() => setMobilePanel("nodes")}>設備一覧</button>
          <button type="button" aria-pressed={mobilePanel === "details"} onClick={() => setMobilePanel("details")}>設備詳細{selected ? ` · ${selected.tag}` : ""}</button>
        </div>
        <aside className={`plant-node-panel ${mobilePanel === "nodes" ? "is-active" : ""}`} aria-label="設備一覧" data-tour="plant-search">
          <h2 className="plant-panel-title">設備一覧 <span className="text-muted-foreground font-normal text-xs" aria-live="polite">{results.length} / {nodes.length}</span></h2>
          <div className="plant-search-fields">
            <div className="plant-search-input"><Search size={16} aria-hidden="true" /><input aria-label="ノード検索" placeholder="タグ・名称・属性" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" title="検索をクリア" aria-label="検索をクリア" onClick={() => setQuery("")}><X size={14} /></button>}</div>
            <label><span>エリア</span><select value={area} onChange={(event) => setArea(event.target.value)}><option value="all">すべてのエリア</option>{areas.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>設備種別</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">すべての設備</option>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <nav className="plant-node-list" aria-label="設備階層" aria-busy={query !== deferredQuery}>
            {areas.map((areaName) => {
              const nodes = results.filter((node) => node.area === areaName)
              if (!nodes.length) return null
              return <details key={areaName} open><summary>{areaName}<span>{nodes.length}</span></summary><ul>{nodes.map((node) => <li key={node.id}>
                <button type="button" className="plant-node" aria-current={selected?.id === node.id ? "true" : undefined} onClick={() => choose(node.id, true)}>
                  <span className={`plant-kind-marker plant-kind-${node.kind}`} style={heatEnabled && !invalidDates && !imported ? { backgroundColor: heatColor(heat.find((entry) => entry.nodeId === node.id)?.total ?? 0) } : undefined} aria-hidden="true" /><span className="min-w-0"><strong>{node.tag}</strong><span>{node.name}</span></span>{!imported && <span className="text-xs whitespace-nowrap">{heat.find((entry) => entry.nodeId === node.id)?.total ?? 0} 件</span>}<ChevronRight size={14} aria-hidden="true" />
                </button>
              </li>)}</ul></details>
            })}
            {results.length === 0 && <div className="plant-empty"><Search /><p>該当する設備がありません</p><Button variant="outline" onClick={() => { setQuery(""); setArea("all"); setKind("all") }}>条件をクリア</Button></div>}
          </nav>
        </aside>
        <aside className={`plant-detail-panel ${mobilePanel === "details" ? "is-active" : ""}`} aria-label="設備詳細" data-tour="plant-details">
          <h2 className="plant-panel-title">設備詳細{selected && <Button variant="ghost" size="icon" aria-label="選択解除" title="選択解除" onClick={() => choose(null)}><X /></Button>}</h2>
          {selected ? <div className="plant-detail-content" key={selected.id}>
            <div className="plant-equipment-heading"><Badge variant="outline">{KIND_LABELS[selected.kind]}</Badge><h3>{selected.tag}</h3><p>{selected.name}</p><span className="text-xs text-muted-foreground">{selected.area}</span></div>
            <Button variant="outline" className="w-full" onClick={() => setFocusRequest((value) => value + 1)}><Focus />設備にフォーカス</Button>
            {!imported && <section><h4 className="plant-section-title">故障箇所 <span>{selectedHeat?.total ?? 0} 件</span></h4>
              <div className="space-y-1"><button type="button" className="text-xs text-primary underline" onClick={() => choose(selected.id)}>設備全体の履歴</button>{plantParts(selected).map((part) => <button key={part.id} type="button" aria-pressed={part.id === selectedPart} className="plant-part-row" onClick={() => { setHeatEnabled(true); choose(selected.id, true, part.id) }}><span className="plant-kind-marker" style={{ backgroundColor: heatColor(selectedHeat?.parts[part.id] ?? 0) }} /><span>{part.name}</span><span>{selectedHeat?.parts[part.id] ?? 0} 件</span><Focus size={14} /></button>)}</div>
            </section>}
            <PlantMaintenancePanel modelId={modelId} nodeId={selected.id} partId={selectedPart} onActivity={activate} onPart={(partId) => { setHeatEnabled(true); choose(selected.id, true, partId) }} />
            {!imported && <PlantRelatedRecords key={`${modelId}:${selected.id}`} modelId={modelId} node={selected} onActivity={activate} onPart={(partId) => { setHeatEnabled(true); choose(selected.id, true, partId) }} />}
            <section><h4 className="plant-section-title">属性</h4><dl className="plant-properties">{Object.entries(selected.properties).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}<div><dt>ノード ID</dt><dd className="font-mono">{selected.id}</dd></div><div><dt>モデル改訂</dt><dd>{imported ? "未登録" : "Rev.1"}</dd></div></dl></section>
            <section><h4 className="plant-section-title">関連資料 <span>{documents.length}</span></h4><div className="plant-document-list">{documents.map((item) => <button key={item.id} type="button" onClick={() => { setDocument(item); activate("drawings") }}><FileText size={18} aria-hidden="true" /><span className="min-w-0"><strong>{item.title}</strong><span>{item.number} / {item.revision}</span></span><ChevronRight size={14} aria-hidden="true" /></button>)}</div></section>
            {imported ? <p className="plant-sample-note">ローカル表示・未保存。関連資料は未登録です。</p> : <p className="plant-sample-note">架空設備・サンプル資料。実設備の設計・運転判断には使用できません。</p>}
          </div> : <div className="plant-empty"><Box size={28} /><p>{requestedId ? "指定されたノードが見つかりません" : "設備が選択されていません"}</p>{requestedId && <Button variant="outline" onClick={() => choose(null)}>選択をクリア</Button>}</div>}
        </aside>
      </div>
      <Dialog open={!!document} onOpenChange={(open) => { if (!open) setDocument(null) }}>
        {document && <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto [overflow-wrap:anywhere]">
          <DialogHeader><DialogTitle className="pr-6 leading-snug">{document.title}</DialogTitle><DialogDescription>{document.number} / {document.revision} · {selected?.tag} · サンプル</DialogDescription></DialogHeader>
          <article className="space-y-6 py-2">{document.sections.map((section) => <section key={section.heading}><h3 className="mb-2 font-semibold">{section.heading}</h3><p className="text-sm leading-7 text-muted-foreground">{section.body}</p></section>)}</article>
          <p className="text-xs text-muted-foreground border-t pt-3">モデル: {PLANT_MODEL_ID} / 本番の資料台帳とは別のサンプルです。</p>
        </DialogContent>}
      </Dialog>
    </div>
  )
}
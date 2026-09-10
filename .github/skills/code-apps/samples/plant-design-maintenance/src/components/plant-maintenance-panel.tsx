import { useEffect, useRef, useState } from "react"
import { AlertTriangle, LoaderCircle, RefreshCw, Sparkles, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getPlantMaintenance, maintenanceCounts, type MaintenanceSummary } from "@/data/plant-maintenance"
import { maintenanceAiConfigured, summarizePlantMaintenance } from "@/lib/plant-maintenance-ai"

type Props = { modelId: string; nodeId: string; partId?: string; onPart?: (partId?: string) => void; onActivity?: (activity: "failures" | "maintenance" | "evidence") => void }

export function PlantMaintenancePanel({ modelId, nodeId, partId, onPart, onActivity }: Props) {
  return <MaintenanceContent key={`${modelId}:${nodeId}:${partId ?? "all"}`} modelId={modelId} nodeId={nodeId} partId={partId} onPart={onPart} onActivity={onActivity} />
}

function MaintenanceContent({ modelId, nodeId, partId, onPart, onActivity }: Props) {
  const history = getPlantMaintenance(modelId, nodeId, partId)
  const counts = maintenanceCounts(history)
  const [tab, setTab] = useState("overview")
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null)
  const [generatedAt, setGeneratedAt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [targetId, setTargetId] = useState<string | null>(null)
  const requestRef = useRef(0)
  const busyRef = useRef(false)
  const rootRef = useRef<HTMLElement>(null)
  const configured = maintenanceAiConfigured()

  useEffect(() => () => { requestRef.current++ }, [])
  useEffect(() => {
    if (!targetId) return
    const target = rootRef.current?.querySelector<HTMLElement>(`[data-record-id="${targetId}"]`)
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    target?.focus({ preventScroll: true })
  }, [targetId, tab])

  const openSource = (id: string) => {
    const failure = history.failures.some((record) => record.id === id)
    setTab(failure ? "failures" : "repairs")
    onActivity?.(failure ? "failures" : "maintenance")
    setTargetId(id)
  }
  const generate = async () => {
    if (busyRef.current) return
    onActivity?.("evidence")
    busyRef.current = true
    const request = ++requestRef.current
    setLoading(true)
    setError("")
    setSummary(null)
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        summarizePlantMaintenance(history),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("AI 要約がタイムアウトしました。時間をおいて再試行してください。")), 60000) }),
      ])
      if (request !== requestRef.current) return
      setSummary(result)
      setGeneratedAt(new Date().toLocaleString("ja-JP"))
    } catch (reason) {
      if (request === requestRef.current) setError(reason instanceof Error ? reason.message : "AI 要約に失敗しました。")
    } finally {
      clearTimeout(timeout)
      if (request === requestRef.current) { busyRef.current = false; setLoading(false) }
    }
  }

  const sources = (ids: string[]) => <div className="flex min-w-0 flex-wrap gap-1 mt-2">{ids.map((id) => <button key={id} type="button" className="text-xs underline underline-offset-2 text-primary" onClick={() => openSource(id)}>{id}</button>)}</div>

  return (
    <section ref={rootRef} className="plant-maintenance" aria-label="故障・修理履歴">
      <h4 className="plant-section-title"><Wrench size={14} />保全履歴<Badge variant="outline">{history.source === "sample" ? "サンプル" : "未連携"}</Badge></h4>
      <p className="text-xs text-muted-foreground mb-2">{partId ? history.failures[0]?.location ?? "選択部位" : "設備全体"} / 全期間の履歴</p>
      {history.source === "unmapped" ? <p className="text-xs text-muted-foreground leading-6">このモデルの設備と故障管理システムは未連携です。履歴は取得していません。</p> : <>
        <Tabs value={tab} onValueChange={(value) => { setTab(value); setTargetId(null); onActivity?.(value === "failures" ? "failures" : value === "repairs" ? "maintenance" : "evidence") }}>
          <TabsList className="w-full"><TabsTrigger value="overview">概要</TabsTrigger><TabsTrigger value="failures">故障 {counts.failures}</TabsTrigger><TabsTrigger value="repairs">修理 {history.repairs.length}</TabsTrigger></TabsList>
          <TabsContent value="overview" className="space-y-4 pt-2">
            <dl className="plant-properties"><div><dt>故障件数</dt><dd>{counts.failures} 件</dd></div><div><dt>未解決</dt><dd>{counts.unresolved} 件</dd></div><div><dt>修理完了</dt><dd>{counts.completed} 件</dd></div><div><dt>修理・点検予定</dt><dd>{counts.planned} 件</dd></div></dl>
            <div className="border-t pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} />AI 要約</h5><Button size="sm" variant="outline" onClick={() => void generate()} disabled={!configured || loading || !counts.failures}>{loading ? <LoaderCircle className="animate-spin" /> : summary ? <RefreshCw /> : <Sparkles />}{loading ? "生成中" : summary ? "再生成" : "生成"}</Button></div>
              {!counts.failures ? <p className="text-xs text-muted-foreground">登録された故障履歴はありません。</p> : !configured ? <p className="text-xs text-muted-foreground" role="status">AI 要約は未接続です。</p> : !summary && !loading && !error ? <p className="text-xs text-muted-foreground">未生成</p> : null}
              {loading && <p role="status" className="text-xs text-muted-foreground">履歴の要約を生成中...</p>}
              {error && <p role="alert" className="text-xs text-destructive leading-6">{error}</p>}
              {summary && <div className="space-y-4 text-xs leading-6" aria-live="polite">
                <p>{summary.overview}</p>
                <section><h6 className="font-semibold mb-2">故障傾向・対応</h6><ul className="space-y-3">{summary.findings.map((item, index) => <li key={index}>{item.text}{sources(item.sourceIds)}</li>)}</ul></section>
                <section><h6 className="font-semibold mb-2">未解決事項</h6>{summary.unresolved.length ? <ul className="space-y-3">{summary.unresolved.map((item, index) => <li key={index}>{item.text}{sources(item.sourceIds)}</li>)}</ul> : <p>要約上の指摘なし。原記録を確認してください。</p>}</section>
                <p className="text-muted-foreground">生成日時: {generatedAt}</p>
                <p className="text-muted-foreground">AI 生成・未レビュー。出典を確認し、設備の安全性や運転可否の判断には使用しないでください。</p>
              </div>}
            </div>
          </TabsContent>
          <TabsContent value="failures">
            {!history.failures.length && <p className="py-4 text-xs text-muted-foreground">登録された故障履歴はありません。</p>}
            {history.failures.map((record) => <article key={record.id} data-record-id={record.id} tabIndex={-1} className="border-b py-4 space-y-2 outline-offset-2 focus:outline-2 focus:outline-ring">
              <div className="flex flex-wrap items-center gap-2 text-xs"><time dateTime={record.occurredOn}>{record.occurredOn}</time><Badge variant={record.status === "resolved" ? "secondary" : "outline"}>{record.status === "resolved" ? "解決済み" : record.status === "investigating" ? "調査中" : "未対応"}</Badge></div>
              <h5 className="flex items-start gap-2 text-sm font-medium"><AlertTriangle size={14} className="shrink-0 mt-1" />{record.title}</h5>
              <p className="text-xs text-muted-foreground">箇所: {record.location}</p><p className="text-xs leading-6">{record.symptom}</p>
              {record.partId && onPart && <button type="button" className="text-xs text-primary underline" onClick={() => onPart(record.partId)}>3D で故障箇所を確認</button>}
              <p className="text-xs leading-6"><span className="text-muted-foreground">原因: </span>{record.cause ?? "未確定"}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{record.id}</p>
              {history.repairs.filter((repair) => repair.failureId === record.id).map((repair) => <button key={repair.id} type="button" className="block text-xs text-primary underline" onClick={() => openSource(repair.id)}>修理記録 {repair.id}</button>)}
            </article>)}
          </TabsContent>
          <TabsContent value="repairs">
            {!history.repairs.length && <p className="py-4 text-xs text-muted-foreground">登録された修理履歴はありません。</p>}
            {history.repairs.map((record) => <article key={record.id} data-record-id={record.id} tabIndex={-1} className="border-b py-4 space-y-2 outline-offset-2 focus:outline-2 focus:outline-ring">
              <div className="flex flex-wrap items-center gap-2 text-xs"><time dateTime={record.performedOn}>{record.performedOn}</time><Badge variant={record.status === "completed" ? "secondary" : "outline"}>{record.status === "completed" ? "完了" : "予定・未実施"}</Badge></div>
              <p className="text-xs leading-6">{record.action}</p><p className="text-xs leading-6"><span className="text-muted-foreground">結果: </span>{record.result}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{record.id}</p><button type="button" className="text-xs text-primary underline" onClick={() => openSource(record.failureId)}>故障記録 {record.failureId}</button>
            </article>)}
          </TabsContent>
        </Tabs>
      </>}
    </section>
  )
}
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import { BookOpen, ChevronLeft, Loader2, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConstructionService } from "@/services/construction-service"
import { predictKyRisks, type KyPredictionStage, type PredictionResult } from "@/services/ky-prediction"
import { useProject } from "@/state/project-state"
import { ProjectPicker, SelectProjectNotice } from "@/components/project-picker"

const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"

export default function KyNew() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { selectedProjectId } = useProject()
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const workTypes = useQuery({ queryKey: ["workTypes"], queryFn: ConstructionService.workTypes })
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const [taskId, setTaskId] = useState("")
  const [detail, setDetail] = useState("")
  const [weather, setWeather] = useState("100000001")
  const [equipment, setEquipment] = useState("")
  const [hazards, setHazards] = useState("")
  const [countermeasures, setCountermeasures] = useState("")
  const [risk, setRisk] = useState("100000001")
  const [prediction, setPrediction] = useState<PredictionResult>()
  const [stage, setStage] = useState<KyPredictionStage | "">("")
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const selectedTask = tasks.data?.find((task) => task.id === taskId)
  const projectTasks = useMemo(() => tasks.data?.filter((task) => task.projectId === selectedProjectId) ?? [], [selectedProjectId, tasks.data])

  const save = useMutation({
    mutationFn: () => ConstructionService.createKy({
      ${PUBLISHER_PREFIX}_name: `KY ${new Date().toLocaleDateString("ja-JP")} ${detail.slice(0, 30)}`,
      "${PUBLISHER_PREFIX}_project@odata.bind": `/${PUBLISHER_PREFIX}_projects(${selectedProjectId})`,
      "${PUBLISHER_PREFIX}_task@odata.bind": `/${PUBLISHER_PREFIX}_tasks(${taskId})`,
      ${PUBLISHER_PREFIX}_kydate: new Date().toISOString().slice(0, 10),
      ${PUBLISHER_PREFIX}_workdetail: detail, ${PUBLISHER_PREFIX}_weather: Number(weather), ${PUBLISHER_PREFIX}_equipmenttext: equipment,
      ${PUBLISHER_PREFIX}_hazards: hazards, ${PUBLISHER_PREFIX}_countermeasures: countermeasures,
      ${PUBLISHER_PREFIX}_aiprediction: prediction ? JSON.stringify(prediction) : "", ${PUBLISHER_PREFIX}_risklevel: Number(risk),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ky"] })
      toast.success("KY 活動を保存しました")
      navigate("/ky")
    },
    onError: (error) => toast.error(`保存できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })

  const handlePredict = async (useAi = true) => {
    if (!selectedTask) return toast.error("作業を選択してください")
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setPrediction(undefined)
    setStage(useAi ? "requesting" : "")
    try {
      const result = await predictKyRisks({
        workTypeId: selectedTask.workTypeId, workDetail: detail, weather, equipment, projectId: selectedProjectId || undefined,
      }, workTypes.data ?? [], knowledge.data, { useAi, signal: controller.signal, onStage: setStage })
      if (!controller.signal.aborted || !useAi) setPrediction(result)
    } finally {
      if (abort.current === controller) { abort.current = null; setStage("") }
    }
  }
  // 中断すると、待たずに過去事例から表示する（Workflow 側の処理は止まらない）
  const cancelPredict = () => { abort.current?.abort(); abort.current = null; setStage(""); void handlePredict(false) }
  const STAGE_LABEL: Record<KyPredictionStage, string> = { requesting: "AI に依頼しています…", waiting: "KY 危険予測エージェントの応答を待っています…", processing: "KY 危険予測エージェントが分析しています…" }

  const applyPrediction = (index: number) => {
    const item = prediction?.risks[index]
    if (!item) return
    setHazards(item.description)
    setCountermeasures(item.countermeasure)
    setRisk(item.level === "高" ? "100000000" : item.level === "中" ? "100000001" : "100000002")
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedProjectId || !taskId || !detail.trim()) return toast.error("現場・作業・作業内容は必須です")
    save.mutate()
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <Link to="/ky" className="inline-flex items-center text-sm font-bold text-primary"><ChevronLeft className="mr-1 h-4 w-4" />KY 活動の一覧へ</Link>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-primary">朝の安全活動</p><h1 className="text-3xl font-bold">KY 活動を登録</h1><p className="text-muted-foreground">過去のナレッジを根拠に、作業前の危険と対策を確認します。</p></div><ProjectPicker className="w-full sm:w-[26rem]" /></header>
    {!selectedProjectId ? <SelectProjectNotice /> :
    <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-5 max-lg:grid-cols-1">
      <Card className="min-w-0"><CardHeader><CardTitle>作業情報</CardTitle></CardHeader><CardContent className="space-y-4">
        <label className="block">作業 *<select className={inputClass} value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">選択してください</option>{projectTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
        <label className="block">工種<input className={inputClass} readOnly value={workTypes.data?.find((item) => item.id === selectedTask?.workTypeId)?.name ?? ""} /></label>
        <label className="block">作業内容 *<textarea className={inputClass} rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3"><label>天候<select className={inputClass} value={weather} onChange={(event) => setWeather(event.target.value)}><option value="100000000">晴れ</option><option value="100000001">曇り</option><option value="100000002">雨</option><option value="100000004">強風</option></select></label><label>使う重機<input className={inputClass} value={equipment} onChange={(event) => setEquipment(event.target.value)} /></label></div>
        <Button type="button" className="h-11 w-full" onClick={() => void handlePredict()} disabled={!taskId || !detail || Boolean(stage)}><Sparkles className="mr-2 h-4 w-4" />危険を予測</Button>
        {stage && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-300 bg-cyan-50 p-3 text-sm text-cyan-950" role="status" data-ky-stage={stage}>
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{STAGE_LABEL[stage]}</span>
            <Button type="button" size="sm" variant="ghost" onClick={cancelPredict}><X className="mr-1 h-4 w-4" />待たずに過去事例で表示</Button>
          </div>
        )}
        {prediction && (prediction.source === "ai" ? (
          <div className="rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm text-violet-950" data-ky-source="ai">
            <Sparkles className="mr-1 inline h-4 w-4" />KY 危険予測エージェント（Copilot Studio）の予測です。最終判断は現場責任者が行ってください。
            {Boolean(prediction.droppedSources?.length) && <p className="mt-1 text-xs">ナレッジに無い根拠（{prediction.droppedSources?.join("、")}）は表示から除きました。</p>}
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-ky-source="fallback">
            AI を使わず、過去事例（ナレッジ）から表示しています。{prediction.reason && <span className="block text-xs">理由: {prediction.reason}</span>}
          </div>
        ))}
        {prediction?.risks.map((item, index) => (
          <div key={`${item.title}-${index}`} className="rounded-lg border p-4">
            <div className="flex justify-between gap-3"><strong className="[overflow-wrap:anywhere]">{item.title}</strong><span className="shrink-0 font-bold">{item.level}</span></div>
            <p className="mt-2">{item.description}</p>
            <p className="mt-2 text-sm text-muted-foreground">対策: {item.countermeasure}</p>
            {item.sourceKnowledgeTitles.length > 0
              ? <p className="mt-2 text-xs text-muted-foreground"><BookOpen className="mr-1 inline h-3.5 w-3.5" />根拠: {item.sourceKnowledgeTitles.join("、")}</p>
              : prediction.source === "ai" && <p className="mt-2 text-xs text-muted-foreground">一般的な注意（過去事例の根拠なし）</p>}
            <Button type="button" variant="outline" className="mt-3 h-11" onClick={() => applyPrediction(index)}>この内容を反映</Button>
          </div>
        ))}
      </CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle>確認・保存</CardTitle></CardHeader><CardContent className="space-y-4">
        <label className="block">想定される危険<textarea className={inputClass} rows={4} value={hazards} onChange={(event) => setHazards(event.target.value)} /></label>
        <label className="block">対策<textarea className={inputClass} rows={4} value={countermeasures} onChange={(event) => setCountermeasures(event.target.value)} /></label>
        <label className="block">危険度<select className={inputClass} value={risk} onChange={(event) => setRisk(event.target.value)}><option value="100000000">高</option><option value="100000001">中</option><option value="100000002">低</option></select></label>
        <Button className="h-12 w-full" disabled={save.isPending}>{save.isPending ? "保存中..." : "KY 活動を保存"}</Button>
      </CardContent></Card>
    </form>}
  </div>
}

import { useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConstructionService } from "@/services/construction-service"
import { useProject } from "@/state/project-state"
import { ProjectPicker, SelectProjectNotice } from "@/components/project-picker"
import { SitePhoto } from "@/components/site-photo"

const REVIEW_LABEL: Record<number, string> = { 100000000: "下書き", 100000001: "提出済（確認待ち）", 100000002: "承認済", 100000003: "差戻し" }

const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"

export default function DailyReports() {
  const queryClient = useQueryClient()
  const { selectedProject, selectedProjectId } = useProject()
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const [weather, setWeather] = useState("100000000")
  const [workers, setWorkers] = useState("1")
  const [workDetail, setWorkDetail] = useState("")
  const [nextPlan, setNextPlan] = useState("")
  const [remarks, setRemarks] = useState("")
  const [aiDrafted, setAiDrafted] = useState(false)

  const draft = () => {
    const projectTasks = tasks.data?.filter((item) => item.projectId === selectedProjectId) ?? []
    const projectKy = ky.data?.filter((item) => item.projectId === selectedProjectId) ?? []
    const projectIncidents = incidents.data?.filter((item) => item.projectId === selectedProjectId) ?? []
    setWorkDetail(projectTasks.map((item) => `${item.name}（進捗 ${item.progress}%）`).join("、") || "本日の作業内容を入力してください")
    setRemarks(projectKy.length || projectIncidents.length ? `KY ${projectKy.length}件、ヒヤリハット ${projectIncidents.length}件を確認。` : "特記事項なし")
    setNextPlan(projectTasks.filter((item) => item.progress < 100).map((item) => item.name).slice(0, 3).join("、"))
    setAiDrafted(true)
    toast.info("接続可能な AI がないため、当日の記録から下書きを作成しました。編集して確定してください。")
  }

  const save = useMutation({
    mutationFn: (status: number) => ConstructionService.createReport({
      ${PUBLISHER_PREFIX}_name: `${new Date().toLocaleDateString("ja-JP")} ${selectedProject?.name ?? "日報"}`,
      "${PUBLISHER_PREFIX}_project@odata.bind": `/${PUBLISHER_PREFIX}_projects(${selectedProjectId})`,
      ${PUBLISHER_PREFIX}_reportdate: new Date().toISOString().slice(0, 10), ${PUBLISHER_PREFIX}_weather: Number(weather),
      ${PUBLISHER_PREFIX}_workers: Number(workers), ${PUBLISHER_PREFIX}_workdetail: workDetail, ${PUBLISHER_PREFIX}_nextplan: nextPlan,
      ${PUBLISHER_PREFIX}_remarks: remarks, ${PUBLISHER_PREFIX}_aidrafted: aiDrafted, ${PUBLISHER_PREFIX}_status: status,
    }),
    onSuccess: async (_, status) => {
      await queryClient.invalidateQueries({ queryKey: ["reports"] })
      toast.success(status === 100000001 ? "日報を確定しました" : "下書きを保存しました")
    },
    onError: (error) => toast.error(`保存できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })

  const submit = (event: FormEvent, status: number) => {
    event.preventDefault()
    if (!selectedProjectId || !workDetail.trim()) return toast.error("現場と作業内容は必須です")
    save.mutate(status)
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-primary">夕方の報告</p><h1 className="text-3xl font-bold">日報</h1><p className="text-muted-foreground">本日の実績と明日の予定を記録します。</p></div><ProjectPicker className="w-full sm:w-[26rem]" /></header>
    {!selectedProjectId ? <SelectProjectNotice /> :
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] gap-5 max-lg:grid-cols-1">
      <Card className="min-w-0"><CardHeader className="flex-row items-center justify-between"><CardTitle>日報入力</CardTitle><Button variant="outline" className="h-11" onClick={draft}><Sparkles className="mr-2 h-4 w-4" />下書きを作成</Button></CardHeader><CardContent><form className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><label>天候<select className={inputClass} value={weather} onChange={(event) => setWeather(event.target.value)}><option value="100000000">晴れ</option><option value="100000001">曇り</option><option value="100000002">雨</option><option value="100000003">雪</option><option value="100000004">強風</option></select></label><label>作業人員<input type="number" min="0" className={inputClass} value={workers} onChange={(event) => setWorkers(event.target.value)} /></label></div>
        <label className="block">作業内容 *<textarea className={inputClass} rows={5} value={workDetail} onChange={(event) => setWorkDetail(event.target.value)} /></label>
        <label className="block">明日の予定<textarea className={inputClass} rows={3} value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} /></label>
        <label className="block">特記事項<textarea className={inputClass} rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3"><Button variant="outline" className="h-12" onClick={(event) => submit(event, 100000000)}>下書き保存</Button><Button className="h-12" onClick={(event) => submit(event, 100000001)}>確定</Button></div>
      </form></CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle>最近の日報</CardTitle></CardHeader><CardContent className="space-y-3">{reports.data?.filter((item) => item.projectId === selectedProjectId).slice(0, 6).map((item) => <div key={item.id} className="overflow-hidden rounded-lg border">{item.photoUrl && <SitePhoto photoUrl={item.photoUrl} caption={item.photoCaption} projectName={selectedProject?.name ?? ""} reportDate={item.reportDate} />}<div className="p-4"><div className="flex justify-between gap-2"><strong>{item.reportDate.slice(0, 10)}</strong><span className="text-sm font-bold">{REVIEW_LABEL[item.reviewStatus] ?? (item.status === 100000001 ? "確定" : "下書き")}</span></div><p className="mt-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{item.workDetail}</p>{item.reviewComment && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">監督: {item.reviewComment}</p>}{item.aiDrafted && <p className="mt-2 text-xs text-primary">Cowork / 支援下書きを使用</p>}</div></div>)}{!reports.data?.some((item) => item.projectId === selectedProjectId) && <p className="text-muted-foreground">日報はまだありません。</p>}</CardContent></Card>
    </div>}
  </div>
}

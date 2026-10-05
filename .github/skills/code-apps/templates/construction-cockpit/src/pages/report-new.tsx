import { useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import { ChevronLeft, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConstructionService } from "@/services/construction-service"
import { useProject } from "@/state/project-state"
import { ProjectPicker, SelectProjectNotice } from "@/components/project-picker"

const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"

export default function ReportNew() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { selectedProject, selectedProjectId } = useProject()
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
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
      // 確定した日報は監督の確認待ちとして提出する（工事ワークスペースと日報詳細で承認・差戻し）
      ${PUBLISHER_PREFIX}_reviewstatus: status === 100000001 ? 100000001 : 100000000,
    }),
    onSuccess: async (_, status) => {
      await queryClient.invalidateQueries({ queryKey: ["reports"] })
      toast.success(status === 100000001 ? "日報を確定しました" : "下書きを保存しました")
      navigate("/reports")
    },
    onError: (error) => toast.error(`保存できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })

  const submit = (event: FormEvent, status: number) => {
    event.preventDefault()
    if (!selectedProjectId || !workDetail.trim()) return toast.error("現場と作業内容は必須です")
    save.mutate(status)
  }

  return <div className="mx-auto max-w-4xl space-y-6">
    <Link to="/reports" className="inline-flex items-center text-sm font-bold text-primary"><ChevronLeft className="mr-1 h-4 w-4" />日報の一覧へ</Link>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-primary">夕方の報告</p><h1 className="text-3xl font-bold">日報を作成</h1><p className="text-muted-foreground">本日の実績と明日の予定を記録します。</p></div><ProjectPicker className="w-full sm:w-[26rem]" /></header>
    {!selectedProjectId ? <SelectProjectNotice /> :
    <div className="space-y-5">
      <Card className="min-w-0"><CardHeader className="flex-row items-center justify-between"><CardTitle>日報入力</CardTitle><Button variant="outline" className="h-11" onClick={draft}><Sparkles className="mr-2 h-4 w-4" />下書きを作成</Button></CardHeader><CardContent><form className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><label>天候<select className={inputClass} value={weather} onChange={(event) => setWeather(event.target.value)}><option value="100000000">晴れ</option><option value="100000001">曇り</option><option value="100000002">雨</option><option value="100000003">雪</option><option value="100000004">強風</option></select></label><label>作業人員<input type="number" min="0" className={inputClass} value={workers} onChange={(event) => setWorkers(event.target.value)} /></label></div>
        <label className="block">作業内容 *<textarea className={inputClass} rows={5} value={workDetail} onChange={(event) => setWorkDetail(event.target.value)} /></label>
        <label className="block">明日の予定<textarea className={inputClass} rows={3} value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} /></label>
        <label className="block">特記事項<textarea className={inputClass} rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3"><Button variant="outline" className="h-12" onClick={(event) => submit(event, 100000000)}>下書き保存</Button><Button className="h-12" onClick={(event) => submit(event, 100000001)}>確定して監督へ提出</Button></div>
      </form></CardContent></Card>
    </div>}
  </div>
}

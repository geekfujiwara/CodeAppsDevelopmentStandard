import { useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConstructionService, type Incident } from "@/services/construction-service"
import { useProject } from "@/state/project-state"
import { ProjectPicker, SelectProjectNotice } from "@/components/project-picker"

const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"

export default function Incidents() {
  const queryClient = useQueryClient()
  const { selectedProject, selectedProjectId } = useProject()
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const [taskId, setTaskId] = useState("")
  const [name, setName] = useState("")
  const [kind, setKind] = useState("100000000")
  const [description, setDescription] = useState("")
  const [cause, setCause] = useState("")
  const [countermeasure, setCountermeasure] = useState("")
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 16))
  const selectedTask = tasks.data?.find((task) => task.id === taskId)

  const create = useMutation({
    mutationFn: () => ConstructionService.createIncident({
      ${PUBLISHER_PREFIX}_name: name, "${PUBLISHER_PREFIX}_project@odata.bind": `/${PUBLISHER_PREFIX}_projects(${selectedProjectId})`,
      ...(taskId ? { "${PUBLISHER_PREFIX}_task@odata.bind": `/${PUBLISHER_PREFIX}_tasks(${taskId})` } : {}),
      ...(selectedTask ? { "${PUBLISHER_PREFIX}_worktype@odata.bind": `/${PUBLISHER_PREFIX}_worktypes(${selectedTask.workTypeId})` } : {}),
      ${PUBLISHER_PREFIX}_occurredon: new Date(occurredOn).toISOString(), ${PUBLISHER_PREFIX}_incidenttype: Number(kind),
      ${PUBLISHER_PREFIX}_description: description, ${PUBLISHER_PREFIX}_cause: cause, ${PUBLISHER_PREFIX}_countermeasure: countermeasure,
      ${PUBLISHER_PREFIX}_latitude: selectedProject?.latitude ?? 0, ${PUBLISHER_PREFIX}_longitude: selectedProject?.longitude ?? 0,
      ${PUBLISHER_PREFIX}_knowledgecreated: false,
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["incidents"] }); toast.success("ヒヤリハットを保存しました") },
    onError: (error) => toast.error(`保存できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })

  const convert = useMutation({
    mutationFn: async (incident: Incident) => {
      await ConstructionService.createKnowledge({
        ${PUBLISHER_PREFIX}_name: incident.name,
        "${PUBLISHER_PREFIX}_worktype@odata.bind": `/${PUBLISHER_PREFIX}_worktypes(${incident.workTypeId})`,
        "${PUBLISHER_PREFIX}_sourceincident@odata.bind": `/${PUBLISHER_PREFIX}_incidents(${incident.id})`,
        ${PUBLISHER_PREFIX}_knowledgetype: incident.incidentType === 100000002 ? 100000001 : 100000000,
        ${PUBLISHER_PREFIX}_event: incident.description, ${PUBLISHER_PREFIX}_cause: incident.cause,
        ${PUBLISHER_PREFIX}_lesson: incident.countermeasure || "再発防止策を現場内で共有する", ${PUBLISHER_PREFIX}_keywords: incident.name,
      })
      await ConstructionService.updateIncident(incident.id, { ${PUBLISHER_PREFIX}_knowledgecreated: true })
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["incidents"] }), queryClient.invalidateQueries({ queryKey: ["knowledge"] })])
      toast.success("ナレッジ化しました")
    },
    onError: (error) => toast.error(`ナレッジ化できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedProjectId || !taskId || !name.trim() || !description.trim()) return toast.error("現場・作業・件名・内容は必須です")
    create.mutate()
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-primary">その場で記録</p><h1 className="text-3xl font-bold">ヒヤリハット</h1><p className="text-muted-foreground">危険な気づきを記録し、次の現場へ活かすナレッジに変換します。</p></div><ProjectPicker className="w-full sm:w-[26rem]" /></header>
    {!selectedProjectId ? <SelectProjectNotice /> :
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] gap-5 max-lg:grid-cols-1">
      <Card className="min-w-0"><CardHeader><CardTitle>新規登録</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="space-y-4">
        <label className="block">件名 *<input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block">作業 *<select className={inputClass} value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">選択してください</option>{tasks.data?.filter((task) => task.projectId === selectedProjectId).map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label>区分<select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value)}><option value="100000000">ヒヤリハット</option><option value="100000001">軽微な事故</option><option value="100000002">品質トラブル</option><option value="100000003">設備トラブル</option></select></label><label>発生日時<input type="datetime-local" className={inputClass} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label></div>
        <label className="block">内容 *<textarea className={inputClass} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="block">原因<textarea className={inputClass} rows={2} value={cause} onChange={(event) => setCause(event.target.value)} /></label>
        <label className="block">対策<textarea className={inputClass} rows={2} value={countermeasure} onChange={(event) => setCountermeasure(event.target.value)} /></label>
        <p className="rounded-lg bg-muted p-3 text-sm">位置: {selectedProject?.latitude}, {selectedProject?.longitude}（選択中の工事位置）</p>
        <Button className="h-12 w-full" disabled={create.isPending}>{create.isPending ? "保存中..." : "保存"}</Button>
      </form></CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle>最近の記録</CardTitle></CardHeader><CardContent className="space-y-3">
        {incidents.data?.filter((item) => item.projectId === selectedProjectId).map((item) => <div key={item.id} className="rounded-lg border p-4"><strong>{item.name}</strong><p className="mt-1 text-sm [overflow-wrap:anywhere]">{item.description}</p>{item.knowledgeCreated ? <span className="mt-3 inline-block text-sm text-green-700">ナレッジ化済み</span> : <Button variant="outline" className="mt-3 h-11" onClick={() => convert.mutate(item)}>ナレッジ化</Button>}</div>)}
        {!incidents.data?.some((item) => item.projectId === selectedProjectId) && <p className="text-muted-foreground">記録はありません。</p>}
      </CardContent></Card>
    </div>}
  </div>
}

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Camera, CheckCircle2, ChevronLeft, List, Map, RotateCcw, Search, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import "@xyflow/react/dist/style.css"
import { ConstructionService, type DailyReport, type Project, type Task } from "@/services/construction-service"
import { Button } from "@/components/ui/button"
import { GoogleMapEmbed } from "@/components/google-map-embed"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { ProjectGanttFlow } from "@/components/project-gantt-flow"
import { ProjectRelationshipFlow } from "@/components/project-relationship-flow"
import { ProjectModel3d } from "@/components/project-model-3d"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProject } from "@/state/project-state"

const panelClass = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"

function PortfolioCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  return (
    <article className={panelClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{project.projectNo}</p>
          <h3 className="mt-1 text-lg font-black [overflow-wrap:anywhere]">{project.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{project.address}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold dark:bg-slate-800">{project.progress}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full bg-cyan-500" style={{ width: `${project.progress}%` }} />
      </div>
      <Button className="mt-4 w-full" onClick={onSelect}>工事ワークスペースを開く</Button>
    </article>
  )
}

function ProjectPortfolio() {
  const navigate = useNavigate()
  const { setSelectedProjectId } = useProject()
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const projects = useQuery({
    queryKey: ["project-search", search],
    queryFn: () => ConstructionService.searchProjects(search),
  })
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const selectProject = (id: string) => {
    setSelectedProjectId(id)
    navigate(`/projects/${id}`)
  }
  const photos = useMemo(() => (reports.data ?? []).filter((report) => report.photoUrl), [reports.data])

  if (projects.isLoading || reports.isLoading) return <LoadingSkeletonGrid count={6} columns={3} />
  if (projects.error || reports.error) return <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800">工事一覧を読み込めませんでした。</p>

  return (
    <div className="mx-auto max-w-[110rem] space-y-5" data-tour="project-portfolio">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">PROJECT PORTFOLIO</p>
        <h1 className="mt-2 text-3xl font-black">工事ワークスペース</h1>
        <p className="mt-2 text-slate-500">地図、現場写真、一覧から工事を選び、工程と施工状況を確認します。</p>
      </header>
      <form className={panelClass} onSubmit={(event) => { event.preventDefault(); setSearch(query) }} data-tour="project-search">
        <label className="text-sm font-bold" htmlFor="project-search">Dataverse 工事検索</label>
        <div className="mt-2 flex gap-2">
          <input id="project-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="工事番号、名称、発注者、住所" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 dark:border-slate-700 dark:bg-slate-950" />
          <Button type="submit"><Search className="mr-2 h-4 w-4" />検索</Button>
          {search && <Button type="button" variant="outline" onClick={() => { setQuery(""); setSearch("") }}>解除</Button>}
        </div>
      </form>

      <Tabs defaultValue="map">
        <TabsList className="h-auto flex-wrap" data-tour="project-tabs">
          <TabsTrigger value="map"><Map className="mr-2 h-4 w-4" />マップ</TabsTrigger>
          <TabsTrigger value="photos"><Camera className="mr-2 h-4 w-4" />日報写真</TabsTrigger>
          <TabsTrigger value="list"><List className="mr-2 h-4 w-4" />一覧</TabsTrigger>
        </TabsList>
        <TabsContent value="map">
          {!projects.data?.length ? <p className={panelClass}>条件に一致する工事はありません。</p> : (
            <div className="grid gap-5 xl:grid-cols-2">
              {projects.data.map((project) => (
                <article key={project.id} className={`${panelClass} grid gap-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(14rem,0.65fr)]`}>
                  <GoogleMapEmbed latitude={project.latitude} longitude={project.longitude} address={project.address} label={project.name} className="h-72 min-w-0" />
                  <PortfolioCard project={project} onSelect={() => selectProject(project.id)} />
                </article>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="photos">
          {!photos.length ? <p className={panelClass}>日報に添付された写真はありません。</p> : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {photos.map((report) => {
                const project = projects.data?.find((item) => item.id === report.projectId)
                return <article key={report.id} className={`${panelClass} overflow-hidden p-0`}>
                  <img src={report.photoUrl} alt={report.photoCaption || report.name} className="aspect-video w-full object-cover" />
                  <div className="p-5"><p className="font-black">{project?.name ?? "工事"}</p><p className="mt-1 text-sm text-slate-500">{report.reportDate.slice(0, 10)}</p><p className="mt-3 text-sm">{report.photoCaption || report.workDetail}</p></div>
                </article>
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="list">
          {!projects.data?.length ? <p className={panelClass}>条件に一致する工事はありません。</p> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.data.map((project) => <PortfolioCard key={project.id} project={project} onSelect={() => selectProject(project.id)} />)}</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReviewQueue({ reports, tasks }: { reports: DailyReport[]; tasks: Task[] }) {
  const queryClient = useQueryClient()
  const [comments, setComments] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: async ({ kind, id, action, progress }: { kind: "report" | "task"; id: string; action: "approve" | "return"; progress?: number }) => {
      const comment = comments[`${kind}-${id}`]?.trim() ?? ""
      if (action === "return" && !comment) throw new Error("差戻し理由を入力してください。")
      const body = { gc_reviewstatus: action === "approve" ? 100000002 : 100000003, gc_reviewcomment: comment }
      if (kind === "report") return ConstructionService.updateReport(id, body)
      return ConstructionService.updateTask(id, action === "approve" ? { ...body, gc_progress: progress ?? 0 } : body)
    },
    onSuccess: async () => { await queryClient.invalidateQueries(); toast.success("確認結果を保存しました") },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新できませんでした"),
  })
  const pendingReports = reports.filter((item) => item.reviewStatus === 100000001)
  const pendingTasks = tasks.filter((item) => item.reviewStatus === 100000001)
  if (!pendingReports.length && !pendingTasks.length) return <p className="text-sm text-slate-500">確認待ちの提出はありません。</p>
  return <div className="space-y-3">
    {[...pendingReports.map((item) => ({ kind: "report" as const, id: item.id, name: item.name, detail: item.workDetail, progress: undefined })),
      ...pendingTasks.map((item) => ({ kind: "task" as const, id: item.id, name: item.name, detail: `報告進捗 ${item.reportedProgress}%`, progress: item.reportedProgress }))].map((item) => {
        const key = `${item.kind}-${item.id}`
        return <article key={key} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-slate-950">
          <p className="font-black">{item.name}</p><p className="mt-1 text-sm">{item.detail}</p>
          <textarea value={comments[key] ?? ""} onChange={(event) => setComments((value) => ({ ...value, [key]: event.target.value }))} placeholder="監督コメント（差戻し時は必須）" className="mt-3 min-h-20 w-full rounded-lg border border-amber-300 bg-white p-2 text-sm" />
          <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => mutation.mutate({ ...item, action: "approve" })}><CheckCircle2 className="mr-1 h-4 w-4" />承認</Button><Button size="sm" variant="outline" onClick={() => mutation.mutate({ ...item, action: "return" })}><RotateCcw className="mr-1 h-4 w-4" />差戻し</Button></div>
        </article>
      })}
  </div>
}

function Workspace({ projectId }: { projectId: string }) {
  const { setSelectedProjectId } = useProject()
  const projects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const equipment = useQuery({ queryKey: ["equipment"], queryFn: ConstructionService.equipment })
  const equipmentUsage = useQuery({ queryKey: ["equipment-usage"], queryFn: ConstructionService.equipmentUsage })
  const queries = [projects, tasks, reports, incidents, ky, knowledge, equipment, equipmentUsage]
  const project = projects.data?.find((item) => item.id === projectId)
  useEffect(() => { if (projectId) setSelectedProjectId(projectId) }, [projectId, setSelectedProjectId])
  const projectTasks = tasks.data?.filter((item) => item.projectId === projectId) ?? []
  const projectReports = reports.data?.filter((item) => item.projectId === projectId) ?? []
  const projectIncidents = incidents.data?.filter((item) => item.projectId === projectId) ?? []
  const projectKy = ky.data?.filter((item) => item.projectId === projectId) ?? []
  if (queries.some((query) => query.isLoading)) return <LoadingSkeletonGrid count={5} columns={2} />
  if (queries.some((query) => query.error)) return <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800">工事データを読み込めませんでした。</p>
  if (!project) return <p className={panelClass}>指定された工事が見つかりません。</p>
  return <div className="mx-auto max-w-[110rem] space-y-5">
    <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
      <Link to="/projects" className="inline-flex items-center text-sm font-bold text-cyan-300"><ChevronLeft className="mr-1 h-4 w-4" />工事一覧へ</Link>
      <h1 className="mt-4 text-3xl font-black">{project.name}</h1><p className="mt-2 text-slate-300">{project.projectNo} · {project.client} · {project.address}</p>
    </header>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-5">
        <div className={panelClass}><div className="mb-4"><h2 className="text-xl font-black">施工位置と進捗 3D</h2><p className="text-sm text-slate-500">ドラッグで回転、ホイールで拡大縮小できます。</p></div><ProjectModel3d tasks={projectTasks} /></div>
        <div className={panelClass}>
          <Tabs defaultValue="gantt"><TabsList><TabsTrigger value="gantt">工程ガント</TabsTrigger><TabsTrigger value="relations">因果関係</TabsTrigger></TabsList>
            <TabsContent value="gantt"><div className="h-[38rem]"><ProjectGanttFlow project={project} tasks={projectTasks} onSelect={() => undefined} /></div></TabsContent>
            <TabsContent value="relations"><div className="h-[38rem]"><ProjectRelationshipFlow project={project} tasks={projectTasks} reports={projectReports} kyActivities={projectKy} incidents={projectIncidents} knowledge={knowledge.data ?? []} equipment={equipment.data ?? []} equipmentUsage={equipmentUsage.data ?? []} onSelect={() => undefined} /></div></TabsContent>
          </Tabs>
        </div>
      </section>
      <aside className={`${panelClass} h-fit`} data-tour="review-queue"><h2 className="text-xl font-black">監督確認</h2><p className="mt-1 mb-4 text-sm text-slate-500">Cowork から提出された日報と工程進捗を確認します。</p><ReviewQueue reports={projectReports} tasks={projectTasks} /></aside>
    </div>
    <div className="flex flex-wrap gap-2"><Button asChild><Link to="/ky">KY を開始</Link></Button><Button asChild variant="outline"><Link to="/incidents"><ShieldAlert className="mr-2 h-4 w-4" />ヒヤリハット</Link></Button></div>
  </div>
}

export default function ProjectDetail() {
  const { projectId = "" } = useParams()
  return projectId ? <Workspace projectId={projectId} /> : <ProjectPortfolio />
}

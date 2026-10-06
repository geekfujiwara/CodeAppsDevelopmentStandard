import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Gauge,
  ImageDown,
  List,
  Loader2,
  Map,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import "@xyflow/react/dist/style.css"
import {
  ConstructionService,
  type DailyReport,
  type Incident,
  type KyActivity,
  type Project,
  type Task,
  type WorkType,
} from "@/services/construction-service"
import { Button } from "@/components/ui/button"
import { GoogleMapEmbed } from "@/components/google-map-embed"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { ProjectGanttFlow, type FlowSelection } from "@/components/project-gantt-flow"
import { ProjectRelationshipFlow } from "@/components/project-relationship-flow"
import { ProjectSearch } from "@/components/entity-search"
import { ProjectModel3d, type CadPreview, type TaskSnapshot } from "@/components/project-model-3d"
import { CadImportPanel } from "@/components/cad-import-panel"
import { CAD_MODEL_URL } from "@/lib/models/model-source"
import { parseCadMapping } from "@/lib/models/cad-import"
import { SitePhoto } from "@/components/site-photo"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MODEL_TYPE_LABEL } from "@/lib/models"
import { expectedProgress, sortTasks, taskState, TASK_STATE_COLOR, TASK_STATE_LABEL } from "@/lib/construction-schedule"
import { useProject } from "@/state/project-state"

const panelClass = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
const STATUS_LABEL: Record<number, string> = { 100000000: "計画中", 100000001: "施工中", 100000002: "完了" }
const STATUS_STYLE: Record<number, string> = {
  100000000: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  100000001: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  100000002: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
}
const SUBMITTED = 100000001
const RETURNED = 100000003

type ProjectSignals = { delayed: number; pending: number }

function signalsFor(projectId: string, tasks: Task[], reports: DailyReport[]): ProjectSignals {
  const projectTasks = tasks.filter((task) => task.projectId === projectId)
  return {
    delayed: projectTasks.filter((task) => taskState(task) === "delayed").length,
    pending: projectTasks.filter((task) => task.reviewStatus === SUBMITTED).length
      + reports.filter((report) => report.projectId === projectId && report.reviewStatus === SUBMITTED).length,
  }
}

function PortfolioCard({ project, signals, onSelect }: { project: Project; signals: ProjectSignals; onSelect: () => void }) {
  return (
    <article className={`${panelClass} flex flex-col`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-black ${STATUS_STYLE[project.status] ?? STATUS_STYLE[100000000]}`}>{STATUS_LABEL[project.status] ?? "未設定"}</span>
        {project.modelType > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.7rem] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{MODEL_TYPE_LABEL[project.modelType]}</span>}
        <span className="ml-auto text-xs font-bold text-cyan-700 dark:text-cyan-300">{project.projectNo}</span>
      </div>
      <h3 className="mt-3 text-lg font-black leading-snug [overflow-wrap:anywhere]">{project.name}</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.address}</p>
      <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500">
        <span>進捗</span><span className="text-base font-black text-slate-900 dark:text-white">{project.progress}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full ${project.status === 100000002 ? "bg-emerald-500" : "bg-cyan-500"}`} style={{ width: `${project.progress}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
        {signals.delayed > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-900"><AlertTriangle className="h-3.5 w-3.5" />遅延 {signals.delayed}</span>}
        {signals.pending > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-violet-900"><ClipboardCheck className="h-3.5 w-3.5" />確認待ち {signals.pending}</span>}
        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">代理人 {project.siteManager}</span>
      </div>
      <div className="mt-auto pt-4"><Button className="w-full" onClick={onSelect}>工事ワークスペースを開く</Button></div>
    </article>
  )
}

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "100000001", label: "施工中" },
  { key: "100000000", label: "計画中" },
  { key: "100000002", label: "完了" },
] as const

function ProjectPortfolio() {
  const navigate = useNavigate()
  const { setSelectedProjectId } = useProject()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string>("all")
  const [photoProject, setPhotoProject] = useState("")
  const [photoLimit, setPhotoLimit] = useState(24)
  const projects = useQuery({ queryKey: ["project-search", search], queryFn: () => ConstructionService.searchProjects(search) })
  const allProjects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const selectProject = (id: string) => {
    setSelectedProjectId(id)
    navigate(`/projects/${id}`)
  }
  const filtered = useMemo(
    () => (projects.data ?? []).filter((project) => status === "all" || String(project.status) === status),
    [projects.data, status],
  )
  const projectName = useMemo(() => new globalThis.Map((allProjects.data ?? []).map((project) => [project.id, project.name])), [allProjects.data])
  const photos = useMemo(
    () => (reports.data ?? []).filter((report) => report.photoUrl && (!photoProject || report.projectId === photoProject)),
    [photoProject, reports.data],
  )

  if (projects.isLoading || reports.isLoading || tasks.isLoading) return <LoadingSkeletonGrid count={6} columns={3} />
  if (projects.error || reports.error || tasks.error) return <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800">工事一覧を読み込めませんでした。</p>
  const signals = (id: string) => signalsFor(id, tasks.data ?? [], reports.data ?? [])

  return (
    <div className="mx-auto max-w-[110rem] space-y-5" data-tour="project-portfolio">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">PROJECT PORTFOLIO</p>
        <h1 className="mt-2 text-3xl font-black">工事ワークスペース</h1>
        <p className="mt-2 text-slate-500">地図、現場写真、一覧から工事を選び、工程と施工状況を確認します。</p>
      </header>
      <div className={`${panelClass} grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]`} data-tour="project-search">
        <div className="min-w-0">
          <span className="text-sm font-bold">Dataverse 工事検索</span>
          <p className="text-xs text-slate-500">入力すると候補を表示します。候補を選ぶと工事を開き、Enter で一覧を絞り込みます。</p>
          <div className="mt-2 flex gap-2">
            <ProjectSearch className="flex-1" onSelect={(project) => { if (project) navigate(`/projects/${project.id}`) }} onSubmitText={setSearch} />
            {search && <Button type="button" variant="outline" onClick={() => setSearch("")}>「{search}」の絞り込みを解除</Button>}
          </div>
        </div>
        <div className="min-w-0">
          <span className="text-sm font-bold">状態</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <button key={item.key} type="button" onClick={() => setStatus(item.key)}
                className={`h-11 rounded-xl px-4 text-sm font-bold ${status === item.key ? "bg-slate-950 text-white dark:bg-cyan-400 dark:text-slate-950" : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="map">
        <TabsList className="h-auto flex-wrap" data-tour="project-tabs">
          <TabsTrigger value="map"><Map className="mr-2 h-4 w-4" />マップ</TabsTrigger>
          <TabsTrigger value="photos"><Camera className="mr-2 h-4 w-4" />日報写真</TabsTrigger>
          <TabsTrigger value="list"><List className="mr-2 h-4 w-4" />一覧</TabsTrigger>
        </TabsList>
        <p className="mt-3 text-sm text-slate-500">{filtered.length} 件の工事{search && `（「${search}」の検索結果）`}</p>
        <TabsContent value="map">
          {!filtered.length ? <p className={panelClass}>条件に一致する工事はありません。</p> : (
            <div className="grid gap-5 2xl:grid-cols-2">
              {filtered.map((project) => (
                <article key={project.id} className={`${panelClass} grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(15rem,0.7fr)]`}>
                  <GoogleMapEmbed latitude={project.latitude} longitude={project.longitude} address={project.address} label={project.name} zoom={14} className="h-72 min-w-0" />
                  <PortfolioCard project={project} signals={signals(project.id)} onSelect={() => selectProject(project.id)} />
                </article>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="photos">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select value={photoProject} onChange={(event) => { setPhotoProject(event.target.value); setPhotoLimit(24) }} className="h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950" aria-label="写真の工事">
              <option value="">すべての工事</option>
              {(allProjects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.projectNo} {project.name}</option>)}
            </select>
            <span className="text-sm text-slate-500">{photos.length} 枚</span>
          </div>
          {!photos.length ? <p className={panelClass}>日報に添付された写真はありません。</p> : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {photos.slice(0, photoLimit).map((report) => (
                  <article key={report.id} className={`${panelClass} overflow-hidden p-0`}>
                    <SitePhoto photoUrl={report.photoUrl} caption={report.photoCaption} projectName={projectName.get(report.projectId) ?? "工事"} reportDate={report.reportDate} />
                    <div className="p-4">
                      <button type="button" className="text-left font-black text-cyan-700 hover:underline dark:text-cyan-300" onClick={() => selectProject(report.projectId)}>{projectName.get(report.projectId) ?? "工事"}</button>
                      <p className="mt-1 text-xs text-slate-500">{report.reportDate.slice(0, 10)} · {report.name}</p>
                      <p className="mt-2 text-sm [overflow-wrap:anywhere]">{report.photoCaption || report.workDetail}</p>
                    </div>
                  </article>
                ))}
              </div>
              {photos.length > photoLimit && <Button variant="outline" className="mt-4 w-full" onClick={() => setPhotoLimit((value) => value + 24)}>さらに表示（残り {photos.length - photoLimit} 枚）</Button>}
            </>
          )}
        </TabsContent>
        <TabsContent value="list">
          {!filtered.length ? <p className={panelClass}>条件に一致する工事はありません。</p> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filtered.map((project) => <PortfolioCard key={project.id} project={project} signals={signals(project.id)} onSelect={() => selectProject(project.id)} />)}</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

type ReviewItem = { kind: "report" | "task"; id: string; name: string; detail: string; progress?: number; current?: number; comment: string; returned: boolean }

function ReviewQueue({ reports, tasks }: { reports: DailyReport[]; tasks: Task[] }) {
  const queryClient = useQueryClient()
  const [comments, setComments] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: async ({ item, action }: { item: ReviewItem; action: "approve" | "return" }) => {
      const key = `${item.kind}-${item.id}`
      const comment = comments[key]?.trim() ?? ""
      if (item.kind === "report") return ConstructionService.reviewReport(item.id, action, comment)
      return ConstructionService.reviewTask(item.id, action, comment, Number(overrides[key] ?? item.progress ?? 0))
    },
    onSuccess: async (_, { action }) => {
      await queryClient.invalidateQueries()
      toast.success(action === "approve" ? "承認し、工事進捗へ反映しました" : "差し戻しました")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新できませんでした"),
  })
  const items: ReviewItem[] = [
    ...tasks.filter((item) => item.reviewStatus === SUBMITTED || item.reviewStatus === RETURNED).map((item) => ({
      kind: "task" as const, id: item.id, name: item.name, detail: `報告進捗 ${item.reportedProgress}%（現在 ${item.progress}%）`,
      progress: item.reportedProgress, current: item.progress, comment: item.reviewComment, returned: item.reviewStatus === RETURNED,
    })),
    ...reports.filter((item) => item.reviewStatus === SUBMITTED || item.reviewStatus === RETURNED).map((item) => ({
      kind: "report" as const, id: item.id, name: `${item.reportDate.slice(0, 10)} 日報`, detail: item.workDetail,
      comment: item.reviewComment, returned: item.reviewStatus === RETURNED,
    })),
  ]
  if (!items.length) return <p className="text-sm text-slate-500">確認待ちの提出はありません。</p>
  return <div className="space-y-3">
    {items.map((item) => {
      const key = `${item.kind}-${item.id}`
      return <article key={key} className={`rounded-xl border p-4 text-slate-950 ${item.returned ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-black">{item.name}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-black ${item.returned ? "bg-rose-200 text-rose-900" : "bg-amber-200 text-amber-900"}`}>{item.returned ? "差戻し中" : item.kind === "task" ? "工程進捗" : "日報"}</span>
        </div>
        <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm">{item.detail}</p>
        {item.returned && item.comment && <p className="mt-2 rounded bg-white/70 p-2 text-xs text-rose-900">差戻し理由: {item.comment}</p>}
        {!item.returned && <>
          {item.kind === "task" && (
            <label className="mt-3 flex items-center gap-2 text-sm font-bold">承認する進捗
              <input type="number" min={0} max={100} value={overrides[key] ?? String(item.progress ?? 0)} onChange={(event) => setOverrides((value) => ({ ...value, [key]: event.target.value }))} className="h-9 w-20 rounded-lg border border-amber-300 bg-white px-2" />%
            </label>
          )}
          <textarea value={comments[key] ?? ""} onChange={(event) => setComments((value) => ({ ...value, [key]: event.target.value }))} placeholder="監督コメント（差戻し時は必須）" className="mt-3 min-h-20 w-full rounded-lg border border-amber-300 bg-white p-2 text-sm" />
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ item, action: "approve" })}><CheckCircle2 className="mr-1 h-4 w-4" />{item.kind === "task" && overrides[key] !== undefined && Number(overrides[key]) !== item.progress ? "修正して承認" : "承認"}</Button>
            <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ item, action: "return" })}><RotateCcw className="mr-1 h-4 w-4" />差戻し</Button>
          </div>
        </>}
      </article>
    })}
  </div>
}

type InspectorProps = {
  task?: Task
  selection: FlowSelection | null
  workTypes: WorkType[]
  ky: KyActivity[]
  incidents: Incident[]
  reports: DailyReport[]
  project: Project
  snapshot?: TaskSnapshot
  onRegenerate: () => void
}

/** 施工位置イメージ: 3D から自動で作った画像を表示し、Dataverse（画像列）へ保存できる。保存済みの画像も表示する */
function LocationImage({ task, snapshot, onRegenerate }: { task: Task; snapshot?: TaskSnapshot; onRegenerate: () => void }) {
  const queryClient = useQueryClient()
  const [showSaved, setShowSaved] = useState(false)
  const saved = useQuery({
    queryKey: ["task-location-image", task.id, task.locationImageVersion],
    queryFn: () => ConstructionService.taskLocationImage(task.id),
    enabled: task.locationImageVersion > 0 && (showSaved || !snapshot?.dataUrl),
    staleTime: Infinity,
  })
  const save = useMutation({
    mutationFn: (dataUrl: string) => ConstructionService.saveTaskLocationImage(task.id, dataUrl),
    onSuccess: async () => {
      toast.success("施工位置イメージを作業に保存しました。日報や Copilot Studio からも参照できます。")
      await queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (error) => toast.error(`保存できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })
  const current = showSaved ? undefined : snapshot?.dataUrl
  const image = current ?? saved.data
  return (
    <div data-tour="location-image">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-500">施工位置イメージ{current ? "（自動生成）" : image ? "（保存済み）" : ""}</p>
        {task.locationImageVersion > 0 && snapshot?.dataUrl && (
          <button type="button" className="text-xs font-bold text-cyan-700 dark:text-cyan-300" onClick={() => setShowSaved((value) => !value)}>{showSaved ? "最新の自動生成を表示" : "保存済みを表示"}</button>
        )}
      </div>
      {image ? (
        <img src={image} alt={`${task.name} の施工位置イメージ`} className="mt-1 aspect-video w-full rounded-xl border border-slate-200 object-cover dark:border-slate-800" data-location-image={current ? "generated" : "saved"} />
      ) : snapshot?.error ? (
        <p className="mt-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{snapshot.error}</p>
      ) : saved.isError ? (
        <p className="mt-1 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">保存済みの画像を読み込めませんでした。</p>
      ) : (
        <div className="mt-1 grid aspect-video place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />3D から画像を作成中…</span></div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { setShowSaved(false); onRegenerate() }}><RefreshCw className="mr-1 h-4 w-4" />作り直す</Button>
        <Button size="sm" disabled={!current || save.isPending} onClick={() => current && save.mutate(current)}><ImageDown className="mr-1 h-4 w-4" />{save.isPending ? "保存中…" : "作業に保存"}</Button>
      </div>
    </div>
  )
}

function TaskInspector({ task, selection, workTypes, ky, incidents, reports, project, snapshot, onRegenerate }: InspectorProps) {
  if (!task) {
    if (selection) {
      return <div><p className="text-xs font-black text-cyan-700 dark:text-cyan-300">{selection.kind}</p><p className="mt-1 font-black">{selection.title}</p><p className="mt-2 text-sm text-slate-500">{selection.subtitle}</p><p className="mt-2 text-sm">{selection.detail}</p></div>
    }
    return <p className="text-sm text-slate-500">3D モデルの部位、施工中ピン、または工程バーを選択すると、作業の詳細と関連する安全記録・写真を表示します。</p>
  }
  const state = taskState(task)
  const expected = expectedProgress(task)
  const taskKy = ky.filter((item) => item.taskId === task.id).slice(0, 3)
  const taskIncidents = incidents.filter((item) => item.taskId === task.id)
  const photo = reports.find((report) => report.photoUrl && report.photoCaption.startsWith(task.name))
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[0.7rem] font-black text-slate-950" style={{ background: TASK_STATE_COLOR[state] }}>{TASK_STATE_LABEL[state]}</span>
          <span className="text-xs font-bold text-slate-500">{workTypes.find((item) => item.id === task.workTypeId)?.name}</span>
        </div>
        <p className="mt-2 text-lg font-black">{task.name}</p>
        <p className="text-sm text-slate-500">{task.plannedStart.slice(0, 10)} 〜 {task.plannedEnd.slice(0, 10)}</p>
      </div>
      <div>
        <div className="flex justify-between text-xs font-bold text-slate-500"><span>実績 {task.progress}%</span><span>予定 {expected}%</span></div>
        <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-slate-600" style={{ width: `${expected}%` }} />
          <div className="absolute inset-y-0 left-0" style={{ width: `${task.progress}%`, background: TASK_STATE_COLOR[state] }} />
        </div>
      </div>
      {task.issue && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />{task.issue}</p>}
      <LocationImage task={task} snapshot={snapshot?.taskId === task.id ? snapshot : undefined} onRegenerate={onRegenerate} />
      {photo && <div><p className="mb-1 text-xs font-black text-slate-500">日報の現場写真</p><SitePhoto photoUrl={photo.photoUrl} caption={photo.photoCaption} projectName={project.name} reportDate={photo.reportDate} className="rounded-xl" /></div>}
      <div>
        <p className="text-xs font-black text-slate-500">直近の KY</p>
        {taskKy.length ? taskKy.map((item) => <p key={item.id} className="mt-1 text-sm"><span className="font-bold">{item.date.slice(5, 10)}</span> {item.hazards} → {item.countermeasures}</p>) : <p className="mt-1 text-sm text-slate-500">記録なし</p>}
      </div>
      <div>
        <p className="text-xs font-black text-slate-500">ヒヤリハット</p>
        {taskIncidents.length ? taskIncidents.map((item) => <p key={item.id} className="mt-1 text-sm text-rose-700 dark:text-rose-300">{item.name}</p>) : <p className="mt-1 text-sm text-slate-500">記録なし</p>}
      </div>
    </div>
  )
}

function Workspace({ projectId }: { projectId: string }) {
  const { setSelectedProjectId } = useProject()
  const [selectedTaskId, setSelectedTaskId] = useState<string>()
  const [selection, setSelection] = useState<FlowSelection | null>(null)
  const [cadOpen, setCadOpen] = useState(false)
  const [cadPreview, setCadPreview] = useState<CadPreview>()
  const [snapshot, setSnapshot] = useState<TaskSnapshot>()
  const [regenerate, setRegenerate] = useState(0)
  const projects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const equipment = useQuery({ queryKey: ["equipment"], queryFn: ConstructionService.equipment })
  const equipmentUsage = useQuery({ queryKey: ["equipment-usage"], queryFn: ConstructionService.equipmentUsage })
  const workTypes = useQuery({ queryKey: ["workTypes"], queryFn: ConstructionService.workTypes })
  const queries = [projects, tasks, reports, incidents, ky, knowledge, equipment, equipmentUsage, workTypes]
  const project = projects.data?.find((item) => item.id === projectId)
  useEffect(() => { if (projectId) setSelectedProjectId(projectId) }, [projectId, setSelectedProjectId])
  useEffect(() => { setSelectedTaskId(undefined); setSelection(null); setCadOpen(false); setCadPreview(undefined); setSnapshot(undefined) }, [projectId])
  const projectTasks = useMemo(() => sortTasks(tasks.data?.filter((item) => item.projectId === projectId) ?? []), [projectId, tasks.data])
  const projectReports = useMemo(() => reports.data?.filter((item) => item.projectId === projectId) ?? [], [projectId, reports.data])
  const projectIncidents = useMemo(() => incidents.data?.filter((item) => item.projectId === projectId) ?? [], [incidents.data, projectId])
  const projectKy = useMemo(() => ky.data?.filter((item) => item.projectId === projectId) ?? [], [ky.data, projectId])
  const photos = projectReports.filter((report) => report.photoUrl)

  if (queries.some((query) => query.isLoading)) return <LoadingSkeletonGrid count={5} columns={2} />
  if (queries.some((query) => query.error)) return <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800">工事データを読み込めませんでした。</p>
  if (!project) return <p className={panelClass}>指定された工事が見つかりません。<Link to="/projects" className="ml-2 font-bold text-cyan-700">工事一覧へ戻る</Link></p>

  const selectTask = (taskId: string) => { setSelectedTaskId(taskId); setSelection(null) }
  const signals = signalsFor(projectId, tasks.data ?? [], reports.data ?? [])
  const recentIncidents = projectIncidents.filter((item) => Date.now() - new Date(item.occurredOn).getTime() < 30 * 86_400_000).length
  const metrics: Array<[string, string, LucideIcon, string]> = [
    ["全体進捗", `${project.progress}%`, Gauge, "text-cyan-600"],
    ["遅延している作業", `${signals.delayed} 件`, AlertTriangle, signals.delayed ? "text-amber-500" : "text-slate-400"],
    ["確認待ちの提出", `${signals.pending} 件`, ClipboardCheck, signals.pending ? "text-violet-500" : "text-slate-400"],
    ["30 日以内のヒヤリハット", `${recentIncidents} 件`, ShieldAlert, recentIncidents ? "text-rose-500" : "text-slate-400"],
  ]

  return <div className="mx-auto max-w-[120rem] space-y-5">
    <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
      <Link to="/projects" className="inline-flex items-center text-sm font-bold text-cyan-300"><ChevronLeft className="mr-1 h-4 w-4" />工事一覧へ</Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${STATUS_STYLE[project.status] ?? ""}`}>{STATUS_LABEL[project.status]}</span>
        {project.modelType > 0 && <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">{MODEL_TYPE_LABEL[project.modelType]}</span>}
      </div>
      <h1 className="mt-3 text-3xl font-black">{project.name}</h1>
      <p className="mt-2 text-slate-300">{project.projectNo} · {project.client} · {project.address} · 現場代理人 {project.siteManager}</p>
      {project.description && <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">{project.description}</p>}
      <p className="mt-2 text-xs text-slate-400">工期 {project.startDate.slice(0, 10)} 〜 {project.endDate.slice(0, 10)}</p>
    </header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map(([label, value, Icon, color]) => (
        <article key={label} className={panelClass}>
          <Icon className={`h-5 w-5 ${color}`} />
          <p className="mt-3 text-2xl font-black">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </article>
      ))}
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 space-y-5">
        <div className={panelClass}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-xl font-black">施工位置と進捗 3D</h2><p className="text-sm text-slate-500">ドラッグで回転、ホイールで拡大。部位や施工中ピンをクリックすると工程と連動します。</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {project.modelUrl === CAD_MODEL_URL && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">CAD: {parseCadMapping(project.modelMapping)?.fileName ?? project.modelFileName}</span>}
              <Button size="sm" variant={cadOpen ? "default" : "outline"} onClick={() => setCadOpen((value) => !value)} aria-expanded={cadOpen} data-tour="cad-import-button"><Box className="mr-1 h-4 w-4" />CAD モデルを取り込む</Button>
            </div>
          </div>
          <ProjectModel3d
            project={project}
            tasks={projectTasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={selectTask}
            cadPreview={cadPreview}
            snapshotRequest={selectedTaskId ? { taskId: selectedTaskId, nonce: `${projectTasks.find((item) => item.id === selectedTaskId)?.progress}-${regenerate}` } : undefined}
            onSnapshot={setSnapshot}
          />
          {cadOpen && <CadImportPanel project={project} tasks={projectTasks} onPreview={setCadPreview} onClose={() => setCadOpen(false)} />}
        </div>
        <div className={panelClass}>
          <Tabs defaultValue="gantt">
            <TabsList><TabsTrigger value="gantt">工程ガント</TabsTrigger><TabsTrigger value="relations">因果関係</TabsTrigger><TabsTrigger value="photos">現場写真（{photos.length}）</TabsTrigger></TabsList>
            <TabsContent value="gantt"><div className="h-[38rem]"><ProjectGanttFlow project={project} tasks={projectTasks} selectedTaskId={selectedTaskId} onSelect={(item) => item.taskId ? selectTask(item.taskId) : setSelection(item)} /></div></TabsContent>
            <TabsContent value="relations"><div className="h-[38rem]"><ProjectRelationshipFlow project={project} tasks={projectTasks} reports={projectReports} kyActivities={projectKy} incidents={projectIncidents} knowledge={knowledge.data ?? []} equipment={equipment.data ?? []} equipmentUsage={equipmentUsage.data ?? []} onSelect={(item) => item.taskId ? selectTask(item.taskId) : (setSelectedTaskId(undefined), setSelection(item))} /></div></TabsContent>
            <TabsContent value="photos">
              {!photos.length ? <p className="text-sm text-slate-500">この工事の日報写真はまだありません。</p> : (
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {photos.slice(0, 18).map((report) => (
                    <figure key={report.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                      <SitePhoto photoUrl={report.photoUrl} caption={report.photoCaption} projectName={project.name} reportDate={report.reportDate} />
                      <figcaption className="p-3 text-sm">{report.photoCaption}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>
      <aside className="min-w-0 space-y-5">
        <div className={panelClass} data-tour="task-inspector"><h2 className="mb-3 text-xl font-black">選択中の作業</h2><TaskInspector task={projectTasks.find((item) => item.id === selectedTaskId)} selection={selection} workTypes={workTypes.data ?? []} ky={projectKy} incidents={projectIncidents} reports={projectReports} project={project} snapshot={snapshot} onRegenerate={() => setRegenerate((value) => value + 1)} /></div>
        <div className={panelClass} data-tour="review-queue"><h2 className="text-xl font-black">監督確認</h2><p className="mb-4 mt-1 text-sm text-slate-500">Cowork から提出された日報と工程進捗を確認し、承認・修正・差戻しを行います。</p><ReviewQueue reports={projectReports} tasks={projectTasks} /></div>
        <div className="flex flex-wrap gap-2"><Button asChild><Link to="/ky/new">KY を開始</Link></Button><Button asChild variant="outline"><Link to="/incidents"><ShieldAlert className="mr-2 h-4 w-4" />ヒヤリハット</Link></Button><Button asChild variant="outline"><Link to="/reports">日報</Link></Button></div>
      </aside>
    </div>
  </div>
}

export default function ProjectDetail() {
  const { projectId = "" } = useParams()
  return projectId ? <Workspace projectId={projectId} /> : <ProjectPortfolio />
}

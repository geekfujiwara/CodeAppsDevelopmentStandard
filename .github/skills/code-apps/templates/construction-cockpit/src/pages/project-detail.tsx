import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  Activity,
  CalendarRange,
  ChevronRight,
  GitBranch,
  MapPin,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import "@xyflow/react/dist/style.css"
import { ConstructionService } from "@/services/construction-service"
import { Button } from "@/components/ui/button"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectGanttFlow, type FlowSelection } from "@/components/project-gantt-flow"
import { ProjectRelationshipFlow } from "@/components/project-relationship-flow"
import { useProject } from "@/state/project-state"

const panelClass = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"

export default function ProjectDetail() {
  const { projectId: routeProjectId = "" } = useParams()
  const navigate = useNavigate()
  const projectContext = useProject()
  const [selection, setSelection] = useState<FlowSelection | null>(null)
  const projects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const equipment = useQuery({ queryKey: ["equipment"], queryFn: ConstructionService.equipment })
  const equipmentUsage = useQuery({ queryKey: ["equipment-usage"], queryFn: ConstructionService.equipmentUsage })
  const queries = [projects, tasks, reports, incidents, ky, knowledge, equipment, equipmentUsage]

  const activeProjectId = routeProjectId || projectContext.selectedProjectId || projects.data?.[0]?.id || ""
  const project = projects.data?.find((item) => item.id === activeProjectId)

  useEffect(() => {
    if (project && projectContext.selectedProjectId !== project.id) projectContext.setSelectedProjectId(project.id)
  }, [project, projectContext])

  const related = useMemo(() => {
    const projectTasks = tasks.data?.filter((item) => item.projectId === activeProjectId) ?? []
    const projectReports = reports.data?.filter((item) => item.projectId === activeProjectId) ?? []
    const projectIncidents = incidents.data?.filter((item) => item.projectId === activeProjectId) ?? []
    const projectKy = ky.data?.filter((item) => item.projectId === activeProjectId) ?? []
    return { projectTasks, projectReports, projectIncidents, projectKy }
  }, [activeProjectId, incidents.data, ky.data, reports.data, tasks.data])

  if (queries.some((query) => query.isLoading)) return <LoadingSkeletonGrid count={4} columns={2} />
  if (queries.some((query) => query.error)) {
    return <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">工事データを読み込めませんでした。</p>
  }
  if (!project) return <p className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">工事が見つかりません。</p>

  const selectProject = (id: string) => {
    setSelection(null)
    navigate(`/projects/${id}`)
  }
  const metrics: Array<[string, string | number, LucideIcon]> = [
    ["全体進捗", `${project.progress}%`, Activity],
    ["作業", related.projectTasks.length, CalendarRange],
    ["安全記録", related.projectKy.length + related.projectIncidents.length, ShieldAlert],
    ["関連データ", related.projectReports.length + related.projectTasks.length + related.projectKy.length + related.projectIncidents.length, GitBranch],
  ]

  return (
    <div className="mx-auto min-w-0 max-w-[110rem] space-y-5">
      <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
        <div className="grid min-w-0 items-end gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-black text-slate-950">PROJECT WORKSPACE</span>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                project.status === 100000002 ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-slate-200"
              }`}>
                {project.status === 100000001 ? "施工中" : project.status === 100000002 ? "完了" : "計画中"}
              </span>
            </div>
            <h1 className="text-3xl font-black leading-tight [overflow-wrap:anywhere] sm:text-4xl">{project.name}</h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
              <span>{project.projectNo}</span>
              <span>{project.client}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-cyan-300" />{project.address}</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link to="/ky"><Sparkles className="mr-2 h-4 w-4" />KY を開始</Link>
            </Button>
            <Button asChild variant="outline" className="border-slate-600 bg-transparent text-white hover:bg-slate-800 hover:text-white">
              <Link to="/incidents"><ShieldAlert className="mr-2 h-4 w-4" />ヒヤリハット</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(([label, value, Icon]) => (
          <article key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Icon className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
            <p className="mt-4 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
          </article>
        ))}
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
        <aside className={`${panelClass} min-w-0`}>
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">工事一覧</h2>
          <div className="mt-4 space-y-2">
            {projects.data?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectProject(item.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  item.id === project.id
                    ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/60"
                    : "border-slate-200 hover:border-cyan-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                }`}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm font-bold [overflow-wrap:anywhere]">{item.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </span>
                <span className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{item.projectNo}</span><span>{item.progress}%</span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <span className="block h-full rounded-full bg-cyan-500" style={{ width: `${item.progress}%` }} />
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <Tabs defaultValue="gantt" className="min-w-0">
            <TabsList className="h-12 w-full justify-start rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              <TabsTrigger value="gantt" className="gap-2"><CalendarRange className="h-4 w-4" />工程ガント</TabsTrigger>
              <TabsTrigger value="network" className="gap-2"><GitBranch className="h-4 w-4" />データ関係</TabsTrigger>
            </TabsList>
            <TabsContent value="gantt" className="mt-3 min-w-0">
              <ProjectGanttFlow project={project} tasks={related.projectTasks} onSelect={setSelection} />
            </TabsContent>
            <TabsContent value="network" className="mt-3 min-w-0">
              <ProjectRelationshipFlow
                project={project}
                tasks={related.projectTasks}
                reports={related.projectReports}
                incidents={related.projectIncidents}
                kyActivities={related.projectKy}
                knowledge={knowledge.data ?? []}
                equipment={equipment.data ?? []}
                equipmentUsage={equipmentUsage.data ?? []}
                onSelect={setSelection}
              />
            </TabsContent>
          </Tabs>
        </section>

        <aside className={`${panelClass} xl:col-span-2 2xl:col-span-1`}>
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">選択したデータ</h2>
          {selection ? (
            <div className="mt-4">
              <span className="inline-flex rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">{selection.kind}</span>
              <h3 className="mt-4 text-xl font-black [overflow-wrap:anywhere]">{selection.title}</h3>
              <p className="mt-1 text-sm text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">{selection.subtitle}</p>
              <p className="mt-5 text-sm leading-7 [overflow-wrap:anywhere]">{selection.detail}</p>
              {selection.progress !== undefined && (
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs"><span>進捗</span><strong>{selection.progress}%</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-cyan-500" style={{ width: `${selection.progress}%` }} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm leading-7 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              ガントまたは関係グラフのノードを選ぶと詳細を表示します。
            </div>
          )}
          <dl className="mt-6 space-y-3 border-t border-slate-200 pt-5 text-sm dark:border-slate-800">
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">工期</dt><dd className="mt-1 font-semibold">{project.startDate.slice(0, 10)} — {project.endDate.slice(0, 10)}</dd></div>
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">現場代理人</dt><dd className="mt-1 font-semibold">{project.siteManager || "未設定"}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  )
}

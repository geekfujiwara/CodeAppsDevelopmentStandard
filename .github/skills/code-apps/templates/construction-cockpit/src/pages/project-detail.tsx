import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Activity, CalendarRange, GitBranch, MapPin, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react"
import "@xyflow/react/dist/style.css"
import { ConstructionService } from "@/services/construction-service"
import { Button } from "@/components/ui/button"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectGanttFlow, type FlowSelection } from "@/components/project-gantt-flow"
import { ProjectRelationshipFlow } from "@/components/project-relationship-flow"
import { useProject } from "@/state/project-state"

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
    return <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-destructive">工事データを読み込めませんでした。</p>
  }
  if (!project) return <p className="rounded-2xl border p-6">工事が見つかりません。</p>

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
    <div className="orbit-shell min-w-0">
      <header className="orbit-hero">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="orbit-kicker">PROJECT ORBIT</span>
            <span className="orbit-status">{project.status === 100000001 ? "施工中" : project.status === 100000002 ? "完了" : "計画中"}</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight [overflow-wrap:anywhere] md:text-4xl">{project.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{project.projectNo}</span>
            <span>{project.client}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{project.address}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild><Link to="/ky"><Sparkles className="mr-2 h-4 w-4" />KY を開始</Link></Button>
          <Button asChild variant="outline"><Link to="/incidents"><ShieldAlert className="mr-2 h-4 w-4" />ヒヤリハット</Link></Button>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)_minmax(14rem,18rem)] gap-4 max-2xl:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] max-xl:grid-cols-1">
        <aside className="orbit-panel min-w-0">
          <p className="orbit-panel-label">PORTFOLIO</p>
          <div className="mt-4 space-y-2">
            {projects.data?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectProject(item.id)}
                className={`orbit-project-button ${item.id === project.id ? "is-active" : ""}`}
              >
                <span className="block [overflow-wrap:anywhere]">{item.name}</span>
                <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{item.projectNo}</span><span>{item.progress}%</span>
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${item.progress}%` }} />
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-4 grid grid-cols-4 gap-3 max-md:grid-cols-2">
            {metrics.map(([label, value, Icon]) => (
              <div key={String(label)} className="orbit-metric min-w-0">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-2xl font-black">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          <Tabs defaultValue="gantt" className="min-w-0">
            <TabsList className="orbit-tabs h-11">
              <TabsTrigger value="gantt"><CalendarRange />工程ガント</TabsTrigger>
              <TabsTrigger value="network"><GitBranch />データ関係</TabsTrigger>
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
        </main>

        <aside className="orbit-panel min-w-0 max-2xl:col-span-2 max-xl:col-span-1">
          <p className="orbit-panel-label">INSPECTOR</p>
          {selection ? (
            <div className="mt-4">
              <span className="orbit-node-kind">{selection.kind}</span>
              <h2 className="mt-3 text-xl font-black [overflow-wrap:anywhere]">{selection.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{selection.subtitle}</p>
              <p className="mt-5 text-sm leading-7 [overflow-wrap:anywhere]">{selection.detail}</p>
              {selection.progress !== undefined && (
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs"><span>進捗</span><strong>{selection.progress}%</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${selection.progress}%` }} /></div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed p-5 text-sm leading-7 text-muted-foreground">
              ガントまたは関係グラフのノードを選択すると、ここに詳細が表示されます。グラフはドラッグ、パン、ズームできます。
            </div>
          )}
          <div className="mt-6 border-t pt-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Project window</p>
            <p className="mt-3 text-sm">{project.startDate.slice(0, 10)} — {project.endDate.slice(0, 10)}</p>
            <p className="mt-2 text-sm text-muted-foreground">現場代理人: {project.siteManager || "未設定"}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

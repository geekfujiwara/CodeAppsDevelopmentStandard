import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { isAfter, parseISO, subYears } from "date-fns"
import { Link } from "react-router-dom"
import { ArrowUpRight, Building2, CheckCircle2, Gauge, MapPinned, ShieldAlert } from "lucide-react"
import { ConstructionService, type Project } from "@/services/construction-service"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { GoogleMapEmbed } from "@/components/google-map-embed"

function MapPortfolio({ title, eyebrow, projects, accent }: {
  title: string
  eyebrow: string
  projects: Project[]
  accent: "cyan" | "lime"
}) {
  return (
    <section className="orbit-map-section min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={`orbit-kicker ${accent === "lime" ? "is-lime" : ""}`}>{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-black">{title}</h2>
        </div>
        <span className="text-sm text-muted-foreground">{projects.length} 件</span>
      </header>
      {projects.length ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4">
          {projects.map((project) => (
            <article key={project.id} className="orbit-map-card min-w-0">
              <GoogleMapEmbed
                latitude={project.latitude}
                longitude={project.longitude}
                address={project.address}
                label={project.name}
                zoom={14}
                className="h-52"
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">{project.projectNo}</p>
                    <h3 className="mt-1 text-lg font-black [overflow-wrap:anywhere]">{project.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{project.address}</p>
                  </div>
                  <Link to={`/projects/${project.id}`} className="orbit-icon-link" aria-label={`${project.name}を開く`}>
                    <ArrowUpRight className="h-5 w-5" />
                  </Link>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${accent === "lime" ? "bg-lime-500" : "bg-cyan-500"}`} style={{ width: `${project.progress}%` }} />
                  </div>
                  <strong className="text-sm">{project.progress}%</strong>
                </div>
                <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>{project.client}</span>
                  <span>{project.startDate.slice(0, 10)} — {project.endDate.slice(0, 10)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed p-8 text-center text-muted-foreground">対象工事はありません。</div>
      )}
    </section>
  )
}

export default function SiteMap() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })

  const portfolio = useMemo(() => {
    const now = new Date()
    const cutoff = subYears(now, 1)
    const active = projects.data?.filter((project) => project.status === 100000001) ?? []
    const completed = projects.data?.filter((project) => {
      if (project.status !== 100000002 || !project.endDate) return false
      const date = parseISO(project.endDate)
      return !Number.isNaN(date.getTime()) && isAfter(date, cutoff)
    }) ?? []
    const average = active.length ? Math.round(active.reduce((sum, project) => sum + project.progress, 0) / active.length) : 0
    const highRisk = ky.data?.filter((item) => item.riskLevel === 100000000).length ?? 0
    return { active, completed, average, highRisk }
  }, [ky.data, projects.data])

  if (projects.isLoading || incidents.isLoading || ky.isLoading) return <LoadingSkeletonGrid count={4} columns={2} />
  if (projects.error || incidents.error || ky.error) {
    return <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-destructive">現場データを取得できませんでした。</p>
  }

  const metrics = [
    ["施工中", portfolio.active.length, Building2],
    ["1年以内に完了", portfolio.completed.length, CheckCircle2],
    ["施工中の平均進捗", `${portfolio.average}%`, Gauge],
    ["高リスク KY", portfolio.highRisk, ShieldAlert],
  ] as const

  return (
    <div className="orbit-shell min-w-0">
      <header className="orbit-hero">
        <div>
          <p className="orbit-kicker">GEOSPATIAL PORTFOLIO</p>
          <h1 className="mt-3 flex items-center gap-3 text-3xl font-black tracking-tight md:text-4xl">
            <MapPinned className="h-8 w-8 text-primary" />現場ポートフォリオ
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">施工中の工事と直近1年間に完了した工事を、Google Maps と工程データで俯瞰します。</p>
        </div>
        <Link to="/projects" className="orbit-primary-link">工事オービットを開く <ArrowUpRight className="h-4 w-4" /></Link>
      </header>

      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {metrics.map(([label, value, Icon]) => (
          <div key={label} className="orbit-metric min-w-0">
            <Icon className="h-5 w-5 text-primary" />
            <span className="text-2xl font-black">{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <MapPortfolio title="建設中の工事" eyebrow="LIVE CONSTRUCTION" projects={portfolio.active} accent="cyan" />
      <MapPortfolio title="直近1年間の完了工事" eyebrow="COMPLETED / 12 MONTHS" projects={portfolio.completed} accent="lime" />
    </div>
  )
}

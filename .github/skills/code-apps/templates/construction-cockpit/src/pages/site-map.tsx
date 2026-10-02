import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { isAfter, parseISO, subYears } from "date-fns"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Gauge,
  MapPinned,
  ShieldAlert,
} from "lucide-react"
import { ConstructionService, type Project } from "@/services/construction-service"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { GoogleMapEmbed } from "@/components/google-map-embed"

function ProjectMapCard({ project, completed }: { project: Project; completed: boolean }) {
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <GoogleMapEmbed
        latitude={project.latitude}
        longitude={project.longitude}
        address={project.address}
        label={project.name}
        zoom={14}
        className="h-56 rounded-none"
      />
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${
                completed
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300"
              }`}>
                {completed ? "完了" : "施工中"}
              </span>
              <span className="text-xs font-bold tracking-[0.12em] text-slate-500 dark:text-slate-400">{project.projectNo}</span>
            </div>
            <h3 className="mt-3 text-xl font-black leading-tight text-slate-950 [overflow-wrap:anywhere] dark:text-white">{project.name}</h3>
            <p className="mt-2 text-sm text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">{project.address}</p>
          </div>
          <Link
            to={`/projects/${project.id}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white transition hover:bg-cyan-500 hover:text-slate-950 dark:bg-cyan-400 dark:text-slate-950"
            aria-label={`${project.name}を開く`}
          >
            <ArrowUpRight className="h-5 w-5" />
          </Link>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>進捗</span>
            <span>{project.progress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full ${completed ? "bg-emerald-500" : "bg-cyan-500"}`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
          <div className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-slate-400">発注者</dt>
            <dd className="mt-1 font-semibold [overflow-wrap:anywhere]">{project.client}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-slate-400">工期</dt>
            <dd className="mt-1 font-semibold">{project.startDate.slice(0, 10)}<br />{project.endDate.slice(0, 10)}</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

function PortfolioSection({ title, description, projects, completed = false }: {
  title: string
  description: string
  projects: Project[]
  completed?: boolean
}) {
  return (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-800 dark:bg-slate-900">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
            {completed ? "Completed / 12 months" : "Live construction"}
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {projects.length} 件
        </span>
      </header>

      {projects.length ? (
        <div className="mt-6 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-5">
          {projects.map((project) => <ProjectMapCard key={project.id} project={project} completed={completed} />)}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
          対象工事はありません。
        </div>
      )}
    </section>
  )
}

export default function SiteMap() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })

  const portfolio = useMemo(() => {
    const cutoff = subYears(new Date(), 1)
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
    return <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">現場データを取得できませんでした。</p>
  }

  const metrics = [
    ["施工中", portfolio.active.length, "件", Building2],
    ["1年以内に完了", portfolio.completed.length, "件", CheckCircle2],
    ["平均進捗", portfolio.average, "%", Gauge],
    ["高リスク KY", portfolio.highRisk, "件", ShieldAlert],
  ] as const

  return (
    <div className="mx-auto min-w-0 max-w-[100rem] space-y-6">
      <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
        <div className="grid min-w-0 items-end gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-10">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-200">
                <MapPinned className="h-4 w-4" /> 現場ポートフォリオ
              </span>
              <span className="text-xs font-semibold text-slate-400">リアルタイム工事運営</span>
            </div>
            <h1 className="max-w-4xl text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
              現場の状況を、<span className="text-cyan-300">地図から判断する。</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              施工中と直近完了の工事を、位置・工程・安全情報とともに俯瞰します。
            </p>
          </div>
          <Link
            to="/projects"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
          >
            工事ワークスペース <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(([label, value, unit, Icon]) => (
          <article key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-bold text-slate-400">LIVE</span>
            </div>
            <p className="mt-5 text-3xl font-black text-slate-950 dark:text-white">{value}<span className="ml-1 text-sm text-slate-500">{unit}</span></p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
          </article>
        ))}
      </section>

      <PortfolioSection title="建設中の工事" description="現在進行中の現場を位置と進捗で確認します。" projects={portfolio.active} />
      <PortfolioSection title="直近1年間の完了工事" description="過去12か月に完了した工事を振り返ります。" projects={portfolio.completed} completed />
    </div>
  )
}

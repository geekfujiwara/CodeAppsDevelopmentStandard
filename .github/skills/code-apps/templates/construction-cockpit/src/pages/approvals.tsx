import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { AlertTriangle, Bot, Camera, CheckCircle2, ExternalLink, ImageOff, Loader2, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { ProjectSearch, UserSearch } from "@/components/entity-search"
import { ConstructionService, type AppUser, type DailyReport, type Project, type ProgressEntry, type ReportPhoto, type Task } from "@/services/construction-service"
import { buildBundles, parseApprovedValue, REVIEW, standaloneTaskSubmissions, type ApprovalView, type Bundle } from "@/lib/approval-queue"
import { WEATHER_LABEL } from "@/lib/record-labels"

const panel = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
const VIEWS: Array<[ApprovalView, string]> = [["pending", "確認待ち"], ["returned", "差戻し中"], ["approved", "承認済み"]]
type ReportBundle = Bundle<DailyReport, ProgressEntry, ReportPhoto, Task>

const formatDateTime = (value: string) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" }) : ""
}

function PhotoViewer({ photo, onClose }: { photo: ReportPhoto; onClose: () => void }) {
  const full = useQuery({ queryKey: ["report-photo-full", photo.id, photo.version], queryFn: () => ConstructionService.reportPhotoFull(photo.id), staleTime: Infinity })
  const src = full.data || (photo.thumbnail ? `data:image/jpeg;base64,${photo.thumbnail}` : "")
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label={photo.caption || "現場写真"} onClick={onClose}>
      <figure className="max-h-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 p-3">
          <figcaption className="text-sm font-bold [overflow-wrap:anywhere]">{photo.caption || photo.name}{photo.takenOn && <span className="ml-2 font-normal text-slate-500">撮影 {formatDateTime(photo.takenOn)}</span>}</figcaption>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="閉じる"><X className="h-4 w-4" /></Button>
        </div>
        {full.isLoading && !src ? <div className="grid h-80 w-[min(80vw,48rem)] place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          : src ? <img src={src} alt={photo.caption || "現場写真"} className="max-h-[78vh] w-auto object-contain" />
            : <p className="p-6 text-sm text-rose-700">写真を読み込めませんでした。</p>}
        {full.isLoading && src && <p className="p-2 text-xs text-slate-500">フルサイズを読み込み中…（サムネイルを表示しています）</p>}
      </figure>
    </div>
  )
}

function BundleCard({ bundle, project, pending }: { bundle: ReportBundle; project?: Project; pending: boolean }) {
  const queryClient = useQueryClient()
  const { report, entries, photos, warnings } = bundle
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(entries.map(({ entry }) => [entry.id, String(entry.reportedProgress)])))
  const [comment, setComment] = useState("")
  const [viewing, setViewing] = useState<ReportPhoto>()
  const invalid = entries.filter(({ entry }) => parseApprovedValue(values[entry.id] ?? "") === undefined)
  const refresh = () => Promise.all(["reports", "progress-entries", "tasks", "report-photos"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
  const approve = useMutation({
    mutationFn: () => ConstructionService.approveReportBundle(report.id, entries.map(({ entry }) => ({ entry, value: parseApprovedValue(values[entry.id]) ?? entry.reportedProgress })), comment),
    onSuccess: async () => { await refresh(); toast.success(entries.length ? `承認しました。${entries.length} 件の作業の進捗と 3D に反映しました。` : "日報を承認しました。") },
    onError: async (error) => { await refresh(); toast.error(error instanceof Error ? error.message : "承認できませんでした。") },
  })
  const sendBack = useMutation({
    mutationFn: () => ConstructionService.returnReportBundle(report.id, entries.map(({ entry }) => entry), comment),
    onSuccess: async () => { await refresh(); toast.success("差し戻しました。報告者は Teams のアシスタントで修正して再提出できます。") },
    onError: (error) => toast.error(error instanceof Error ? error.message : "差し戻せませんでした。"),
  })
  const busy = approve.isPending || sendBack.isPending
  const changed = entries.some(({ entry }) => Number(values[entry.id]) !== entry.reportedProgress)

  return (
    <article className={panel} data-approval-report={report.id}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{report.reportDate.slice(0, 10)}</span>
            {report.aiDrafted && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-violet-800"><Bot className="h-3.5 w-3.5" />Teams のアシスタントから</span>}
            <span className="text-slate-500">{WEATHER_LABEL[report.weather] ?? ""} · {report.workers} 人</span>
          </div>
          <h2 className="mt-1 text-lg font-black [overflow-wrap:anywhere]">{project?.name ?? "（工事不明）"}</h2>
          <p className="text-sm text-slate-500">報告者 {report.createdBy || "不明"}{report.createdOn && ` · 提出 ${formatDateTime(report.createdOn)}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {project && <Button asChild size="sm" variant="outline"><Link to={`/projects/${project.id}`}><ExternalLink className="mr-1 h-4 w-4" />工事の 3D と工程</Link></Button>}
          <Button asChild size="sm" variant="ghost"><Link to={`/reports/${report.id}`}>日報の詳細</Link></Button>
        </div>
      </header>

      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <div className="md:col-span-2"><dt className="text-xs font-black text-slate-500">作業内容</dt><dd className="whitespace-pre-line [overflow-wrap:anywhere]">{report.workDetail || "未入力"}</dd></div>
        <div><dt className="text-xs font-black text-slate-500">明日の予定 / 特記事項</dt><dd className="whitespace-pre-line [overflow-wrap:anywhere]">{report.nextPlan || "—"}{report.remarks && `\n${report.remarks}`}</dd></div>
      </dl>

      <section className="mt-4" aria-label="現場写真">
        <h3 className="flex items-center gap-1 text-xs font-black text-slate-500"><Camera className="h-4 w-4" />現場写真（{photos.length}）</h3>
        {!photos.length ? <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><ImageOff className="h-4 w-4" />写真はありません。</p> : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {photos.map((photo) => (
              <button key={photo.id} type="button" onClick={() => setViewing(photo)} className="group overflow-hidden rounded-xl border border-slate-200 text-left dark:border-slate-800" data-approval-photo>
                {photo.thumbnail ? <img src={`data:image/jpeg;base64,${photo.thumbnail}`} alt={photo.caption || "現場写真"} className="aspect-[4/3] w-full object-cover transition group-hover:scale-105" />
                  : <span className="grid aspect-[4/3] place-items-center bg-slate-100 text-xs text-slate-500 dark:bg-slate-800">プレビューなし</span>}
                <span className="block truncate px-2 py-1 text-xs">{photo.caption || photo.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4" aria-label="進捗の報告">
        <h3 className="text-xs font-black text-slate-500">進捗の報告（承認すると作業の進捗と 3D に反映）</h3>
        {!entries.length ? <p className="mt-1 text-sm text-slate-500">この日報には進捗の報告がありません。</p> : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-950"><tr><th className="p-2">作業</th><th className="p-2">現在</th><th className="p-2">報告</th><th className="p-2">施工単位・根拠</th><th className="p-2">{pending ? "承認する進捗" : "承認値"}</th></tr></thead>
              <tbody>
                {entries.map(({ entry, task }) => {
                  const bad = pending && parseApprovedValue(values[entry.id] ?? "") === undefined
                  return (
                    <tr key={entry.id} className="border-t border-slate-100 align-top dark:border-slate-800" data-approval-entry={entry.id}>
                      <td className="p-2 font-bold [overflow-wrap:anywhere]">{task?.name ?? "（作業不明）"}</td>
                      <td className="p-2">{task ? `${task.progress}%` : "—"}</td>
                      <td className="p-2 font-black text-cyan-700 dark:text-cyan-300">{entry.reportedProgress}%</td>
                      <td className="p-2 text-xs [overflow-wrap:anywhere]">{entry.completedUnit && <span className="block font-bold">{entry.completedUnit} まで</span>}{entry.note}</td>
                      <td className="p-2">
                        {pending ? (
                          <label className="flex items-center gap-1">
                            <span className="sr-only">{task?.name} の承認する進捗</span>
                            <input inputMode="numeric" value={values[entry.id] ?? ""} onChange={(event) => setValues((value) => ({ ...value, [entry.id]: event.target.value }))} className={`h-9 w-20 rounded-lg border px-2 ${bad ? "border-rose-500" : "border-slate-300 dark:border-slate-700"} bg-white dark:bg-slate-950`} aria-invalid={bad} />%
                          </label>
                        ) : `${entry.approvedProgress || entry.reportedProgress}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" aria-label="確認が必要な点">
          {warnings.map((warning, index) => <li key={`${warning.kind}-${warning.entryId ?? index}`} className="flex gap-1"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning.message}</li>)}
        </ul>
      )}
      {report.reviewComment && <p className={`mt-3 rounded-xl p-3 text-sm ${report.reviewStatus === REVIEW.returned ? "bg-rose-50 text-rose-900" : "bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>監督コメント: {report.reviewComment}</p>}

      {pending && (
        <div className="mt-4 space-y-2">
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="監督コメント（差戻しは必須。承認時は任意）" rows={2} className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" aria-label="監督コメント" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || invalid.length > 0} onClick={() => approve.mutate()} data-approval-action="approve">
              {approve.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{changed ? "修正して承認・反映" : entries.length ? "承認して進捗に反映" : "承認"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => (comment.trim() ? sendBack.mutate() : toast.error("差戻し理由を入力してください。"))} data-approval-action="return">
              <RotateCcw className="mr-1 h-4 w-4" />差戻し
            </Button>
            {invalid.length > 0 && <span className="self-center text-xs text-rose-700">承認する進捗は 0〜100 の整数で入力してください。</span>}
          </div>
        </div>
      )}
      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(undefined)} />}
    </article>
  )
}

function TaskSubmissions({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const queryClient = useQueryClient()
  const [comments, setComments] = useState<Record<string, string>>({})
  const review = useMutation({
    mutationFn: ({ task, action }: { task: Task; action: "approve" | "return" }) => ConstructionService.reviewTask(task.id, action, comments[task.id] ?? "", task.reportedProgress),
    onSuccess: async (_, { action }) => { await queryClient.invalidateQueries({ queryKey: ["tasks"] }); toast.success(action === "approve" ? "承認し、進捗と 3D に反映しました。" : "差し戻しました。") },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新できませんでした。"),
  })
  if (!tasks.length) return null
  return (
    <section className={panel} aria-label="日報以外の進捗の提出">
      <h2 className="text-lg font-black">日報以外からの進捗の提出（{tasks.length}）</h2>
      <p className="text-sm text-slate-500">工事ワークスペースや「進捗を報告」から提出された作業の進捗です。</p>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-wrap items-center gap-3 py-3" data-approval-task={task.id}>
            <div className="min-w-0 flex-1">
              <p className="font-bold [overflow-wrap:anywhere]">{task.name}</p>
              <p className="text-xs text-slate-500">{projects.find((project) => project.id === task.projectId)?.name} · 現在 {task.progress}% → 報告 <span className="font-black text-cyan-700">{task.reportedProgress}%</span></p>
            </div>
            <input value={comments[task.id] ?? ""} onChange={(event) => setComments((value) => ({ ...value, [task.id]: event.target.value }))} placeholder="コメント（差戻しは必須）" className="h-9 w-56 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" aria-label={`${task.name} のコメント`} />
            <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ task, action: "approve" })}>承認</Button>
            <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ task, action: "return" })}>差戻し</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Approvals() {
  const [view, setView] = useState<ApprovalView>("pending")
  const [project, setProject] = useState<Project>()
  const [user, setUser] = useState<AppUser>()
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const entries = useQuery({ queryKey: ["progress-entries"], queryFn: ConstructionService.progressEntries })
  const photos = useQuery({ queryKey: ["report-photos"], queryFn: ConstructionService.reportPhotos })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const projects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const queries = [reports, entries, photos, tasks, projects]
  const projectById = useMemo(() => new Map((projects.data ?? []).map((item) => [item.id, item])), [projects.data])
  const bundles = useMemo(() => buildBundles(reports.data ?? [], entries.data ?? [], photos.data ?? [], tasks.data ?? [], { view, projectId: project?.id, userId: user?.id }),
    [entries.data, photos.data, project?.id, reports.data, tasks.data, user?.id, view])
  const standalone = useMemo(() => (view === "pending" && !user ? standaloneTaskSubmissions(tasks.data ?? [], entries.data ?? [], project?.id) : []), [entries.data, project?.id, tasks.data, user, view])
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([key]) => [key, buildBundles(reports.data ?? [], [], [], [], { view: key, projectId: project?.id, userId: user?.id }).length])), [project?.id, reports.data, user?.id])

  return (
    <div className="mx-auto max-w-[100rem] space-y-5" data-tour="approvals">
      <header>
        <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">現場監督</p>
        <h1 className="text-3xl font-black">承認待ち</h1>
        <p className="mt-1 text-slate-500">Teams のアシスタントやアプリから提出された日報・現場写真・進捗を確認します。承認すると作業の進捗と工事の 3D に反映され、差し戻すと報告者が修正して再提出できます。</p>
      </header>
      <section className={`${panel} space-y-3`} aria-label="絞り込み">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="状態">
          {VIEWS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${view === key ? "bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"}`}>
              {label}<span className="ml-1 opacity-80">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ProjectSearch label="工事で絞り込み" selected={project} onSelect={setProject} />
          <UserSearch label="報告者で絞り込み" selected={user} onSelect={setUser} />
        </div>
      </section>
      {queries.some((query) => query.isLoading) ? <LoadingSkeletonGrid count={3} columns={1} />
        : queries.some((query) => query.error) ? <p className="rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-800" role="alert">承認待ちの一覧を読み込めませんでした。時間をおいて再度お試しください。</p>
          : <>
            <TaskSubmissions tasks={standalone} projects={projects.data ?? []} />
            {!bundles.length ? (
              <p className={`${panel} text-center text-slate-500`}>{view === "pending" ? "確認待ちの日報はありません。" : view === "returned" ? "差戻し中の日報はありません。" : "承認済みの日報はありません。"}{(project || user) && " 絞り込みを解除すると他の提出も表示されます。"}</p>
            ) : bundles.slice(0, 30).map((bundle) => <BundleCard key={`${bundle.report.id}-${view}`} bundle={bundle} project={projectById.get(bundle.report.projectId)} pending={view === "pending"} />)}
            {bundles.length > 30 && <p className="text-center text-sm text-slate-500">先頭の 30 件を表示しています（確認待ちは古い順）。工事や報告者で絞り込んでください。</p>}
          </>}
    </div>
  )
}

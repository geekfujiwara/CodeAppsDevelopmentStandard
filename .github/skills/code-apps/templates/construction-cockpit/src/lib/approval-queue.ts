// 監督の承認待ち一覧: 日報・写真・進捗報告を 1 件の「提出」にまとめ、承認前に気をつける点を判定する（ブラウザ / Node 共通）。

export const REVIEW = { draft: 100000000, submitted: 100000001, approved: 100000002, returned: 100000003 } as const
export type ApprovalView = "pending" | "returned" | "approved"

type ReportLike = { id: string; projectId: string; reportDate: string; reviewStatus: number; createdById: string; createdOn: string }
type EntryLike = { id: string; reportId: string; taskId: string; reportedProgress: number; previousProgress: number; reviewStatus: number; createdById: string }
type PhotoLike = { id: string; reportId: string }
type TaskLike = { id: string; name: string; projectId: string; progress: number; reviewStatus: number }

export type BundleWarning = { entryId?: string; kind: "lower" | "stale" | "missing-task" | "no-photo" | "jump"; message: string }
export type Bundle<R, E, P, T> = { report: R; entries: Array<{ entry: E; task?: T }>; photos: P[]; warnings: BundleWarning[] }

const VIEW_STATUS: Record<ApprovalView, number> = { pending: REVIEW.submitted, returned: REVIEW.returned, approved: REVIEW.approved }

/** 進捗の注意点。承認を止めはしないが、監督が見落とさないよう画面に出す */
export function entryWarnings(entry: EntryLike, task: TaskLike | undefined, pending: boolean): BundleWarning[] {
  if (!task) return [{ entryId: entry.id, kind: "missing-task", message: "対象の作業が見つかりません（削除された可能性があります）。" }]
  const warnings: BundleWarning[] = []
  if (!pending) return warnings
  if (entry.reportedProgress < task.progress) warnings.push({ entryId: entry.id, kind: "lower", message: `報告値 ${entry.reportedProgress}% が現在の進捗 ${task.progress}% より低くなっています。` })
  if (entry.previousProgress !== task.progress) warnings.push({ entryId: entry.id, kind: "stale", message: `報告後に作業の進捗が ${entry.previousProgress}% → ${task.progress}% に変わっています。` })
  if (entry.reportedProgress - task.progress >= 40) warnings.push({ entryId: entry.id, kind: "jump", message: `1 日で ${entry.reportedProgress - task.progress} ポイントの増加です。写真と内容を確認してください。` })
  return warnings
}

export function buildBundles<R extends ReportLike, E extends EntryLike, P extends PhotoLike, T extends TaskLike>(
  reports: R[], entries: E[], photos: P[], tasks: T[],
  filter: { view: ApprovalView; projectId?: string; userId?: string },
): Bundle<R, E, P, T>[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const status = VIEW_STATUS[filter.view]
  const pending = filter.view === "pending"
  const bundles = reports
    .filter((report) => report.reviewStatus === status)
    .filter((report) => !filter.projectId || report.projectId === filter.projectId)
    .filter((report) => !filter.userId || report.createdById === filter.userId)
    .map((report) => {
      const reportEntries = entries.filter((entry) => entry.reportId === report.id)
      const reportPhotos = photos.filter((photo) => photo.reportId === report.id)
      const items = reportEntries.map((entry) => ({ entry, task: taskById.get(entry.taskId) }))
      const warnings = items.flatMap(({ entry, task }) => entryWarnings(entry, task, pending))
      if (pending && !reportPhotos.length) warnings.push({ kind: "no-photo", message: "写真が添付されていません。" })
      return { report, entries: items, photos: reportPhotos, warnings }
    })
  // 確認待ちは古い提出から（滞留を先に片付ける）、それ以外は新しい順
  return bundles.sort((a, b) => (pending ? 1 : -1) * (a.report.createdOn || a.report.reportDate).localeCompare(b.report.createdOn || b.report.reportDate))
}

/** 日報に紐づかない工程進捗の提出（progress-3d-report スキルやワークスペースからの提出） */
export function standaloneTaskSubmissions<T extends TaskLike, E extends EntryLike>(tasks: T[], entries: E[], projectId?: string): T[] {
  const covered = new Set(entries.filter((entry) => entry.reviewStatus === REVIEW.submitted).map((entry) => entry.taskId))
  return tasks.filter((task) => task.reviewStatus === REVIEW.submitted && !covered.has(task.id) && (!projectId || task.projectId === projectId))
}

/** 承認する値の検証（0〜100 の整数） */
export function parseApprovedValue(text: string): number | undefined {
  if (!/^\s*\d{1,3}\s*$/.test(text)) return undefined
  const value = Number(text)
  return value >= 0 && value <= 100 ? value : undefined
}

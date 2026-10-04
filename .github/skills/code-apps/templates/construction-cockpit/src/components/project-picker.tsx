import { Building2 } from "lucide-react"
import { useProject } from "@/state/project-state"

/** 各業務画面の見出しに置く現場選択。選択は全画面で共有され、ブラウザに記憶される */
export function ProjectPicker({ className = "" }: { className?: string }) {
  const { projects, selectedProjectId, setSelectedProjectId, isLoading, error } = useProject()
  const selectable = projects.filter((project) => project.status !== 100000002)
  return (
    <label className={`flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`} data-tour="project-picker">
      <Building2 className="h-5 w-5 shrink-0 text-cyan-600" />
      <span className="shrink-0 text-sm font-bold">現場</span>
      <select
        className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        value={selectedProjectId}
        onChange={(event) => setSelectedProjectId(event.target.value)}
        disabled={isLoading || Boolean(error)}
        aria-label="現場を選択"
      >
        <option value="">{isLoading ? "読み込み中..." : error ? "現場を取得できません" : "現場を選択してください"}</option>
        {selectable.map((project) => <option key={project.id} value={project.id}>{project.projectNo} {project.name}</option>)}
      </select>
    </label>
  )
}

export function SelectProjectNotice() {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">上の「現場」から対象の工事を選択してください。</p>
}

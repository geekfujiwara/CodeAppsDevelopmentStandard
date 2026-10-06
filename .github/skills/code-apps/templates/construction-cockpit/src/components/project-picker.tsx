import { Building2 } from "lucide-react"
import { useProject } from "@/state/project-state"
import { ProjectSearch } from "@/components/entity-search"

/** 各業務画面の見出しに置く現場選択（Dataverse 検索のドロップダウン）。選択は全画面で共有され、ブラウザに記憶される */
export function ProjectPicker({ className = "" }: { className?: string }) {
  const { selectedProject, setSelectedProjectId, isLoading, error } = useProject()
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`} data-tour="project-picker">
      <Building2 className="h-5 w-5 shrink-0 text-cyan-600" />
      <span className="shrink-0 text-sm font-bold">現場</span>
      {error ? <span className="text-sm text-rose-700">現場を取得できません</span>
        : isLoading ? <span className="text-sm text-slate-500">読み込み中…</span>
          : <ProjectSearch label="現場を選択" className="flex-1" selected={selectedProject} onSelect={(project) => setSelectedProjectId(project?.id ?? "")} />}
    </div>
  )
}

export function SelectProjectNotice() {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">上の「現場」で工事番号や工事名を入力し、候補から対象の工事を選択してください。</p>
}

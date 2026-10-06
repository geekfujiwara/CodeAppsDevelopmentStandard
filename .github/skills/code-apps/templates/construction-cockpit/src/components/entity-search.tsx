import { SearchCombobox } from "@/components/search-combobox"
import { ConstructionService, type AppUser, type Project } from "@/services/construction-service"

const STATUS: Record<number, string> = { 100000000: "計画中", 100000001: "施工中", 100000002: "完了" }

/** 工事のドロップダウン検索（工事番号・名称・発注者・住所・現場代理人） */
export function ProjectSearch({ selected, onSelect, onSubmitText, className, label = "工事を検索" }: {
  selected?: Project
  onSelect: (project: Project | undefined) => void
  onSubmitText?: (term: string) => void
  className?: string
  label?: string
}) {
  return (
    <SearchCombobox<Project>
      label={label}
      placeholder="工事番号・工事名・発注者・住所で検索"
      selectedLabel={selected ? `${selected.projectNo} ${selected.name}` : undefined}
      search={ConstructionService.searchProjectOptions}
      idOf={(item) => item.id}
      labelOf={(item) => `${item.projectNo} ${item.name}`}
      onSelect={onSelect}
      onSubmitText={onSubmitText}
      className={className}
      tourId="project-search-combobox"
      renderItem={(item) => (
        <span className="block min-w-0">
          <span className="block truncate font-bold">{item.name}</span>
          <span className="block truncate text-xs text-slate-500">{item.projectNo} · {STATUS[item.status] ?? ""} · {item.client} · {item.address}</span>
        </span>
      )}
    />
  )
}

/** ユーザー（報告者・担当者）のドロップダウン検索（氏名・メール） */
export function UserSearch({ selected, onSelect, className, label = "ユーザーを検索" }: {
  selected?: AppUser
  onSelect: (user: AppUser | undefined) => void
  className?: string
  label?: string
}) {
  return (
    <SearchCombobox<AppUser>
      label={label}
      placeholder="氏名・メールで検索"
      selectedLabel={selected?.name}
      search={ConstructionService.searchUsers}
      idOf={(item) => item.id}
      labelOf={(item) => item.name}
      onSelect={onSelect}
      className={className}
      tourId="user-search-combobox"
      renderItem={(item) => (
        <span className="block min-w-0">
          <span className="block truncate font-bold">{item.name}</span>
          <span className="block truncate text-xs text-slate-500">{[item.title, item.email].filter(Boolean).join(" · ")}</span>
        </span>
      )}
    />
  )
}

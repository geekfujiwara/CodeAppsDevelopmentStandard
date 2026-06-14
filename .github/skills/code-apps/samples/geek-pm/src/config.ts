import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react"

export const PUBLISHER_PREFIX =
  import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME =
  import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "プロジェクト管理ポータル"
export const CODEAPPS_APP_SUBTITLE =
  import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "PM ポータル"
export const CODEAPPS_DOCUMENT_TITLE =
  import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "プロジェクト管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY =
  import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "pm-app-theme"
export const FEATURE_MEMBERS =
  import.meta.env.VITE_FEATURE_MEMBERS === "true"
export const FEATURE_REPORTS =
  import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard",  label: "ダッシュボード",    path: "/dashboard" },
  { key: "projects",   label: "プロジェクト",      path: "/projects" },
  { key: "tasks",      label: "タスク",             path: "/tasks" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_MEMBERS ? [{ key: "members", label: "メンバー", path: "/members" }] : []),
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート", path: "/reports" }] : []),
]

export const NAV_SECTIONS: NavSection[] = [
  { title: "メニュー", items: [...coreItems, ...conditionalItems] },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects:  FolderKanban,
  tasks:     CheckSquare,
  members:   Users,
  reports:   BarChart3,
}

import {
  LayoutDashboard,
  Ticket,
  BookOpen,
  BarChart3,
  type LucideIcon,
} from "lucide-react"

export const PUBLISHER_PREFIX =
  import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME =
  import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "ヘルプデスクポータル"
export const CODEAPPS_APP_SUBTITLE =
  import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "サポート管理"
export const CODEAPPS_DOCUMENT_TITLE =
  import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "ヘルプデスクポータル"
export const CODEAPPS_THEME_STORAGE_KEY =
  import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "helpdesk-app-theme"
export const FEATURE_KNOWLEDGE =
  import.meta.env.VITE_FEATURE_KNOWLEDGE === "true"
export const FEATURE_REPORTS =
  import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "tickets",   label: "チケット",       path: "/tickets" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_KNOWLEDGE ? [{ key: "knowledge", label: "ナレッジベース", path: "/knowledge" }] : []),
  ...(FEATURE_REPORTS   ? [{ key: "reports",   label: "レポート",       path: "/reports" }]   : []),
]

export const NAV_SECTIONS: NavSection[] = [
  { title: "メニュー", items: [...coreItems, ...conditionalItems] },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  tickets:   Ticket,
  knowledge: BookOpen,
  reports:   BarChart3,
}

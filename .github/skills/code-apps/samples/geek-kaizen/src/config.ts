import { LayoutDashboard, Lightbulb, Columns3, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "改善提案ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "提案・検討・実施の見える化"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "改善提案ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "kaizen-app-theme"
export const FEATURE_VOTING = import.meta.env.VITE_FEATURE_VOTING === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard",   label: "ダッシュボード", path: "/dashboard" },
  { key: "board",       label: "カンバン",       path: "/board" },
  { key: "suggestions", label: "提案一覧",       path: "/suggestions" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート", path: "/reports" }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:   LayoutDashboard,
  board:       Columns3,
  suggestions: Lightbulb,
  reports:     BarChart3,
}

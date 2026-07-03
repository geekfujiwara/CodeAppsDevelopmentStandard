import { LayoutDashboard, ShieldAlert, Wrench, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "安全衛生ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "ヒヤリハット報告・是正措置"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "安全衛生ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "safety-app-theme"
export const FEATURE_ACTIONS = import.meta.env.VITE_FEATURE_ACTIONS === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード",   path: "/dashboard" },
  { key: "incidents", label: "ヒヤリハット報告", path: "/incidents" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_ACTIONS ? [{ key: "actions", label: "是正措置", path: "/actions" }] : []),
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート", path: "/reports" }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  incidents: ShieldAlert,
  actions:   Wrench,
  reports:   BarChart3,
}

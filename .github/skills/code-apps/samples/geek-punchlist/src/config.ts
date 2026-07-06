import { LayoutDashboard, ClipboardList, Grid3x3, HardHat, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "竣工検査ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "指摘事項・是正管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "竣工検査ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "punchlist-app-theme"
export const FEATURE_SITES = import.meta.env.VITE_FEATURE_SITES === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "items",     label: "指摘事項",       path: "/items" },
  { key: "matrix",    label: "マトリクス",     path: "/matrix" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_SITES   ? [{ key: "sites",   label: "現場マスタ", path: "/sites"   }] : []),
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート",   path: "/reports" }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  items:     ClipboardList,
  matrix:    Grid3x3,
  sites:     HardHat,
  reports:   BarChart3,
}

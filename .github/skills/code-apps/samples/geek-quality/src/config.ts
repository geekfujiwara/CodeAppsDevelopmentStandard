import { LayoutDashboard, ClipboardCheck, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "品質検査ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "生産ライン検査・不良分析"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "品質検査ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "quality-app-theme"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

/** 歩留まりの要注意しきい値（%）。これ未満のラインをダッシュボードで強調する */
export const YIELD_WARNING_THRESHOLD = 95

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard",   label: "ダッシュボード", path: "/dashboard" },
  { key: "inspections", label: "検査記録",       path: "/inspections" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート", path: "/reports" }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:   LayoutDashboard,
  inspections: ClipboardCheck,
  reports:     BarChart3,
}

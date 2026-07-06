import { LayoutDashboard, Thermometer, ClipboardList, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "衛生管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "HACCP 温度・衛生点検記録"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "衛生管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "haccp-app-theme"
export const FEATURE_CHECKPOINTS = import.meta.env.VITE_FEATURE_CHECKPOINTS === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard",    label: "ダッシュボード", path: "/dashboard" },
  { key: "measurements", label: "測定記録",       path: "/measurements" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_CHECKPOINTS ? [{ key: "checkpoints", label: "点検項目", path: "/checkpoints" }] : []),
  ...(FEATURE_REPORTS     ? [{ key: "reports",     label: "レポート", path: "/reports"     }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:    LayoutDashboard,
  measurements: Thermometer,
  checkpoints:  ClipboardList,
  reports:      BarChart3,
}

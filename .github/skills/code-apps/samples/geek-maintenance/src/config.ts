import { LayoutDashboard, Wrench, ClipboardList, CalendarClock, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "設備保全管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "設備・作業管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "設備保全管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "maintenance-app-theme"
export const FEATURE_SCHEDULE = import.meta.env.VITE_FEATURE_SCHEDULE === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard",   label: "ダッシュボード", path: "/dashboard" },
  { key: "equipment",   label: "設備マスタ",     path: "/equipment" },
  { key: "work-orders", label: "作業指示",       path: "/work-orders" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_SCHEDULE ? [{ key: "schedules", label: "点検スケジュール", path: "/schedules" }] : []),
  ...(FEATURE_REPORTS  ? [{ key: "reports",   label: "レポート",         path: "/reports" }]   : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:    LayoutDashboard,
  equipment:    Wrench,
  "work-orders": ClipboardList,
  schedules:    CalendarClock,
  reports:      BarChart3,
}

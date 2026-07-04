import { LayoutDashboard, GraduationCap, Users, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "研修管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "研修カタログ・受講管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "研修管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "training-app-theme"
export const FEATURE_ENROLLMENTS = import.meta.env.VITE_FEATURE_ENROLLMENTS === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "courses",   label: "研修コース",     path: "/courses" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_ENROLLMENTS ? [{ key: "enrollments", label: "受講記録", path: "/enrollments" }] : []),
  ...(FEATURE_REPORTS     ? [{ key: "reports",     label: "レポート", path: "/reports"     }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:   LayoutDashboard,
  courses:     GraduationCap,
  enrollments: Users,
  reports:     BarChart3,
}

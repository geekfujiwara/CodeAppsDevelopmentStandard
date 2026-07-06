import { LayoutDashboard, Route, Truck, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "配送管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "配送便・車両・配達トラッキング"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "配送管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "delivery-app-theme"
export const FEATURE_VEHICLES = import.meta.env.VITE_FEATURE_VEHICLES === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

/** 点検期限の注意喚起日数（この日数以内に期限が来る車両を強調する） */
export const INSPECTION_WARNING_DAYS = 30

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "routes",    label: "配送便",         path: "/routes" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_VEHICLES ? [{ key: "vehicles", label: "車両マスタ", path: "/vehicles" }] : []),
  ...(FEATURE_REPORTS  ? [{ key: "reports",  label: "レポート",   path: "/reports"  }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  routes:    Route,
  vehicles:  Truck,
  reports:   BarChart3,
}

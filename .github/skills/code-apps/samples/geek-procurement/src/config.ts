import { LayoutDashboard, ShoppingBag, Store, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "購買依頼管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "購買・仕入先管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "購買依頼管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "procurement-app-theme"
export const FEATURE_VENDORS = import.meta.env.VITE_FEATURE_VENDORS === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "requests",  label: "購買依頼",       path: "/requests" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_VENDORS ? [{ key: "vendors", label: "仕入先管理", path: "/vendors" }] : []),
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート",   path: "/reports" }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  requests:  ShoppingBag,
  vendors:   Store,
  reports:   BarChart3,
}

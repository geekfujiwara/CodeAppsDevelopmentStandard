import { LayoutDashboard, Store, ClipboardList, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "店舗運営ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "臨店チェック・店舗管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "店舗運営ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "store-app-theme"
export const FEATURE_STORES = import.meta.env.VITE_FEATURE_STORES === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "audits",    label: "臨店チェック",   path: "/audits" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_STORES  ? [{ key: "stores",  label: "店舗マスタ", path: "/stores"  }] : []),
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート",   path: "/reports" }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  audits:    ClipboardList,
  stores:    Store,
  reports:   BarChart3,
}

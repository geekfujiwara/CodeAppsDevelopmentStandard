import { LayoutDashboard, LayoutGrid, BedDouble, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "客室管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "ハウスキーピング・客室整備"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "客室管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "hotel-app-theme"
export const FEATURE_ROOMS = import.meta.env.VITE_FEATURE_ROOMS === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "board",     label: "客室ボード",     path: "/board" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_ROOMS   ? [{ key: "rooms",   label: "客室マスタ", path: "/rooms"   }] : []),
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート",   path: "/reports" }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  board:     LayoutGrid,
  rooms:     BedDouble,
  reports:   BarChart3,
}

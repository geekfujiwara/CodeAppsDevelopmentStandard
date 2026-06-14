import { LayoutDashboard, FileText, Building2, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "契約台帳管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "契約・取引先管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "契約台帳管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "contract-app-theme"
export const FEATURE_COUNTERPARTIES = import.meta.env.VITE_FEATURE_COUNTERPARTIES === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "contracts", label: "契約台帳",       path: "/contracts" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_COUNTERPARTIES ? [{ key: "counterparties", label: "取引先管理", path: "/counterparties" }] : []),
  ...(FEATURE_REPORTS        ? [{ key: "reports",        label: "レポート",   path: "/reports" }]        : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:      LayoutDashboard,
  contracts:      FileText,
  counterparties: Building2,
  reports:        BarChart3,
}

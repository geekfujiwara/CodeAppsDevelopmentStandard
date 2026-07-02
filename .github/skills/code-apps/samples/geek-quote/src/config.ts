import { LayoutDashboard, FileText, Receipt, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "見積・請求管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "見積作成・請求追跡"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "見積・請求管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "quote-app-theme"
export const FEATURE_INVOICES = import.meta.env.VITE_FEATURE_INVOICES === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

/** 消費税率（見積・請求の税額自動計算に使用） */
export const TAX_RATE = 0.1

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "quotes",    label: "見積",           path: "/quotes" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_INVOICES ? [{ key: "invoices", label: "請求",     path: "/invoices" }] : []),
  ...(FEATURE_REPORTS  ? [{ key: "reports",  label: "レポート", path: "/reports"  }] : []),
]
export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: [...coreItems, ...conditionalItems] }]
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  quotes:    FileText,
  invoices:  Receipt,
  reports:   BarChart3,
}

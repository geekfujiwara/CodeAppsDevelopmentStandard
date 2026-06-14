import { LayoutDashboard, Receipt, CheckSquare, BarChart3, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "経費精算管理"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "申請・承認ポータル"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "経費精算管理"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "expense-app-theme"

export const FEATURE_APPROVAL_FLOW = import.meta.env.VITE_FEATURE_APPROVAL_FLOW === "true"
export const FEATURE_COPILOT = import.meta.env.VITE_FEATURE_COPILOT === "true"

export type NavItem = { label: string; path: string; iconKey: string }
export type NavSection = { category: string; items: NavItem[] }

export const NAV_SECTIONS: NavSection[] = [
  {
    category: "メイン",
    items: [
      { label: "ダッシュボード", path: "dashboard",  iconKey: "dashboard" },
      { label: "経費申請",       path: "expenses",   iconKey: "receipt"   },
      { label: "承認",           path: "approvals",  iconKey: "check"     },
    ],
  },
  {
    category: "分析",
    items: [
      { label: "分析",           path: "analytics",  iconKey: "chart"     },
    ],
  },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  receipt:   Receipt,
  check:     CheckSquare,
  chart:     BarChart3,
}

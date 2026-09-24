import { Building2, CalendarCheck, Handshake, Home, LayoutDashboard, Target, UserPlus, Users, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "Sales Command Center"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || ""
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "Sales Command Center"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "sales-crm-theme"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

// path は router.tsx の子ルートと 1:1 で対応させる
export const NAV_SECTIONS: NavSection[] = [
  { title: "マネジメント", items: [{ key: "dashboard", label: "チーム ダッシュボード", path: "/dashboard" }] },
  {
    title: "営業",
    items: [
      { key: "my", label: "営業ホーム", path: "/my" },
      { key: "opportunities", label: "商談", path: "/opportunities" },
      { key: "leads", label: "リード", path: "/leads" },
      { key: "activities", label: "営業活動", path: "/activities" },
    ],
  },
  {
    title: "顧客",
    items: [
      { key: "accounts", label: "取引先企業", path: "/accounts" },
      { key: "contacts", label: "取引先担当者", path: "/contacts" },
    ],
  },
  { title: "設定", items: [{ key: "targets", label: "売上目標", path: "/targets" }] },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  my: Home,
  opportunities: Handshake,
  leads: UserPlus,
  activities: CalendarCheck,
  accounts: Building2,
  contacts: Users,
  targets: Target,
}

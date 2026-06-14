import { LayoutDashboard, Users, Network, UserPlus, Star, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "人事管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "HR ポータル"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "人事管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "hr-app-theme"

export const FEATURE_RECRUITMENT = import.meta.env.VITE_FEATURE_RECRUITMENT === "true"
export const FEATURE_EVALUATION = import.meta.env.VITE_FEATURE_EVALUATION === "true"

export type NavItem = { label: string; path: string; iconKey: string }
export type NavSection = { category: string; items: NavItem[] }

const baseItems: NavItem[] = [
  { label: "ダッシュボード", path: "dashboard",     iconKey: "dashboard"   },
  { label: "社員台帳",       path: "employees",     iconKey: "users"       },
  { label: "組織図",         path: "organization",  iconKey: "org"         },
]

const recruitmentItems: NavItem[] = FEATURE_RECRUITMENT
  ? [{ label: "採用管理", path: "recruitment", iconKey: "recruitment" }]
  : []

const evaluationItems: NavItem[] = FEATURE_EVALUATION
  ? [{ label: "評価管理", path: "evaluations", iconKey: "evaluation" }]
  : []

export const NAV_SECTIONS: NavSection[] = [
  {
    category: "メイン",
    items: baseItems,
  },
  ...(recruitmentItems.length > 0 || evaluationItems.length > 0
    ? [{
        category: "人材",
        items: [...recruitmentItems, ...evaluationItems],
      }]
    : []),
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:   LayoutDashboard,
  users:       Users,
  org:         Network,
  recruitment: UserPlus,
  evaluation:  Star,
}

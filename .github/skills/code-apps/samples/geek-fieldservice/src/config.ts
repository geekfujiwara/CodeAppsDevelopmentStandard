import { LayoutDashboard, PhoneCall, ClipboardList, Users, Printer, FileSignature, Wrench, LineChart, Gauge, Lightbulb, Droplets, BookMarked, NotebookPen, History, GitBranch, Radar, CalendarClock, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "フィールドサービス管理"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "保守サービス統合基盤"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "フィールドサービス管理"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "fs-app-theme"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "保守オペレーション",
    items: [
      { key: "dashboard",   label: "ダッシュボード", path: "/dashboard" },
      { key: "service-flow", label: "サービスフロー", path: "/service-flow" },
      { key: "calls",       label: "コール管理",     path: "/calls" },
      { key: "work-orders", label: "作業オーダー",   path: "/work-orders" },
      { key: "scheduling",   label: "スケジューリング", path: "/scheduling" },
      { key: "daily-reports", label: "日報",         path: "/daily-reports" },
    ],
  },
  {
    title: "ナレッジ",
    items: [
      { key: "knowledge",       label: "ナレッジ",       path: "/knowledge" },
      { key: "reports",         label: "修理事例",       path: "/reports" },
    ],
  },
  {
    title: "年間レビュー",
    items: [
      { key: "annual-review",   label: "年間レビュー",   path: "/annual-review" },
      { key: "annual-kpi",      label: "年間KPI",        path: "/annual-kpi" },
      { key: "consumption",     label: "消費実績",       path: "/consumption" },
      { key: "recommendations", label: "改善提案",       path: "/recommendations" },
    ],
  },
  {
    title: "分析",
    items: [
      { key: "customer-360", label: "Customer 360", path: "/customer-360" },
    ],
  },
  {
    title: "マスタ",
    items: [
      { key: "customers",   label: "顧客",           path: "/customers" },
      { key: "equipment",   label: "機器情報",       path: "/equipment" },
      { key: "contracts",   label: "保守契約",       path: "/contracts" },
      { key: "engineers",   label: "カスタマーエンジニア", path: "/engineers" },
    ],
  },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:       LayoutDashboard,
  calls:           PhoneCall,
  "work-orders":   ClipboardList,
  "daily-reports": NotebookPen,
  "service-flow":  GitBranch,
  reports:         History,
  "annual-review": LineChart,
  "annual-kpi":    Gauge,
  consumption:     Droplets,
  recommendations: Lightbulb,
  knowledge:       BookMarked,
  customers:       Users,
  equipment:       Printer,
  contracts:       FileSignature,
  engineers:       Wrench,
  scheduling:      CalendarClock,
  "customer-360":  Radar,
}

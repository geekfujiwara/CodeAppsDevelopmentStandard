import { Box, Cpu, FolderKanban, LayoutDashboard, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "Code App"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || ""
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "Code App"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "code-app-theme"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

// 業務ページを追加したら、ここに項目を足して ICON_MAP に同じ key でアイコンを登録する。
// path は router.tsx の子ルートと 1:1 で対応させる（先頭スラッシュの有無は predeploy が吸収する）。
const coreItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "projects", label: "案件", path: "/projects" },
]

const toolItems: NavItem[] = [
  { key: "blender", label: "Blender 連携", path: "/blender" },
]

export const NAV_SECTIONS: NavSection[] = [
  { title: "提案", items: coreItems },
  { title: "3D パイプライン", items: toolItems },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  blender: Cpu,
  model: Box,
}

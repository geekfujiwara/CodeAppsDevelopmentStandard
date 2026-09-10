import {
  BookOpenCheck,
  Box,
  FileQuestion,
  GitCompareArrows,
  LayoutDashboard,
  Layers,
  MapPin,
  Workflow,
  type LucideIcon,
} from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "Plant Design & Maintenance"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "設計・保全をつなぐAI業務基盤"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "Plant Design & Maintenance"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "plant-sample-theme"

// 図面・設計文書ファイルの公開基点 URL。Dataverse には Azure Files 上の相対パスしか持たないため、
// 別タブで開くリンクを組み立てるときだけ前置きする。未設定ならパス表示のみになる。
export const DRAWING_FILE_BASE_URL = import.meta.env.VITE_DRAWING_FILE_BASE_URL?.trim() ?? ""

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

// 業務ページを追加したら、ここに項目を足して ICON_MAP に同じ key でアイコンを登録する。
// path は router.tsx の子ルートと 1:1 で対応させる（先頭スラッシュの有無は predeploy が吸収する）。
// 「概要」で全体を掴み、「台帳」で明細を編集する、という導線でグループ化している。
const overviewItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "plant-sites", label: "プラント拠点", path: "/plant-sites" },
  { key: "traceability", label: "横断ビュー", path: "/traceability" },
  { key: "lifecycle", label: "ライフサイクル", path: "/lifecycle" },
]

const ledgerItems: NavItem[] = [
  { key: "incidents", label: "問い合わせ", path: "/incidents" },
  { key: "knowledge", label: "ナレッジ", path: "/knowledge" },
  { key: "drawings", label: "図面索引", path: "/drawings" },
  { key: "plant-3d", label: "プラント 3D", path: "/plant-3d" },
  { key: "plant-designer", label: "プラント設計", path: "/plant-designer" },
]

// 機能フラグで出し分ける項目はここに置く（.env の VITE_FEATURE_* を参照）
const conditionalItems: NavItem[] = []

export const NAV_SECTIONS: NavSection[] = import.meta.env.VITE_FEATURE_LIVE === "true" ? [
  { title: "概要", items: overviewItems },
  { title: "台帳", items: [...ledgerItems, ...conditionalItems] },
] : [{ title: "プラント", items: ledgerItems.filter(item => ["plant-designer", "plant-3d"].includes(item.key)) }]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  "plant-sites": MapPin,
  traceability: GitCompareArrows,
  lifecycle: Workflow,
  drawings: Layers,
  "plant-3d": Box,
  "plant-designer": Layers,
  incidents: FileQuestion,
  knowledge: BookOpenCheck,
}

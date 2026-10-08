import {
  BookOpen,
  Cpu,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  LineChart,
  Merge,
  MessageSquareHeart,
  Network,
  Scale,
  ShieldAlert,
  Rocket,
  type LucideIcon,
} from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "Code App"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || ""
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "Code App"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "code-app-theme"
// 自動テストの結果から Issue を起票する先（owner/repo）。未設定なら起票ボタンは出さず、URL 手入力だけ残る。
export const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO?.trim() || ""

// 組織図の最上位に置く人間のオーナー。チームメイトのマスター行の「上長キー」をこのキーに合わせると
// その人の下にぶら下がる。名前が空なら人間の行は出さず、従来どおりチームメイトだけの木になる。
export const ORG_OWNER = {
  key: import.meta.env.VITE_ORG_OWNER_KEY?.trim() || "owner",
  name: import.meta.env.VITE_ORG_OWNER_NAME?.trim() || "",
  role: import.meta.env.VITE_ORG_OWNER_ROLE?.trim() || "",
  upn: import.meta.env.VITE_ORG_OWNER_UPN?.trim() || "",
} as const

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

// 業務ページを追加したら、ここに項目を足して ICON_MAP に同じ key でアイコンを登録する。
// path は router.tsx の子ルートと 1:1 で対応させる（先頭スラッシュの有無は predeploy が吸収する）。
const overviewItems: NavItem[] = [
  { key: "dashboard", label: "ダッシュボード", path: "/dashboard" },
  { key: "org-chart", label: "組織図", path: "/org-chart" },
  { key: "trend", label: "スコア推移", path: "/trend" },
]

const evaluationItems: NavItem[] = [
  { key: "turns", label: "評価ターン", path: "/turns" },
  { key: "auto-test", label: "自動テスト", path: "/auto-test" },
  { key: "merge", label: "会話の統合", path: "/merge" },
  { key: "command-center", label: "評価コマンドセンター", path: "/command-center" },
]

const masterItems: NavItem[] = [
  { key: "rules", label: "評価ルール", path: "/rules" },
]

// AI チームメイト（エージェント）自体の設計・構成に関する項目はここにまとめる
const agentDesignItems: NavItem[] = [
  { key: "agent-brain", label: "Agent Brain 設定", path: "/agent-brain" },
  { key: "security", label: "セキュリティ設定", path: "/security" },
  { key: "skills", label: "スキル", path: "/skills" },
  { key: "feedback", label: "フィードバック", path: "/feedback" },
]

// 機能フラグで出し分ける項目はここに置く（.env の VITE_FEATURE_* を参照）
const conditionalItems: NavItem[] = []

export const NAV_SECTIONS: NavSection[] = [
  { title: "概要", items: overviewItems },
  { title: "評価", items: [...evaluationItems, ...conditionalItems] },
  { title: "AIチームメイトの設計", items: agentDesignItems },
  { title: "マスター", items: masterItems },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  "org-chart": Network,
  turns: ListChecks,
  "auto-test": FlaskConical,
  merge: Merge,
  trend: LineChart,
  rules: Scale,
  skills: BookOpen,
  "agent-brain": Cpu,
  security: ShieldAlert,
  "command-center": Rocket,
  feedback: MessageSquareHeart,
}

import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Building2,
  Handshake,
  Columns3,
  ClipboardList,
  Target,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react"

// ── アプリ設定 ──────────────────────────────────────────────
export const PUBLISHER_PREFIX =
  import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""

export const CODEAPPS_APP_NAME =
  import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "Geek Sales"

export const CODEAPPS_APP_SUBTITLE =
  import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "営業支援ポータル"

export const CODEAPPS_DOCUMENT_TITLE =
  import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || CODEAPPS_APP_NAME

export const CODEAPPS_THEME_STORAGE_KEY =
  import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "sales-app-theme"

// ── 機能フラグ ──────────────────────────────────────────────
// Copilot Analytics ページ（会話ダッシュボード・会話一覧・エージェント管理）
export const FEATURE_COPILOT =
  import.meta.env.VITE_FEATURE_COPILOT === "true"

// AI フロー連携（メール下書き生成・アポイント提案・テリトリーニュース生成）
export const FEATURE_AI_FLOW =
  import.meta.env.VITE_FEATURE_AI_FLOW === "true"

// ── ナビゲーション型 ────────────────────────────────────────
export type NavItem = {
  label: string
  path: string
  iconKey: string
}

export type NavSection = {
  category: string
  items: NavItem[]
}

// ── ナビゲーション構成（コード固定）──────────────────────────
const ALL_NAV_SECTIONS: NavSection[] = [
  {
    category: "Copilot Analytics",
    items: [
      { label: "Copilot ダッシュボード", path: "copilot-dashboard", iconKey: "dashboard"     },
      { label: "会話",                   path: "conversations",      iconKey: "conversations" },
      { label: "エージェント管理",        path: "agent-management",   iconKey: "agents"        },
    ],
  },
  {
    category: "営業管理",
    items: [
      { label: "顧客",         path: "customers",     iconKey: "customers"      },
      { label: "商談",         path: "opportunities", iconKey: "opportunities"  },
      { label: "パイプライン", path: "pipeline",      iconKey: "pipeline"       },
      { label: "テリトリー",  path: "territory",     iconKey: "territory"      },
      { label: "活動履歴",    path: "activities",    iconKey: "activities"     },
    ],
  },
]

export const NAV_SECTIONS: NavSection[] = FEATURE_COPILOT
  ? ALL_NAV_SECTIONS
  : ALL_NAV_SECTIONS.filter((s) => s.category !== "Copilot Analytics")

// ── アイコンマップ ──────────────────────────────────────────
export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:     LayoutDashboard,
  conversations: MessageSquare,
  agents:        Bot,
  customers:     Building2,
  opportunities: Handshake,
  pipeline:      Columns3,
  activities:    ClipboardList,
  territory:     Target,
  incidents:     AlertTriangle,
}

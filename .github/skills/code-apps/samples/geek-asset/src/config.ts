import { LayoutDashboard, Package, ArrowLeftRight, Trash2, ClipboardCheck, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "資産管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "IT資産・備品管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "資産管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = "asset-app-theme"

export const FEATURE_DISPOSAL = import.meta.env.VITE_FEATURE_DISPOSAL === "true"
export const FEATURE_INVENTORY = import.meta.env.VITE_FEATURE_INVENTORY === "true"

export type NavItem = { label: string; path: string; iconKey: string }
export type NavSection = { category: string; items: NavItem[] }

const conditionalItems: NavItem[] = [
  ...(FEATURE_DISPOSAL  ? [{ label: "廃棄管理", path: "disposal",  iconKey: "disposal"   }] : []),
  ...(FEATURE_INVENTORY ? [{ label: "棚卸",     path: "inventory", iconKey: "inventory"  }] : []),
]

export const NAV_SECTIONS: NavSection[] = [
  { category: "メイン", items: [
    { label: "ダッシュボード", path: "dashboard", iconKey: "dashboard" },
    { label: "資産台帳",       path: "assets",    iconKey: "assets"    },
    { label: "貸出管理",       path: "loans",     iconKey: "loans"     },
    ...conditionalItems,
  ]},
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  assets:    Package,
  loans:     ArrowLeftRight,
  disposal:  Trash2,
  inventory: ClipboardCheck,
}

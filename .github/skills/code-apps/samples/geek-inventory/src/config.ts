import {
  LayoutDashboard,
  Package,
  ArrowUpDown,
  ShoppingCart,
  BarChart3,
  type LucideIcon,
} from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "在庫管理ポータル"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "在庫・入出庫管理"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "在庫管理ポータル"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "inventory-app-theme"
export const FEATURE_ORDERS = import.meta.env.VITE_FEATURE_ORDERS === "true"
export const FEATURE_REPORTS = import.meta.env.VITE_FEATURE_REPORTS === "true"

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "dashboard",       label: "ダッシュボード", path: "/dashboard" },
  { key: "products",        label: "商品マスタ",     path: "/products" },
  { key: "stock-movements", label: "入出庫管理",     path: "/stock-movements" },
]
const conditionalItems: NavItem[] = [
  ...(FEATURE_ORDERS  ? [{ key: "orders",  label: "発注管理",   path: "/orders" }]  : []),
  ...(FEATURE_REPORTS ? [{ key: "reports", label: "レポート",   path: "/reports" }] : []),
]

export const NAV_SECTIONS: NavSection[] = [
  { title: "メニュー", items: [...coreItems, ...conditionalItems] },
]

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard:         LayoutDashboard,
  products:          Package,
  "stock-movements": ArrowUpDown,
  orders:            ShoppingCart,
  reports:           BarChart3,
}

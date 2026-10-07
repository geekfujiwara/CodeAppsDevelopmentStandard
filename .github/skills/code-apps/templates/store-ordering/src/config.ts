import { CloudSun, ListOrdered, Menu, Package, ShoppingCart, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const TABLE_PREFIX = import.meta.env.VITE_TABLE_PREFIX?.trim() || PUBLISHER_PREFIX + "_"
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "店舗発注システム"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || ""
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "店舗発注システム"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "order-terminal-theme"
/** 画面に出す端末の版数（見た目だけ） */
export const TERMINAL_VERSION = "Ver 3.12"
/** 発注の登録元（Cowork から登録したものと見分ける） */
export const ORDER_SOURCE = "店舗端末"

export type NavItem = { key: string; label: string; path: string; no: string; note: string }
export type NavSection = { title: string; items: NavItem[] }

// 業務メニュー。path は router.tsx の子ルートと 1:1 で対応させる
const coreItems: NavItem[] = [
  { key: "menu", no: "0", label: "業務メニュー", path: "/menu", note: "業務を選ぶ" },
  { key: "order", no: "1", label: "単品発注", path: "/order", note: "夕方便・朝便の発注を入力して送信" },
  { key: "orders", no: "2", label: "発注照会", path: "/orders", note: "今日の発注の確認・取消" },
  { key: "stock", no: "3", label: "在庫照会", path: "/stock", note: "在庫・売れ方・廃棄・欠品" },
  { key: "weather", no: "4", label: "天気・催事", path: "/weather", note: "週間予報と周辺のイベント" },
]

const conditionalItems: NavItem[] = []

export const NAV_SECTIONS: NavSection[] = [{ title: "業務", items: [...coreItems, ...conditionalItems] }]

export const ICON_MAP: Record<string, LucideIcon> = {
  menu: Menu,
  order: ShoppingCart,
  orders: ListOrdered,
  stock: Package,
  weather: CloudSun,
}

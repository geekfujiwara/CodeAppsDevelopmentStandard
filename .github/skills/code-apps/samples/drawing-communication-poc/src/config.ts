import { DraftingCompass, GitCompare, KanbanSquare, type LucideIcon } from "lucide-react"

export const PUBLISHER_PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""
export const CODEAPPS_APP_NAME = import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "図面コミュニケーション"
export const CODEAPPS_APP_SUBTITLE = import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || "設計レビュー ワークベンチ（PoC）"
export const CODEAPPS_DOCUMENT_TITLE = import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || "図面コミュニケーション"
export const CODEAPPS_THEME_STORAGE_KEY = import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "drawing-poc-theme"

/** true にすると Dataverse の要求 / 結果ワーカーを使う（既定は DEMO ワーカー） */
export const FEATURE_DRAWING_CONVERSATION = import.meta.env.VITE_FEATURE_DRAWING_CONVERSATION === "true"
/** true にすると改訂の共有保存に Dataverse アダプターを使う（既定はローカル下書き） */
export const FEATURE_DRAWING_STORAGE = import.meta.env.VITE_FEATURE_DRAWING_STORAGE === "true"

export const POLL_INTERVAL_MS = Number(import.meta.env.VITE_DRAWING_POLL_INTERVAL_MS ?? 900) || 900
export const POLL_TIMEOUT_MS = Number(import.meta.env.VITE_DRAWING_POLL_TIMEOUT_MS ?? 120000) || 120000

/** 注釈・タスクの担当者候補（デモ用の表示名。権限判定には使わない） */
export const ASSIGNEES = ["設計担当", "機構担当", "生産技術", "品質保証", "外注管理"]

export type NavItem = { key: string; label: string; path: string }
export type NavSection = { title: string; items: NavItem[] }

const coreItems: NavItem[] = [
  { key: "workbench", label: "図面ワークベンチ", path: "/workbench" },
  { key: "tasks", label: "タスク", path: "/tasks" },
  { key: "revisions", label: "改訂と候補", path: "/revisions" },
]

export const NAV_SECTIONS: NavSection[] = [{ title: "メニュー", items: coreItems }]

export const ICON_MAP: Record<string, LucideIcon> = {
  workbench: DraftingCompass,
  tasks: KanbanSquare,
  revisions: GitCompare,
}

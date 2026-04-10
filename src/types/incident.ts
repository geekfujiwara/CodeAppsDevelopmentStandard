import type { Geek_incidentsgeek_status, Geek_incidentsgeek_priority } from "@/generated/models/Geek_incidentsModel"
import type { Geek_itassetsgeek_assettype } from "@/generated/models/Geek_itassetsModel"

// ステータス
export const IncidentStatus = {
  NEW: 100000000 as Geek_incidentsgeek_status,
  IN_PROGRESS: 100000001 as Geek_incidentsgeek_status,
  ON_HOLD: 100000002 as Geek_incidentsgeek_status,
  RESOLVED: 100000003 as Geek_incidentsgeek_status,
  CLOSED: 100000004 as Geek_incidentsgeek_status,
} as const

export const statusLabels: Record<number, string> = {
  100000000: "新規",
  100000001: "対応中",
  100000002: "保留",
  100000003: "解決済",
  100000004: "クローズ",
}

export const statusColors: Record<number, string> = {
  100000000: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  100000001: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  100000002: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  100000003: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  100000004: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

// 優先度
export const IncidentPriority = {
  URGENT: 100000000 as Geek_incidentsgeek_priority,
  HIGH: 100000001 as Geek_incidentsgeek_priority,
  MEDIUM: 100000002 as Geek_incidentsgeek_priority,
  LOW: 100000003 as Geek_incidentsgeek_priority,
} as const

export const priorityLabels: Record<number, string> = {
  100000000: "緊急",
  100000001: "高",
  100000002: "中",
  100000003: "低",
}

export const priorityColors: Record<number, string> = {
  100000000: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  100000001: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  100000002: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  100000003: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
}

// 資産種別
export const assetTypeLabels: Record<number, string> = {
  100000000: "PC",
  100000001: "サーバー",
  100000002: "ネットワーク機器",
  100000003: "プリンター",
  100000004: "モバイル端末",
  100000005: "その他",
}

export type AssetType = Geek_itassetsgeek_assettype

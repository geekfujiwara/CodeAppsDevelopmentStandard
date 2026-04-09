/**
 * インシデント管理 — 型定義
 *
 * SDK 生成型 (src/generated/models/) を re-export し、
 * UI 用のラベル・カラーマッピングを提供する。
 */

// ── SDK 生成型の re-export ───────────────────────────────

export type {
  Geek_incidents as Incident,
  Geek_incidentsBase as IncidentBase,
  Geek_incidentsgeek_status,
  Geek_incidentsgeek_priority,
} from "@/generated/models/Geek_incidentsModel";

export type {
  Geek_incidentcategories as IncidentCategory,
} from "@/generated/models/Geek_incidentcategoriesModel";

export type {
  Geek_locations as Location,
} from "@/generated/models/Geek_locationsModel";

export type {
  Geek_incidentcomments as IncidentComment,
} from "@/generated/models/Geek_incidentcommentsModel";

export type {
  CreateIncidentPayload,
  UpdateIncidentPayload,
} from "@/services/incident-service";

// ── Choice 値定義（UI 用） ───────────────────────────────
// SDK 生成型は Choice キーを number literal 型で持つが、
// UI ラベル/カラーマッピングに定数が必要なため維持。

export const IncidentStatus = {
  NEW: 100000000,
  IN_PROGRESS: 100000001,
  ON_HOLD: 100000002,
  RESOLVED: 100000003,
  CLOSED: 100000004,
} as const;
export type IncidentStatus =
  (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentPriority = {
  CRITICAL: 100000000,
  HIGH: 100000001,
  MEDIUM: 100000002,
  LOW: 100000003,
} as const;
export type IncidentPriority =
  (typeof IncidentPriority)[keyof typeof IncidentPriority];

// ── ラベルマッピング ─────────────────────────────────────

export const statusLabels: Record<IncidentStatus, string> = {
  [IncidentStatus.NEW]: "新規",
  [IncidentStatus.IN_PROGRESS]: "対応中",
  [IncidentStatus.ON_HOLD]: "保留",
  [IncidentStatus.RESOLVED]: "解決済",
  [IncidentStatus.CLOSED]: "クローズ",
};

export const priorityLabels: Record<IncidentPriority, string> = {
  [IncidentPriority.CRITICAL]: "緊急",
  [IncidentPriority.HIGH]: "高",
  [IncidentPriority.MEDIUM]: "中",
  [IncidentPriority.LOW]: "低",
};

// ── Tailwind カラー ──────────────────────────────────────

export const statusColors: Record<number, string> = {
  [IncidentStatus.NEW]:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [IncidentStatus.IN_PROGRESS]:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [IncidentStatus.ON_HOLD]:
    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  [IncidentStatus.RESOLVED]:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [IncidentStatus.CLOSED]:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export const priorityColors: Record<number, string> = {
  [IncidentPriority.CRITICAL]:
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  [IncidentPriority.HIGH]:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  [IncidentPriority.MEDIUM]:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [IncidentPriority.LOW]:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

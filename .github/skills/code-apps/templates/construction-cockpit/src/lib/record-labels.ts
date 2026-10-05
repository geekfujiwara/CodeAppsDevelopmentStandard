// 選択肢列（Choice）の表示名と色。画面・グラフ・Copilot Studio のスキル説明で同じ値を使う。

export const WEATHER_LABEL: Record<number, string> = { 100000000: "晴れ", 100000001: "曇り", 100000002: "雨", 100000003: "雪", 100000004: "強風" }
export const RISK_LABEL: Record<number, string> = { 100000000: "高", 100000001: "中", 100000002: "低" }
export const RISK_COLOR: Record<number, string> = { 100000000: "#e11d48", 100000001: "#f59e0b", 100000002: "#10b981" }
export const INCIDENT_TYPE_LABEL: Record<number, string> = { 100000000: "ヒヤリハット", 100000001: "軽微な事故", 100000002: "品質トラブル", 100000003: "設備トラブル" }
export const INCIDENT_TYPE_COLOR: Record<number, string> = { 100000000: "#f59e0b", 100000001: "#e11d48", 100000002: "#8b5cf6", 100000003: "#0ea5e9" }
export const KNOWLEDGE_TYPE_LABEL: Record<number, string> = { 100000000: "安全", 100000001: "品質", 100000002: "工程", 100000003: "工法" }
export const KNOWLEDGE_TYPE_COLOR: Record<number, string> = { 100000000: "#e11d48", 100000001: "#8b5cf6", 100000002: "#0ea5e9", 100000003: "#10b981" }
export const REVIEW_STATUS = { draft: 100000000, submitted: 100000001, approved: 100000002, returned: 100000003 } as const
export const REVIEW_LABEL: Record<number, string> = { 100000000: "下書き", 100000001: "確認待ち", 100000002: "承認済", 100000003: "差戻し" }
export const REVIEW_COLOR: Record<number, string> = { 100000000: "#94a3b8", 100000001: "#8b5cf6", 100000002: "#10b981", 100000003: "#e11d48" }
export const REPORT_STATUS_LABEL: Record<number, string> = { 100000000: "下書き", 100000001: "確定" }

export function labelOf(labels: Record<number, string>, value: number, fallback = "未設定"): string {
  return labels[value] ?? fallback
}

/** 期間フィルターの選択肢（日数。0 は全期間） */
export const PERIOD_OPTIONS = [
  { value: "30", label: "直近 30 日" },
  { value: "90", label: "直近 90 日" },
  { value: "365", label: "直近 1 年" },
  { value: "0", label: "全期間" },
]

export function withinDays(isoDate: string, days: number, now = Date.now()): boolean {
  if (!days) return true
  const time = new Date(isoDate).getTime()
  return Number.isFinite(time) && now - time <= days * 86_400_000
}

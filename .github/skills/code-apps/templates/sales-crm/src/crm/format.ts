import { CURRENCY, LOCALE, type Option } from "@/crm/schema"

const money = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 })

export const formatMoney = (value: number) => money.format(value)
export const formatCompact = (value: number) => compact.format(value)
export const formatPercent = (ratio: number) => (Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : "—")
export const formatCoverage = (ratio: number) => (Number.isFinite(ratio) ? `${ratio.toFixed(1)}x` : "達成済")

export function formatDate(value?: string): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(LOCALE)
}

export function formatDateTime(value?: string): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" })
}

export const optionLabel = (options: Option[], value?: number) => options.find((o) => o.value === value)?.label ?? "—"

import { displayValue } from "@/crm/api"
import { formatDate, formatDateTime, formatMoney } from "@/crm/format"
import type { FieldDef } from "@/crm/schema"
import type { DataverseRow } from "@/lib/dataverse-client"

export function cellText(row: DataverseRow, field: FieldDef): string {
  const raw = row[field.name]
  if (field.type === "money" && typeof raw === "number") return formatMoney(raw)
  if (field.type === "date" && typeof raw === "string") return formatDate(raw)
  if (field.type === "datetime" && typeof raw === "string") return formatDateTime(raw)
  return displayValue(row, field) || "—"
}

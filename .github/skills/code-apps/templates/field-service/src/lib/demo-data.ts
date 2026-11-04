import { PUBLISHER_PREFIX } from "@/config"

const P = PUBLISHER_PREFIX
type RecordData = Record<string, unknown>

function containsDemoMarker(value: unknown): boolean {
  return typeof value === "string" && value.includes("デモ")
}

export function isDemoWorkOrder(record: RecordData): boolean {
  const name = String(record[`${P}_name`] ?? "")
  return /^(DEMO[-_]|WO-S\d+)/i.test(name)
    || containsDemoMarker(record[`${P}_workdetail`])
    || containsDemoMarker(record[`${P}_faultsummary`])
}

export function isDemoCall(record: RecordData): boolean {
  const name = String(record[`${P}_name`] ?? "")
  return /^(DEMO[-_]|CALL-\d{4}\b)/i.test(name)
    || containsDemoMarker(record[`${P}_description`])
}

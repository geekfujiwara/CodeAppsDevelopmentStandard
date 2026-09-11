import type { DataverseRow } from "@/lib/dataverse-client"

// 3 つの評価テーブルで同じ変換を書き写さないための共通ヘルパー。

export function str(row: DataverseRow, key: string): string {
  const value = row[key]
  return value === null || value === undefined ? "" : String(value)
}

export function num(row: DataverseRow, key: string): number | null {
  const value = row[key]
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function bool(row: DataverseRow, key: string): boolean {
  return row[key] === true || row[key] === "true"
}

// OData string literals are single quoted, and doubling the quote is the only escape there is.
// Everything that reaches a $filter goes through here.
export function quote(value: string): string {
  return value.replace(/'/g, "''")
}

export function parseJsonArray<T>(json: string): T[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

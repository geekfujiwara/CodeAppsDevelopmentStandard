// Dataverse 検索（関連性検索）と OData の部分一致を組み合わせる純粋関数（ブラウザ / Node 共通）。
// 関連性検索は名前など簡易検索ビューの列だけを対象にし、インデックス反映に数分かかるため、
// 工事番号・住所などの部分一致で補い、関連性検索の順位を優先して重複を除く。

export const escapeOData = (value: string) => value.replaceAll("'", "''")

/** contains(col,'term') を or でつなぐ。空白区切りの各語をすべて含む（語ごとに and） */
export function containsFilter(columns: string[], term: string): string {
  const words = term.trim().split(/\s+/).filter(Boolean).slice(0, 5)
  if (!words.length) return ""
  return words.map((word) => `(${columns.map((column) => `contains(${column},'${escapeOData(word)}')`).join(" or ")})`).join(" and ")
}

/** ID の or 条件（GUID 以外は除外する） */
export function idFilter(column: string, ids: string[]): string {
  const valid = ids.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  return valid.map((id) => `${column} eq ${id}`).join(" or ")
}

export type SearchSource = "dataverse-search" | "contains"
export type Ranked<T> = { item: T; source: SearchSource }

/** 関連性検索の順位 → 部分一致の順に並べ、同じ ID は 1 件にする */
export function mergeRanked<T>(searchIds: string[], searchRows: T[], containsRows: T[], idOf: (item: T) => string, limit = 20): Ranked<T>[] {
  const byId = new Map(searchRows.map((row) => [idOf(row).toLowerCase(), row]))
  const seen = new Set<string>()
  const result: Ranked<T>[] = []
  for (const id of searchIds) {
    const row = byId.get(id.toLowerCase())
    if (row && !seen.has(id.toLowerCase())) { seen.add(id.toLowerCase()); result.push({ item: row, source: "dataverse-search" }) }
  }
  for (const row of containsRows) {
    const id = idOf(row).toLowerCase()
    if (!seen.has(id)) { seen.add(id); result.push({ item: row, source: "contains" }) }
  }
  return result.slice(0, limit)
}

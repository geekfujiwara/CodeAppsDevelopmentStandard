export interface ParetoDatum {
  name: string
  value: number
  /** 累積構成比（0-100） */
  cumulative: number
}

/**
 * 分類別の件数・数量をパレート図用データに変換する。
 * 値の大きい順に並べ替え、累積構成比（%）を付与する。
 */
export function toParetoData(entries: { name: string; value: number }[]): ParetoDatum[] {
  const sorted = [...entries].filter(e => e.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, e) => sum + e.value, 0)
  let running = 0
  return sorted.map(e => {
    running += e.value
    return {
      name: e.name,
      value: e.value,
      cumulative: total > 0 ? Math.round((running / total) * 100) : 0,
    }
  })
}

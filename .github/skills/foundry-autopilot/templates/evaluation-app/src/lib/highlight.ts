import type { Evidence } from "@/lib/eval-results"

export type Segment = {
  text: string
  /** ハイライトしない素の部分は undefined */
  evidence?: Evidence
}

/**
 * 評価者が抜き出した引用を、原文の中の位置に戻す。
 *
 * 引用は原文の完全一致部分文字列である前提で作らせているので、ここでは曖昧一致を試みない。
 * 一致しなかったものは黙って落とし、根拠の一覧側にだけ文章として残す。
 */
export function highlightSegments(text: string, evidence: Evidence[]): Segment[] {
  if (!text) return []

  const ranges: { start: number; end: number; evidence: Evidence }[] = []
  for (const item of evidence) {
    const quote = item.quote?.trim()
    if (!quote || item.matched === false) continue
    const start = text.indexOf(quote)
    if (start < 0) continue
    ranges.push({ start, end: start + quote.length, evidence: item })
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end)

  const segments: Segment[] = []
  let cursor = 0
  for (const range of ranges) {
    // 先に採った引用と重なるものは捨てる。入れ子のハイライトは読みにくいだけなので。
    if (range.start < cursor) continue
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start) })
    segments.push({ text: text.slice(range.start, range.end), evidence: range.evidence })
    cursor = range.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })

  return segments
}

export function hasHighlight(text: string, evidence: Evidence[]): boolean {
  return highlightSegments(text, evidence).some((segment) => segment.evidence)
}

// エージェント応答の Markdown を安全に描画するための最小パーサー。
// HTML は解釈せず、生成した木を React 要素として描画する前提。

export type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; children: InlineNode[] }
  | { kind: "emphasis"; children: InlineNode[] }
  | { kind: "strike"; children: InlineNode[] }
  | { kind: "link"; href: string; children: InlineNode[] }
  | { kind: "break" }

export type MarkdownBlock =
  | { kind: "heading"; level: number; children: InlineNode[] }
  | { kind: "paragraph"; children: InlineNode[] }
  | { kind: "code"; language: string; value: string }
  | { kind: "list"; ordered: boolean; start: number; items: MarkdownBlock[][] }
  | { kind: "quote"; children: MarkdownBlock[] }
  | { kind: "table"; head: InlineNode[][]; rows: InlineNode[][][] }
  | { kind: "rule" }

const INLINE_PATTERN =
  /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*(?!\s)([^*\n]+?)\*|_(?!\s)([^_\n]+?)_|\[([^\]\n]+)\]\(([^()\s]+)\)/

/** javascript: など実行され得るスキームを除外する */
function safeHref(href: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null
}

function pushText(nodes: InlineNode[], value: string): void {
  if (value) nodes.push({ kind: "text", value })
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let rest = text
  for (let match = INLINE_PATTERN.exec(rest); match; match = INLINE_PATTERN.exec(rest)) {
    pushText(nodes, rest.slice(0, match.index))
    const [, , code, strongStar, strongUnderscore, strike, emphasisStar, emphasisUnderscore, linkText, linkHref] = match
    if (code !== undefined) nodes.push({ kind: "code", value: code.trim() })
    else if (strongStar ?? strongUnderscore) nodes.push({ kind: "strong", children: parseInline((strongStar ?? strongUnderscore)!) })
    else if (strike) nodes.push({ kind: "strike", children: parseInline(strike) })
    else if (emphasisStar ?? emphasisUnderscore) nodes.push({ kind: "emphasis", children: parseInline((emphasisStar ?? emphasisUnderscore)!) })
    else if (linkText && linkHref) {
      const href = safeHref(linkHref)
      if (href) nodes.push({ kind: "link", href, children: parseInline(linkText) })
      else pushText(nodes, match[0])
    }
    rest = rest.slice(match.index + match[0].length)
  }
  pushText(nodes, rest)
  return nodes
}

function parseLines(lines: string[]): InlineNode[] {
  const nodes: InlineNode[] = []
  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ kind: "break" })
    nodes.push(...parseInline(line))
  })
  return nodes
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim())
}

const LIST_MARKER = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const isBlank = (line: string) => !line.trim()
const isRule = (line: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)
const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(line)

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line)) { index += 1; continue }

    const fence = /^\s*(```|~~~)\s*(\S*)/.exec(line)
    if (fence) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[index])) { body.push(lines[index]); index += 1 }
      index += 1
      blocks.push({ kind: "code", language: fence[2] ?? "", value: body.join("\n") })
      continue
    }

    if (isRule(line)) { blocks.push({ kind: "rule" }); index += 1; continue }

    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, children: parseInline(heading[2].replace(/\s+#+\s*$/, "")) })
      index += 1
      continue
    }

    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index])) { body.push(lines[index].replace(/^\s*>\s?/, "")); index += 1 }
      blocks.push({ kind: "quote", children: parseMarkdown(body.join("\n")) })
      continue
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const head = splitRow(line).map(parseInline)
      index += 2
      const rows: InlineNode[][][] = []
      while (index < lines.length && lines[index].includes("|") && !isBlank(lines[index])) {
        rows.push(splitRow(lines[index]).map(parseInline))
        index += 1
      }
      blocks.push({ kind: "table", head, rows })
      continue
    }

    const marker = LIST_MARKER.exec(line)
    if (marker) {
      const ordered = /\d/.test(marker[2])
      const indent = marker[1].length
      const items: MarkdownBlock[][] = []
      let buffer: string[] = []
      const flush = () => { if (buffer.length) items.push(parseMarkdown(buffer.join("\n"))); buffer = [] }
      while (index < lines.length) {
        const current = lines[index]
        const currentMarker = LIST_MARKER.exec(current)
        if (currentMarker && currentMarker[1].length <= indent) {
          if (/\d/.test(currentMarker[2]) !== ordered) break
          flush()
          buffer.push(currentMarker[3])
          index += 1
          continue
        }
        if (!items.length && !buffer.length) break
        if (isBlank(current)) {
          if (index + 1 >= lines.length || !/^\s+\S/.test(lines[index + 1])) break
          buffer.push("")
          index += 1
          continue
        }
        if (!/^\s+\S/.test(current)) break
        buffer.push(current.slice(indent + 2))
        index += 1
      }
      flush()
      blocks.push({ kind: "list", ordered, start: ordered ? Number.parseInt(marker[2], 10) || 1 : 1, items })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && !isBlank(lines[index]) && !LIST_MARKER.test(lines[index]) && !isRule(lines[index])
      && !/^\s{0,3}#{1,6}\s/.test(lines[index]) && !/^\s*>/.test(lines[index]) && !/^\s*(```|~~~)/.test(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    if (!paragraph.length) { index += 1; continue }
    blocks.push({ kind: "paragraph", children: parseLines(paragraph) })
  }
  return blocks
}

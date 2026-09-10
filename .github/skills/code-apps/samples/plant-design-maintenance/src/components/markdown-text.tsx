import { Fragment, type ReactNode } from "react"
import { parseMarkdown, type InlineNode, type MarkdownBlock } from "@/lib/markdown"
import "./markdown-text.css"

function renderInline(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case "text": return <Fragment key={index}>{node.value}</Fragment>
      case "break": return <br key={index} />
      case "code": return <code key={index}>{node.value}</code>
      case "strong": return <strong key={index}>{renderInline(node.children)}</strong>
      case "emphasis": return <em key={index}>{renderInline(node.children)}</em>
      case "strike": return <s key={index}>{renderInline(node.children)}</s>
      case "link": return <a key={index} href={node.href} target="_blank" rel="noreferrer noopener">{renderInline(node.children)}</a>
    }
  })
}

function renderBlocks(blocks: MarkdownBlock[]): ReactNode {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case "heading": {
        const Heading = `h${Math.min(block.level + 2, 6)}` as "h3" | "h4" | "h5" | "h6"
        return <Heading key={index}>{renderInline(block.children)}</Heading>
      }
      case "paragraph": return <p key={index}>{renderInline(block.children)}</p>
      case "code": return <pre key={index}><code>{block.value}</code></pre>
      case "rule": return <hr key={index} />
      case "quote": return <blockquote key={index}>{renderBlocks(block.children)}</blockquote>
      case "list": return block.ordered
        ? <ol key={index} start={block.start}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderBlocks(item)}</li>)}</ol>
        : <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderBlocks(item)}</li>)}</ul>
      case "table": return <div key={index} className="markdown-table-scroll"><table>
        <thead><tr>{block.head.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>)}</tbody>
      </table></div>
    }
  })
}

/** エージェント応答などの Markdown を装飾付きで描画する（HTML は解釈しない） */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return <div className={className ? `markdown-text ${className}` : "markdown-text"}>{renderBlocks(parseMarkdown(text))}</div>
}

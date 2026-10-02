import fs from "node:fs"
import path from "node:path"

const markers = [/\/api\/mcp\b/i, /operationName\s*:\s*["']InvokeServer["']/i]
// Dataverse コネクタ自身のスキーマに Dataverse MCP の操作が同梱されるため、このデータソースだけは検査対象から外す
const BUNDLED_DATA_SOURCE = "commondataserviceforapps"

// dataSourcesInfo.ts をトップレベルのデータソースごとに分け、Dataverse 以外の定義だけを返す
function nonDataverseSections(content) {
  const heads = [...content.matchAll(/^  ["']([^"']+)["']\s*:\s*\{/gm)]
  return heads
    .map((head, index) => ({ name: head[1], body: content.slice(head.index, heads[index + 1]?.index ?? content.length) }))
    .filter(section => section.name !== BUNDLED_DATA_SOURCE)
    .map(section => section.body)
}

function containsDirectMcp(root, filePath, content) {
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/")
  if (relativePath.startsWith(`.power/schemas/${BUNDLED_DATA_SOURCE}/`)) return false
  if (relativePath === ".power/schemas/appschemas/dataSourcesInfo.ts") {
    return nonDataverseSections(content).some(body => markers.some(marker => marker.test(body)))
  }
  return markers.some(marker => marker.test(content))
}

export function findDirectMcpDataSources(root) {
  const matches = []
  const candidates = [path.join(root, ".power"), path.join(root, "src", "generated")]
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const pending = [candidate]
    while (pending.length > 0) {
      const currentPath = pending.pop()
      for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
        const entryPath = path.join(currentPath, entry.name)
        if (entry.isDirectory()) { pending.push(entryPath); continue }
        if (!entry.isFile() || !/\.(json|[cm]?[jt]sx?)$/i.test(entry.name)) continue
        const content = fs.readFileSync(entryPath, "utf-8")
        if (containsDirectMcp(root, entryPath, content)) matches.push(path.relative(root, entryPath))
      }
    }
  }
  return matches.sort()
}
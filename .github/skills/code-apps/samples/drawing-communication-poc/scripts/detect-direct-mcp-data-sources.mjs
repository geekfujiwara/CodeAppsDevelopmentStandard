import fs from "node:fs"
import path from "node:path"

const markers = [/\/api\/mcp\b/i, /operationName\s*:\s*["']InvokeServer["']/i]

function isBundledDataverseMcpOperation(root, filePath, content) {
  const relativePath = path.relative(root, filePath).replaceAll("\\", "/")
  if (relativePath.startsWith(".power/schemas/commondataserviceforapps/")) return true
  if (relativePath !== ".power/schemas/appschemas/dataSourcesInfo.ts") return false

  const dataSourceNames = [...content.matchAll(/^  ["']([^"']+)["']\s*:\s*\{/gm)].map(match => match[1])
  return dataSourceNames.length === 1 && dataSourceNames[0] === "commondataserviceforapps"
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
        if (isBundledDataverseMcpOperation(root, entryPath, content)) continue
        if (markers.some(marker => marker.test(content))) matches.push(path.relative(root, entryPath))
      }
    }
  }
  return matches.sort()
}
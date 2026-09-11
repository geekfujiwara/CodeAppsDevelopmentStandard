import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { findDirectMcpDataSources } from "./detect-direct-mcp-data-sources.mjs"

test("allows Dataverse and Copilot Studio generated services", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codeapp-connections-"))
  try {
    await mkdir(path.join(root, "src", "generated"), { recursive: true })
    await writeFile(path.join(root, "src", "generated", "MicrosoftCopilotStudioService.ts"), "operationName: 'ExecuteCopilotAsyncV2'")
    assert.deepEqual(findDirectMcpDataSources(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("detects MCP schema and generated TypeScript or JavaScript InvokeServer services", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codeapp-connections-"))
  try {
    const schema = path.join(root, ".power", "schemas", "drawing-mcp")
    const generated = path.join(root, "src", "generated", "services")
    await mkdir(schema, { recursive: true })
    await mkdir(generated, { recursive: true })
    await writeFile(path.join(schema, "drawing.Schema.json"), JSON.stringify({ path: "/{connectionId}/api/mcp" }))
    await writeFile(path.join(generated, "DrawingMcpService.ts"), "operationName: 'InvokeServer'")
    await writeFile(path.join(generated, "CompiledMcpService.mjs"), "operationName: 'InvokeServer'")
    assert.deepEqual(findDirectMcpDataSources(root), [
      path.join(".power", "schemas", "drawing-mcp", "drawing.Schema.json"),
      path.join("src", "generated", "services", "CompiledMcpService.mjs"),
      path.join("src", "generated", "services", "DrawingMcpService.ts"),
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { parsePlantPageImage } from "../src/lib/plant-page-images.ts"

test("only matching revision, page and PNG hash are accepted", async () => {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(1200, 16)
  bytes.writeUInt32BE(800, 20)
  const expected = { page: 2, path: "drawings/tank.pdf", drawingNumber: "DWG-TK101-1001", revision: "Rev.B" }
  const image = { ...expected, mimeType: "image/png", width: 1200, height: 800, data: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex") }
  assert.equal((await parsePlantPageImage(JSON.stringify(image), expected)).page, 2)
  for (const change of [{ page: 3 }, { revision: "Rev.A" }, { mimeType: "image/svg+xml" }, { data: "https://evil.example/image" }, { width: 1199 }, { sha256: "0".repeat(64) }]) {
    assert.equal(await parsePlantPageImage(JSON.stringify({ ...image, ...change }), expected), null)
  }
})
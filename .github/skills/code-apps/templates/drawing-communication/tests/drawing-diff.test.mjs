import test from "node:test"
import assert from "node:assert/strict"
import { diffDrawings, summarizeChanges } from "../src/drawing/drawing-diff.ts"
import { createAnnotation, createDrawing } from "../src/drawing/drawing-factory.ts"

const base = createDrawing("generic-equipment-layout", { serial: 3, date: "2026-01-15" })
const annotation = createAnnotation({
  id: "note-001",
  title: "通路幅を確認",
  body: "台車動線の確認が必要",
  at: { x: 120, y: 90 },
  createdAt: "2026-01-15T02:00:00.000Z",
})

test("同一図面の差分は空", () => {
  assert.deepEqual(diffDrawings(base, structuredClone(base)), [])
  assert.equal(summarizeChanges([]), "差分はありません")
})

test("寸法変更は日本語ラベル付きで 1 件として出る", () => {
  const candidate = { ...base, parameters: { ...base.parameters, aisleWidth: 1200 } }
  const changes = diffDrawings(base, candidate)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].path, "parameters.aisleWidth")
  assert.equal(changes[0].kind, "changed")
  assert.equal(changes[0].before, String(base.parameters.aisleWidth))
  assert.equal(changes[0].after, "1200")
  assert.match(changes[0].label, /通路幅/)
})

test("注釈は ID で対応付けて追加・削除・変更を区別する", () => {
  const withAnnotation = { ...base, annotations: [annotation] }
  const added = diffDrawings(base, withAnnotation)
  assert.ok(added.length > 0)
  assert.ok(added.every((change) => change.kind === "added"))
  assert.ok(added.some((change) => change.path.startsWith("annotations.note-001")))

  const removed = diffDrawings(withAnnotation, base)
  assert.ok(removed.every((change) => change.kind === "removed"))

  const edited = { ...base, annotations: [{ ...annotation, status: "resolved", assignee: "検査担当" }] }
  const changes = diffDrawings(withAnnotation, edited)
  assert.deepEqual(
    changes.map((change) => change.path).sort(),
    ["annotations.note-001.assignee", "annotations.note-001.status"],
  )
  assert.match(changes.find((change) => change.path.endsWith("status")).label, /状態/)
  assert.equal(summarizeChanges(changes), "変更 2 / 追加 0 / 削除 0")
})

test("表題欄と改訂番号の変更も差分に含む", () => {
  const candidate = { ...base, revision: base.revision + 1, titleBlock: { ...base.titleBlock, checker: "照査担当" } }
  const changes = diffDrawings(base, candidate)
  assert.deepEqual(changes.map((change) => change.path).sort(), ["revision", "titleBlock.checker"])
  assert.match(changes.find((change) => change.path === "titleBlock.checker").label, /表題欄/)
})

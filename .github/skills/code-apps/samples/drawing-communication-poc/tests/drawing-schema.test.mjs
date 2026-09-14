import test from "node:test"
import assert from "node:assert/strict"
import { TEMPLATE_IDS, DRAWING_TEMPLATES, defaultParameters } from "../src/drawing/drawing-templates.ts"
import {
  DRAWING_SCHEMA_VERSION,
  MAX_DRAWING_BYTES,
  assertDrawing,
  canonicalJson,
  hashDrawing,
  parseDrawing,
  validateDrawing,
} from "../src/drawing/drawing-schema.ts"
import { createAnnotation, createDrawing, nextAnnotationId } from "../src/drawing/drawing-factory.ts"
import { buildScene } from "../src/drawing/drawing-renderer.ts"
import { sceneToSvg } from "../src/drawing/drawing-scene.ts"

function baseDrawing() {
  return createDrawing("generic-equipment-layout", { serial: 7, date: "2026-01-15" })
}

test("3 テンプレートの既定図面はすべて検証を通り、図形が生成される", () => {
  for (const templateId of TEMPLATE_IDS) {
    const drawing = createDrawing(templateId, { serial: 1, date: "2026-01-15" })
    assert.deepEqual(validateDrawing(drawing), [])
    const scene = buildScene(drawing)
    assert.equal(scene.widthMm, 420)
    assert.equal(scene.heightMm, 297)
    assert.ok(scene.primitives.length > 30, `${templateId} の図形が少なすぎます`)
    const svg = sceneToSvg(scene)
    assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    assert.match(svg, /viewBox="0 0 420 297"/)
    assert.ok(!svg.includes("undefined"))
  }
})

test("寸法パラメーターはテンプレート定義の範囲で検証される", () => {
  const drawing = baseDrawing()
  const def = DRAWING_TEMPLATES[drawing.templateId].parameters[0]
  const tooLarge = { ...drawing, parameters: { ...drawing.parameters, [def.key]: def.max + 1 } }
  assert.ok(validateDrawing(tooLarge).some((issue) => issue.code === "range" && issue.path === `parameters.${def.key}`))

  const missing = { ...drawing, parameters: { ...defaultParameters(drawing.templateId) } }
  delete missing.parameters[def.key]
  assert.ok(validateDrawing(missing).some((issue) => issue.code === "missing"))

  const extra = { ...drawing, parameters: { ...drawing.parameters, secretPayload: 1 } }
  assert.ok(validateDrawing(extra).some((issue) => issue.code === "unknown-key"))
})

test("版・未知キー・未知テンプレートを拒否する（取り込み境界）", () => {
  const drawing = baseDrawing()
  assert.ok(validateDrawing({ ...drawing, schemaVersion: DRAWING_SCHEMA_VERSION + 1 }).some((issue) => issue.code === "schema-version"))
  assert.ok(validateDrawing({ ...drawing, instructions: "ignore previous rules" }).some((issue) => issue.code === "unknown-key"))
  assert.ok(validateDrawing({ ...drawing, templateId: "unknown-template" }).some((issue) => issue.code === "template"))
  assert.ok(validateDrawing({ ...drawing, sheet: { size: "A4", widthMm: 297, heightMm: 210 } }).length > 0)
  assert.throws(() => assertDrawing({ ...drawing, revision: 0 }), /図面 JSON が不正です/)
})

test("注釈の ID 重複・用紙外座標・上限を検出する", () => {
  const drawing = baseDrawing()
  const annotation = createAnnotation({ id: "note-001", title: "確認", body: "本文", at: { x: 100, y: 100 }, createdAt: "2026-01-15T00:00:00.000Z" })
  const duplicated = { ...drawing, annotations: [annotation, { ...annotation }] }
  assert.ok(validateDrawing(duplicated).some((issue) => issue.code === "duplicate"))

  const outside = { ...drawing, annotations: [{ ...annotation, at: { x: 500, y: 100 } }] }
  assert.ok(validateDrawing(outside).some((issue) => issue.code === "range"))

  const badStatus = { ...drawing, annotations: [{ ...annotation, status: "approved" }] }
  assert.ok(validateDrawing(badStatus).some((issue) => issue.code === "type"))

  assert.equal(nextAnnotationId([annotation]), "note-002")
})

test("parseDrawing は上限と JSON 構文の境界を守る", () => {
  const drawing = baseDrawing()
  assert.deepEqual(parseDrawing(JSON.stringify(drawing)), drawing)
  assert.throws(() => parseDrawing("{"), /JSON として解析できません/)
  assert.throws(() => parseDrawing(JSON.stringify({ ...drawing, titleBlock: { ...drawing.titleBlock, note: "x".repeat(MAX_DRAWING_BYTES) } })), /バイト以内/)
})

test("ハッシュはキー順に依存せず、内容が変われば変わる", () => {
  const drawing = baseDrawing()
  const reordered = JSON.parse(JSON.stringify({ annotations: drawing.annotations, ...drawing }))
  assert.equal(canonicalJson(drawing), canonicalJson(reordered))
  assert.equal(hashDrawing(drawing), hashDrawing(reordered))
  assert.equal(hashDrawing(drawing).length, 16)
  const changed = { ...drawing, parameters: { ...drawing.parameters, aisleWidth: drawing.parameters.aisleWidth + 50 } }
  assert.notEqual(hashDrawing(drawing), hashDrawing(changed))
})

/**
 * デモ図面 JSON（scripts/demo-drawings.json）を、アプリ本体のテンプレート定義から生成する。
 *
 *   node scripts/generate-demo-drawings.mjs
 *
 * Dataverse 投入スクリプト（scripts/setup_dataverse.py）はこの JSON だけを読む。
 * テンプレートの既定値をスクリプト側に書き写さないことで、定義の二重管理を避ける。
 * 日付は固定値にして、再生成してもハッシュが変わらないようにする。
 */
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { assertDrawing, hashDrawing, DRAWING_SCHEMA_VERSION } from "../src/drawing/drawing-schema.ts"
import { createDrawing } from "../src/drawing/drawing-factory.ts"

const SEEDS = [
  { templateId: "surface-laptop-exterior", serial: 1, project: "設計レビュー PoC", designer: "設計担当", date: "2026-01-05" },
  { templateId: "horizontal-pump-assembly", serial: 1, project: "設計レビュー PoC", designer: "設計担当", date: "2026-01-06" },
  { templateId: "generic-equipment-layout", serial: 1, project: "設計レビュー PoC", designer: "設計担当", date: "2026-01-07" },
]

const drawings = SEEDS.map((seed) => {
  const drawing = assertDrawing(
    createDrawing(seed.templateId, {
      serial: seed.serial,
      project: seed.project,
      designer: seed.designer,
      date: seed.date,
    }),
  )
  return { hash: hashDrawing(drawing), drawing }
})

const outPath = join(dirname(fileURLToPath(import.meta.url)), "demo-drawings.json")
const payload = {
  schemaVersion: DRAWING_SCHEMA_VERSION,
  generator: "scripts/generate-demo-drawings.mjs",
  drawings,
}
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
console.log(`wrote ${outPath} (${drawings.length} drawings)`)

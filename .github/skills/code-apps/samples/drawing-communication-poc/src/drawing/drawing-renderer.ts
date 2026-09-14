/**
 * 図面 JSON → 図形シーン。テンプレート図形に図枠・表題欄・注釈を重ねる。
 */
import type { Drawing } from "./drawing-schema.ts"
import type { DrawingRegion } from "./drawing-templates.ts"
import type { DrawingScene, Primitive } from "./drawing-scene.ts"
import { DRAWING_TEMPLATES } from "./drawing-templates.ts"
import { circle, line, rect, text } from "./drawing-scene.ts"

export const DRAWING_REGION: DrawingRegion = { x: 16, y: 16, w: 388, h: 226 }

const FRAME = { x: 10, y: 10, w: 400, h: 277 }
const TITLE_BLOCK = { x: 240, y: 247, w: 170, h: 40 }

export const ANNOTATION_MARKER_RADIUS = 3.4

function buildFrame(): Primitive[] {
  const primitives: Primitive[] = [rect("frame", FRAME.x, FRAME.y, FRAME.w, FRAME.h), rect("frame", FRAME.x + 2.5, FRAME.y + 2.5, FRAME.w - 5, FRAME.h - 5)]
  const columns = ["A", "B", "C", "D", "E", "F", "G", "H"]
  columns.forEach((label, index) => {
    const x = FRAME.x + (FRAME.w / columns.length) * (index + 0.5)
    primitives.push(text("frame", x, FRAME.y + 2, label, { size: 2.6, anchor: "middle" }))
    primitives.push(text("frame", x, FRAME.y + FRAME.h - 0.6, label, { size: 2.6, anchor: "middle" }))
  })
  return primitives
}

function buildTitleBlock(drawing: Drawing): Primitive[] {
  const { x, y, w, h } = TITLE_BLOCK
  const template = DRAWING_TEMPLATES[drawing.templateId]
  const rows = [y + 12, y + 20, y + 28]
  const primitives: Primitive[] = [
    rect("frame", x, y, w, h),
    line("frame", { x, y: rows[0] }, { x: x + w, y: rows[0] }),
    line("frame", { x, y: rows[1] }, { x: x + w, y: rows[1] }),
    line("frame", { x, y: rows[2] }, { x: x + w, y: rows[2] }),
    line("frame", { x: x + w * 0.55, y: rows[0] }, { x: x + w * 0.55, y: y + h }),
    text("frame", x + 3, y + 8, drawing.titleBlock.title.slice(0, 26), { size: 5, bold: true }),
    text("frame", x + 3, rows[0] + 5.6, `図番 ${drawing.titleBlock.drawingNumber}`, { size: 3.2 }),
    text("frame", x + 3, rows[1] + 5.6, `件名 ${drawing.titleBlock.project.slice(0, 22)}`, { size: 3.2 }),
    text("frame", x + 3, rows[2] + 5.6, `注記 ${drawing.titleBlock.note.slice(0, 22)}`, { size: 3.2 }),
    text("frame", x + w * 0.55 + 3, rows[0] + 5.6, `尺度 ${drawing.titleBlock.scale}`, { size: 3.2 }),
    text("frame", x + w * 0.55 + 3, rows[1] + 5.6, `設計 ${drawing.titleBlock.designer.slice(0, 14)}`, { size: 3.2 }),
    text("frame", x + w * 0.55 + 3, rows[2] + 5.6, `照査 ${drawing.titleBlock.checker.slice(0, 14)}`, { size: 3.2 }),
    text("frame", x + w - 3, y + 8, `Rev.${drawing.revision}`, { size: 4, anchor: "end", bold: true }),
  ]
  primitives.push(text("note", FRAME.x + 6, TITLE_BLOCK.y + 8, template.name, { size: 3.4, bold: true }))
  primitives.push(text("note", FRAME.x + 6, TITLE_BLOCK.y + 14, `作図日 ${drawing.titleBlock.date} / 単位 mm / 第三角法`, { size: 3 }))
  primitives.push(text("note", FRAME.x + 6, TITLE_BLOCK.y + 20, "この図面は検討用です。製作前に有資格者の照査が必要です。", { size: 3 }))
  return primitives
}

function buildAnnotations(drawing: Drawing): Primitive[] {
  const primitives: Primitive[] = []
  drawing.annotations.forEach((annotation, index) => {
    const fill = annotation.status === "resolved" ? "#e2e8f0" : annotation.source === "ai" ? "#fef3c7" : "#fee2e2"
    primitives.push({ ...circle("annotation", annotation.at.x, annotation.at.y, ANNOTATION_MARKER_RADIUS, fill), ref: annotation.id })
    primitives.push({ ...text("annotation", annotation.at.x, annotation.at.y + 1.1, String(index + 1), { size: 2.8, anchor: "middle" }), ref: annotation.id })
  })
  return primitives
}

export function buildScene(drawing: Drawing): DrawingScene {
  const template = DRAWING_TEMPLATES[drawing.templateId]
  return {
    widthMm: drawing.sheet.widthMm,
    heightMm: drawing.sheet.heightMm,
    primitives: [
      ...buildFrame(),
      ...template.build(drawing.parameters, DRAWING_REGION),
      ...buildTitleBlock(drawing),
      ...buildAnnotations(drawing),
    ],
  }
}

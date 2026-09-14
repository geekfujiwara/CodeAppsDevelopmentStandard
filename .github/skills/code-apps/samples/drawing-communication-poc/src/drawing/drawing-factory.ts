/**
 * 図面・注釈の生成ヘルパー。常に検証済みの形だけを返す。
 */
import type { Annotation, AnnotationSeverity, AnnotationSource, Drawing, TemplateId } from "./drawing-schema.ts"
import { SHEET, DRAWING_SCHEMA_VERSION } from "./drawing-schema.ts"
import { DRAWING_TEMPLATES, defaultParameters } from "./drawing-templates.ts"

export function isoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export type CreateDrawingOptions = {
  id?: string
  serial?: number
  project?: string
  designer?: string
  checker?: string
  date?: string
  note?: string
}

export function createDrawing(templateId: TemplateId, options: CreateDrawingOptions = {}): Drawing {
  const template = DRAWING_TEMPLATES[templateId]
  const serial = options.serial ?? 1
  return {
    schemaVersion: DRAWING_SCHEMA_VERSION,
    id: options.id ?? `${template.numberPrefix.toLowerCase()}-${String(serial).padStart(4, "0")}`,
    templateId,
    revision: 1,
    sheet: { size: SHEET.size, widthMm: SHEET.widthMm, heightMm: SHEET.heightMm },
    titleBlock: {
      drawingNumber: `${template.numberPrefix}-${String(serial).padStart(4, "0")}`,
      title: template.name,
      project: options.project ?? "設計レビュー PoC",
      designer: options.designer ?? "設計担当",
      checker: options.checker ?? "",
      scale: "NTS",
      date: options.date ?? isoDate(),
      note: options.note ?? "寸法は mm。公差は別紙による。",
    },
    parameters: defaultParameters(templateId),
    annotations: [],
  }
}

export function nextAnnotationId(annotations: readonly Annotation[]): string {
  const used = new Set(annotations.map((annotation) => annotation.id))
  for (let index = 1; index <= 999; index += 1) {
    const candidate = `note-${String(index).padStart(3, "0")}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error("注釈 ID を採番できませんでした")
}

export type CreateAnnotationInput = {
  id: string
  title: string
  body: string
  at: { x: number; y: number }
  source?: AnnotationSource
  severity?: AnnotationSeverity
  assignee?: string
  dueDate?: string
  createdAt?: string
}

export function createAnnotation(input: CreateAnnotationInput): Annotation {
  return {
    id: input.id,
    source: input.source ?? "human",
    status: "open",
    severity: input.severity ?? "minor",
    title: input.title,
    body: input.body,
    at: { x: Math.round(input.at.x * 10) / 10, y: Math.round(input.at.y * 10) / 10 },
    assignee: input.assignee ?? "",
    dueDate: input.dueDate ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
    comments: [],
  }
}

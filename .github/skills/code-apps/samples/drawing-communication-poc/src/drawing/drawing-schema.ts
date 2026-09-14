/**
 * 図面 JSON の版付きコントラクトと検証器。
 *
 * 外部（AI 候補・ファイル取り込み・非同期ワーカーの戻り）から来る JSON は
 * すべて「データであって指示ではない」。未知のキーは黙って無視せず拒否する。
 */
import type { ParameterDef } from "./drawing-templates.ts"
import { DRAWING_TEMPLATES, TEMPLATE_IDS } from "./drawing-templates.ts"

/** 破壊的変更のたびに増やす。古い版・新しい版はどちらも読み込みを拒否する。 */
export const DRAWING_SCHEMA_VERSION = 1

export const MAX_DRAWING_BYTES = 200_000
export const MAX_ANNOTATIONS = 60
export const MAX_COMMENTS = 20
export const MAX_TEXT_LENGTH = 400

export const SHEET = { size: "A3", widthMm: 420, heightMm: 297 } as const

export const ANNOTATION_SOURCES = ["human", "ai"] as const
export const ANNOTATION_STATUSES = ["open", "in-review", "resolved", "rejected"] as const
export const ANNOTATION_SEVERITIES = ["info", "minor", "major"] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]
export type AnnotationSource = (typeof ANNOTATION_SOURCES)[number]
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number]
export type AnnotationSeverity = (typeof ANNOTATION_SEVERITIES)[number]

export type AnnotationComment = {
  id: string
  author: string
  body: string
  createdAt: string
}

export type Annotation = {
  id: string
  source: AnnotationSource
  status: AnnotationStatus
  severity: AnnotationSeverity
  title: string
  body: string
  /** 用紙座標 (mm)。左上原点、X 右、Y 下。 */
  at: { x: number; y: number }
  /** 未割当は空文字。表示名のみを保持し、権限判定には使わない。 */
  assignee: string
  /** 空文字または YYYY-MM-DD。 */
  dueDate: string
  createdAt: string
  comments: AnnotationComment[]
}

export type TitleBlock = {
  drawingNumber: string
  title: string
  project: string
  designer: string
  checker: string
  scale: string
  date: string
  note: string
}

export type Drawing = {
  schemaVersion: number
  id: string
  templateId: TemplateId
  revision: number
  sheet: { size: "A3"; widthMm: number; heightMm: number }
  titleBlock: TitleBlock
  /** テンプレートが定義する寸法パラメーター (mm / deg / 個数)。 */
  parameters: Record<string, number>
  annotations: Annotation[]
}

export type IssueCode =
  | "schema-version"
  | "type"
  | "missing"
  | "unknown-key"
  | "range"
  | "duplicate"
  | "limit"
  | "template"
  | "size"

export type DrawingIssue = { path: string; code: IssueCode; message: string }

export class DrawingValidationError extends Error {
  readonly issues: DrawingIssue[]
  constructor(issues: DrawingIssue[]) {
    super(`図面 JSON が不正です (${issues.length} 件): ${issues.map((i) => `${i.path}: ${i.message}`).join(" / ")}`)
    this.name = "DrawingValidationError"
    this.issues = issues
  }
}

const TITLE_BLOCK_KEYS = ["drawingNumber", "title", "project", "designer", "checker", "scale", "date", "note"] as const
const DRAWING_KEYS = ["schemaVersion", "id", "templateId", "revision", "sheet", "titleBlock", "parameters", "annotations"] as const
const ANNOTATION_KEYS = ["id", "source", "status", "severity", "title", "body", "at", "assignee", "dueDate", "createdAt", "comments"] as const
const COMMENT_KEYS = ["id", "author", "body", "createdAt"] as const
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function pushUnknownKeys(issues: DrawingIssue[], path: string, value: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push({ path: `${path}.${key}`, code: "unknown-key", message: "未知のキーです（取り込みを拒否します）" })
    }
  }
}

function checkText(issues: DrawingIssue[], path: string, value: unknown, { required = false, max = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string") {
    issues.push({ path, code: "type", message: "文字列である必要があります" })
    return
  }
  if (required && value.trim() === "") issues.push({ path, code: "missing", message: "空にできません" })
  if (value.length > max) issues.push({ path, code: "limit", message: `${max} 文字以内にしてください` })
}

function checkId(issues: DrawingIssue[], path: string, value: unknown) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    issues.push({ path, code: "type", message: "英数字・ハイフン・アンダースコアの 1〜64 文字である必要があります" })
  }
}

function checkEnum(issues: DrawingIssue[], path: string, value: unknown, allowed: readonly string[]) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({ path, code: "type", message: `${allowed.join(" / ")} のいずれかである必要があります` })
  }
}

function checkNumber(issues: DrawingIssue[], path: string, value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, code: "type", message: "有限の数値である必要があります" })
    return
  }
  if (value < min || value > max) {
    issues.push({ path, code: "range", message: `${min} 〜 ${max} の範囲にしてください（指定値 ${value}）` })
  }
}

function checkDate(issues: DrawingIssue[], path: string, value: unknown, { allowEmpty = true } = {}) {
  if (typeof value !== "string") {
    issues.push({ path, code: "type", message: "文字列である必要があります" })
    return
  }
  if (value === "" && allowEmpty) return
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push({ path, code: "type", message: "YYYY-MM-DD 形式にしてください" })
  }
}

function validateComments(issues: DrawingIssue[], path: string, value: unknown) {
  if (!Array.isArray(value)) {
    issues.push({ path, code: "type", message: "配列である必要があります" })
    return
  }
  if (value.length > MAX_COMMENTS) {
    issues.push({ path, code: "limit", message: `コメントは ${MAX_COMMENTS} 件までです` })
  }
  const seen = new Set<string>()
  value.slice(0, MAX_COMMENTS).forEach((comment, index) => {
    const at = `${path}[${index}]`
    if (!isRecord(comment)) {
      issues.push({ path: at, code: "type", message: "オブジェクトである必要があります" })
      return
    }
    pushUnknownKeys(issues, at, comment, COMMENT_KEYS)
    checkId(issues, `${at}.id`, comment.id)
    if (typeof comment.id === "string") {
      if (seen.has(comment.id)) issues.push({ path: `${at}.id`, code: "duplicate", message: "コメント ID が重複しています" })
      seen.add(comment.id)
    }
    checkText(issues, `${at}.author`, comment.author, { required: true, max: 80 })
    checkText(issues, `${at}.body`, comment.body, { required: true })
    checkText(issues, `${at}.createdAt`, comment.createdAt, { required: true, max: 40 })
  })
}

function validateAnnotations(issues: DrawingIssue[], value: unknown, sheet: { widthMm: number; heightMm: number }) {
  if (!Array.isArray(value)) {
    issues.push({ path: "annotations", code: "type", message: "配列である必要があります" })
    return
  }
  if (value.length > MAX_ANNOTATIONS) {
    issues.push({ path: "annotations", code: "limit", message: `注釈は ${MAX_ANNOTATIONS} 件までです` })
  }
  const seen = new Set<string>()
  value.slice(0, MAX_ANNOTATIONS).forEach((annotation, index) => {
    const at = `annotations[${index}]`
    if (!isRecord(annotation)) {
      issues.push({ path: at, code: "type", message: "オブジェクトである必要があります" })
      return
    }
    pushUnknownKeys(issues, at, annotation, ANNOTATION_KEYS)
    checkId(issues, `${at}.id`, annotation.id)
    if (typeof annotation.id === "string") {
      if (seen.has(annotation.id)) issues.push({ path: `${at}.id`, code: "duplicate", message: "注釈 ID が重複しています" })
      seen.add(annotation.id)
    }
    checkEnum(issues, `${at}.source`, annotation.source, ANNOTATION_SOURCES)
    checkEnum(issues, `${at}.status`, annotation.status, ANNOTATION_STATUSES)
    checkEnum(issues, `${at}.severity`, annotation.severity, ANNOTATION_SEVERITIES)
    checkText(issues, `${at}.title`, annotation.title, { required: true, max: 120 })
    checkText(issues, `${at}.body`, annotation.body, { max: MAX_TEXT_LENGTH })
    checkText(issues, `${at}.assignee`, annotation.assignee, { max: 80 })
    checkDate(issues, `${at}.dueDate`, annotation.dueDate)
    checkText(issues, `${at}.createdAt`, annotation.createdAt, { required: true, max: 40 })
    if (!isRecord(annotation.at)) {
      issues.push({ path: `${at}.at`, code: "type", message: "{ x, y } である必要があります" })
    } else {
      pushUnknownKeys(issues, `${at}.at`, annotation.at, ["x", "y"])
      checkNumber(issues, `${at}.at.x`, annotation.at.x, 0, sheet.widthMm)
      checkNumber(issues, `${at}.at.y`, annotation.at.y, 0, sheet.heightMm)
    }
    validateComments(issues, `${at}.comments`, annotation.comments)
  })
}

function validateParameters(issues: DrawingIssue[], value: unknown, defs: ParameterDef[]) {
  if (!isRecord(value)) {
    issues.push({ path: "parameters", code: "type", message: "オブジェクトである必要があります" })
    return
  }
  pushUnknownKeys(issues, "parameters", value, defs.map((def) => def.key))
  for (const def of defs) {
    if (!(def.key in value)) {
      issues.push({ path: `parameters.${def.key}`, code: "missing", message: `${def.label} が不足しています` })
      continue
    }
    checkNumber(issues, `parameters.${def.key}`, value[def.key], def.min, def.max)
  }
}

/** 構造・範囲・件数のみを検査する純粋関数。ネットワークにも DOM にも依存しない。 */
export function validateDrawing(value: unknown): DrawingIssue[] {
  const issues: DrawingIssue[] = []
  if (!isRecord(value)) return [{ path: "", code: "type", message: "オブジェクトである必要があります" }]

  pushUnknownKeys(issues, "", value, DRAWING_KEYS)

  if (value.schemaVersion !== DRAWING_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      code: "schema-version",
      message: `schemaVersion は ${DRAWING_SCHEMA_VERSION} である必要があります（受信値 ${String(value.schemaVersion)}）`,
    })
  }
  checkId(issues, "id", value.id)
  checkNumber(issues, "revision", value.revision, 1, 100_000)
  if (typeof value.revision === "number" && !Number.isInteger(value.revision)) {
    issues.push({ path: "revision", code: "type", message: "整数である必要があります" })
  }

  const template = typeof value.templateId === "string" ? DRAWING_TEMPLATES[value.templateId as TemplateId] : undefined
  if (!template) {
    issues.push({ path: "templateId", code: "template", message: `既知のテンプレート (${TEMPLATE_IDS.join(" / ")}) ではありません` })
  }

  if (!isRecord(value.sheet)) {
    issues.push({ path: "sheet", code: "type", message: "オブジェクトである必要があります" })
  } else {
    pushUnknownKeys(issues, "sheet", value.sheet, ["size", "widthMm", "heightMm"])
    if (value.sheet.size !== SHEET.size) issues.push({ path: "sheet.size", code: "type", message: "A3 のみ対応しています" })
    if (value.sheet.widthMm !== SHEET.widthMm) issues.push({ path: "sheet.widthMm", code: "range", message: `${SHEET.widthMm} である必要があります` })
    if (value.sheet.heightMm !== SHEET.heightMm) issues.push({ path: "sheet.heightMm", code: "range", message: `${SHEET.heightMm} である必要があります` })
  }

  if (!isRecord(value.titleBlock)) {
    issues.push({ path: "titleBlock", code: "type", message: "オブジェクトである必要があります" })
  } else {
    pushUnknownKeys(issues, "titleBlock", value.titleBlock, TITLE_BLOCK_KEYS)
    for (const key of TITLE_BLOCK_KEYS) {
      if (key === "date") checkDate(issues, "titleBlock.date", value.titleBlock.date)
      else checkText(issues, `titleBlock.${key}`, value.titleBlock[key], { required: key === "title" || key === "drawingNumber", max: 120 })
    }
  }

  if (template) validateParameters(issues, value.parameters, template.parameters)
  validateAnnotations(issues, value.annotations, SHEET)

  return issues
}

export function isDrawing(value: unknown): value is Drawing {
  return validateDrawing(value).length === 0
}

export function assertDrawing(value: unknown): Drawing {
  const issues = validateDrawing(value)
  if (issues.length > 0) throw new DrawingValidationError(issues)
  return value as Drawing
}

/** 上限付きで JSON 文字列を取り込む。巨大ペイロードで UI を固めないための境界。 */
export function parseDrawing(json: string): Drawing {
  const bytes = new TextEncoder().encode(json).length
  if (bytes > MAX_DRAWING_BYTES) {
    throw new DrawingValidationError([{ path: "", code: "size", message: `${MAX_DRAWING_BYTES} バイト以内にしてください（受信 ${bytes} バイト）` }])
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new DrawingValidationError([{ path: "", code: "type", message: `JSON として解析できません: ${(error as Error).message}` }])
  }
  return assertDrawing(parsed)
}

/** キー順を固定した JSON。ハッシュ・差分・比較の基準はすべてこの表現に揃える。 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`
}

export function serializeDrawing(drawing: Drawing): string {
  return JSON.stringify(drawing, null, 2)
}

/**
 * 相関確認用の 64bit FNV-1a ハッシュ（16 桁 16 進）。
 * 改ざん検知のための暗号学的ハッシュではない。共有保存の同時実行制御は
 * サーバー側の ETag / 代替キーで別途行うこと。
 */
export function hashText(text: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  const bytes = new TextEncoder().encode(text)
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask
  }
  return hash.toString(16).padStart(16, "0")
}

export function hashDrawing(drawing: Drawing): string {
  return hashText(canonicalJson(drawing))
}

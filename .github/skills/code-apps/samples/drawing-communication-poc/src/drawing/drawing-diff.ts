/**
 * 図面 JSON の差分。候補 JSON を採用する前に「何が変わるのか」を必ず見せるための純粋関数。
 */
import type { Drawing } from "./drawing-schema.ts"
import { DRAWING_TEMPLATES } from "./drawing-templates.ts"

export type ChangeKind = "added" | "removed" | "changed"

export type DrawingChange = {
  path: string
  /** 画面表示用の日本語ラベル */
  label: string
  kind: ChangeKind
  before: string
  after: string
}

export const MAX_CHANGES = 200

const TITLE_BLOCK_LABELS: Record<string, string> = {
  drawingNumber: "図番",
  title: "図面名",
  project: "件名",
  designer: "設計",
  checker: "照査",
  scale: "尺度",
  date: "作図日",
  note: "注記",
}

const ANNOTATION_LABELS: Record<string, string> = {
  title: "見出し",
  body: "本文",
  status: "状態",
  severity: "重要度",
  assignee: "担当者",
  dueDate: "期限",
  source: "発生元",
  at: "位置",
  comments: "コメント",
}

function display(value: unknown): string {
  if (value === undefined) return "（なし）"
  if (value === null) return "null"
  if (typeof value === "object") {
    const title = (value as { title?: unknown }).title
    if (typeof title === "string") return title
    const json = JSON.stringify(value)
    return json.length > 120 ? `${json.slice(0, 120)}…` : json
  }
  return String(value)
}

function labelFor(drawing: Drawing, path: string): string {
  const [head, ...rest] = path.split(".")
  if (head === "parameters") {
    const def = DRAWING_TEMPLATES[drawing.templateId].parameters.find((item) => item.key === rest[0])
    return def ? `寸法: ${def.label} (${def.unit})` : `寸法: ${rest[0]}`
  }
  if (head === "titleBlock") return `表題欄: ${TITLE_BLOCK_LABELS[rest[0]] ?? rest[0]}`
  if (head === "annotations") {
    const field = rest[1]
    return field ? `注釈 ${rest[0]}: ${ANNOTATION_LABELS[field] ?? field}` : `注釈 ${rest[0]}`
  }
  if (head === "revision") return "改訂番号"
  if (head === "templateId") return "テンプレート"
  return path
}

function compare(path: string, before: unknown, after: unknown, out: DrawingChange[]): void {
  if (out.length >= MAX_CHANGES) return
  if (JSON.stringify(before) === JSON.stringify(after)) return

  const bothRecords =
    typeof before === "object" && before !== null && !Array.isArray(before) && typeof after === "object" && after !== null && !Array.isArray(after)

  if (bothRecords) {
    const keys = [...new Set([...Object.keys(before as object), ...Object.keys(after as object)])].sort()
    for (const key of keys) {
      compare(path ? `${path}.${key}` : key, (before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], out)
    }
    return
  }

  if (Array.isArray(before) && Array.isArray(after) && [...before, ...after].every((item) => typeof item === "object" && item !== null && "id" in item)) {
    const beforeMap = new Map(before.map((item) => [String((item as { id: unknown }).id), item]))
    const afterMap = new Map(after.map((item) => [String((item as { id: unknown }).id), item]))
    const ids = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort()
    for (const id of ids) {
      compare(`${path}.${id}`, beforeMap.get(id), afterMap.get(id), out)
    }
    return
  }

  out.push({
    path,
    label: path,
    kind: before === undefined ? "added" : after === undefined ? "removed" : "changed",
    before: display(before),
    after: display(after),
  })
}

export function diffDrawings(base: Drawing, candidate: Drawing): DrawingChange[] {
  const changes: DrawingChange[] = []
  compare("", base as unknown, candidate as unknown, changes)
  return changes
    .filter((change) => change.path !== "" && change.path !== "schemaVersion" && change.path !== "id")
    .map((change) => ({ ...change, label: labelFor(candidate, change.path) }))
}

export function summarizeChanges(changes: DrawingChange[]): string {
  if (changes.length === 0) return "差分はありません"
  const added = changes.filter((change) => change.kind === "added").length
  const removed = changes.filter((change) => change.kind === "removed").length
  const changed = changes.filter((change) => change.kind === "changed").length
  return `変更 ${changed} / 追加 ${added} / 削除 ${removed}`
}

// 想定問答の保存前チェック（純粋関数。アプリの編集画面と単体テストで使う）
import { findNumber } from './engine.ts'
import { extractClaims } from './text.ts'
import type { IrDoc, QaDoc } from './types.ts'

/** 次の問答コード（QA-001 形式の最大 + 1） */
export function nextQaCode(existing: QaDoc[]): string {
  const max = existing.reduce((m, q) => Math.max(m, Number(/^QA-(\d+)$/.exec(q.id)?.[1] ?? 0)), 0)
  return `QA-${String(max + 1).padStart(3, "0")}`
}

export interface QaIssue {
  field: keyof QaDoc
  message: string
  severity: "error" | "warn"
}

/** 保存前の確認。必須・コードの重複・根拠 ID の実在・回答の数値が根拠の IR にあるか */
export function checkQa(doc: QaDoc, existing: QaDoc[], ir: IrDoc[], originalId?: string): QaIssue[] {
  const issues: QaIssue[] = []
  if (!/^QA-\d{3,}$/.test(doc.id)) issues.push({ field: "id", message: "問答コードは QA-001 の形にしてください", severity: "error" })
  if (existing.some((q) => q.id === doc.id && q.id !== originalId)) issues.push({ field: "id", message: `${doc.id} は既にあります`, severity: "error" })
  if (!doc.category.trim()) issues.push({ field: "category", message: "分類を入れてください", severity: "error" })
  if (!doc.question.trim()) issues.push({ field: "question", message: "質問を入れてください", severity: "error" })
  if (!doc.answer.trim()) issues.push({ field: "answer", message: "回答を入れてください", severity: "error" })
  const irById = new Map(ir.map((d) => [d.id, d]))
  const unknown = doc.sourceIds.filter((id) => !irById.has(id))
  if (unknown.length) issues.push({ field: "sourceIds", message: `IR 抜粋に無い根拠 ID: ${unknown.join("、")}`, severity: "warn" })
  const sources = doc.sourceIds.map((id) => irById.get(id)?.text ?? "")
  const unverified = extractClaims(doc.answer).filter((claim) => !sources.some((s) => findNumber(s, claim)))
  if (unverified.length) issues.push({ field: "answer", message: `根拠の IR に無い数値: ${unverified.join("、")}（根拠 ID を足すか数値を直す）`, severity: "warn" })
  if (/^\s*$/.test(doc.responder)) issues.push({ field: "responder", message: "回答者が空です", severity: "warn" })
  return issues
}


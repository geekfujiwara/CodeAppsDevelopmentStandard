// 想定問答をアプリから追加・編集・承認する（Copilot Studio・Cowork で作られた下書きの承認にも使う）
import { createLogger } from "@/lib/debug-log"
import { DATAVERSE_URL, ENTITY, col } from "./config"
import { errorText, withTimeout } from "./corpus"
import { MicrosoftDataverseService } from "./services"
import type { QaDoc } from "./types"
export { checkQa, nextQaCode, type QaIssue } from "./qa-check"

const log = createLogger("qa-edit")
const localMode = () => import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"

export const DRAFT = "下書き"
export const APPROVED = "承認済み"

const join = (v: string[], sep: string) => v.map((s) => s.trim()).filter(Boolean).join(sep)

function toRow(doc: QaDoc): Record<string, unknown> {
  return {
    [col("name")]: doc.id,
    [col("category")]: doc.category.trim(),
    [col("question")]: doc.question.trim(),
    [col("variants")]: join(doc.questionVariants, "\n"),
    [col("keywords")]: join(doc.keywords, " "),
    [col("answer")]: doc.answer.trim(),
    [col("answerpoints")]: join(doc.answerPoints, "\n"),
    [col("responder")]: doc.responder.trim(),
    [col("sourceids")]: join(doc.sourceIds, " "),
    [col("cautions")]: join(doc.cautions, "\n"),
    [col("status")]: doc.status || DRAFT,
    [col("createdvia")]: doc.createdVia || "アプリ",
  }
}

const idCol = () => `${ENTITY.qa.slice(0, -1)}id`

/** 作成（rowId なし）または更新。戻り値は行 ID（テスト用ビルドでは仮の ID） */
export async function saveQa(doc: QaDoc, rowId?: string): Promise<string> {
  if (localMode()) {
    log.info("テスト用ビルドのため想定問答は保存しません（画面だけ更新）", { id: doc.id, status: doc.status })
    return rowId ?? `local-${doc.id}`
  }
  if (rowId) {
    const r = await withTimeout(MicrosoftDataverseService.UpdateRecordWithOrganization("return=minimal", "application/json", DATAVERSE_URL, ENTITY.qa, rowId, toRow(doc)), 20000, "想定問答の更新")
    if (!r.success) throw new Error(`想定問答を更新できません: ${errorText(r.error)}`)
    log.info("想定問答を更新しました", { id: doc.id, status: doc.status })
    return rowId
  }
  const r = await withTimeout(MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json", DATAVERSE_URL, ENTITY.qa, toRow(doc)), 20000, "想定問答の作成")
  if (!r.success) throw new Error(`想定問答を作成できません: ${errorText(r.error)}`)
  const id = String(((r.data as unknown as Record<string, unknown>) ?? {})[idCol()] ?? "")
  log.info("想定問答を作成しました", { id: doc.id, status: doc.status })
  return id
}

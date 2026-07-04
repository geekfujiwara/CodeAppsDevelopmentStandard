import { RESULT_PASS, RESULT_FAIL, RESULT_UNCHECKED } from "@/types/dataverse"

export interface ChecklistStats {
  total: number
  /** 判定済み（未確認以外）の件数 */
  checked: number
  pass: number
  fail: number
  /** 判定済み / 全体（0-100） */
  progress: number
  /** 合格 / (合格 + 不合格) × 100。判定対象が 0 件なら null（未実施） */
  score: number | null
}

/**
 * チェック項目の判定値からスコアと進捗を計算する。
 * - 対象外（N/A）はスコアの分母に含めない（対象外にした項目で点が下がらない）
 * - 未確認は進捗の分母に含める（全項目を確認して初めて 100%）
 */
export function computeChecklistStats(results: number[]): ChecklistStats {
  const total = results.length
  const checked = results.filter(v => v !== RESULT_UNCHECKED).length
  const pass = results.filter(v => v === RESULT_PASS).length
  const fail = results.filter(v => v === RESULT_FAIL).length
  const denominator = pass + fail
  return {
    total,
    checked,
    pass,
    fail,
    progress: total > 0 ? Math.round((checked / total) * 100) : 0,
    score: denominator > 0 ? Math.round((pass / denominator) * 100) : null,
  }
}

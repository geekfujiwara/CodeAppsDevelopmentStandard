/**
 * 非同期会話（要求 / 結果）の相関コントラクト。
 *
 * 画面・ワーカー実装から独立した純粋関数だけを置く。ここで守るのは次の 3 点。
 *   1. 同じ turnId を二度処理しない（重複ターンの拒否）
 *   2. 会話 ID・ターン ID・編集バージョン・基準ハッシュがすべて一致した結果だけを受け入れる
 *   3. 終端状態（completed / failed）かつ上限内の本文だけを結果として扱う
 *
 * これはアプリ側のガードであり、権限境界ではない。サーバー側（Dataverse の所有者・代替キー・
 * 行権限）でも同じ検査を行うこと。
 */

export const TURN_STATUSES = ["pending", "running", "completed", "failed"] as const
export type TurnStatus = (typeof TURN_STATUSES)[number]

export const WORKER_KINDS = ["demo", "dataverse"] as const
export type WorkerKind = (typeof WORKER_KINDS)[number]

export const DRAWING_OPERATIONS = ["review-drawing", "propose-dimension-change", "explain-drawing"] as const
export type DrawingOperation = (typeof DRAWING_OPERATIONS)[number]

export const MAX_PROMPT_LENGTH = 2000
export const MAX_RESULT_BYTES = 200_000

export type TurnScope = {
  conversationId: string
  turnId: string
  /** 送信時点の編集バージョン。下書きを触ると増える。 */
  version: number
  /** 送信時点の図面ハッシュ。 */
  baseHash: string
}

export type TurnRequest = TurnScope & {
  operation: DrawingOperation
  prompt: string
  /** 対象注釈 ID。図面全体への依頼は null。 */
  selection: string | null
  createdAt: string
}

export type TurnReceipt = TurnScope & {
  status: TurnStatus
  workerKind: WorkerKind
  acceptedAt: string
  updatedAt: string
}

export type TurnResult = TurnScope & {
  status: Extract<TurnStatus, "completed" | "failed">
  workerKind: WorkerKind
  summary: string
  /** 図面候補 JSON。説明だけの応答では null。 */
  candidateJson: string | null
  error: string | null
  completedAt: string
}

export type RejectionCode =
  | "duplicate-turn"
  | "unknown-turn"
  | "scope-incomplete"
  | "operation-not-allowed"
  | "prompt-empty"
  | "prompt-too-long"
  | "conversation-mismatch"
  | "turn-mismatch"
  | "version-changed"
  | "base-changed"
  | "not-terminal"
  | "empty-result"
  | "too-large"

const REJECTION_MESSAGES: Record<RejectionCode, string> = {
  "duplicate-turn": "同じターン ID がすでに存在します。再送ではなく既存の受付を再開してください。",
  "unknown-turn": "対応する要求が見つかりません。結果を破棄しました。",
  "scope-incomplete": "会話 ID・ターン ID・バージョン・基準ハッシュのいずれかが欠けています。",
  "operation-not-allowed": "許可されていない操作です。",
  "prompt-empty": "依頼文が空です。",
  "prompt-too-long": `依頼文が長すぎます（${MAX_PROMPT_LENGTH} 文字以内）。`,
  "conversation-mismatch": "会話 ID が一致しません。別の会話の結果は取り込みません。",
  "turn-mismatch": "ターン ID が一致しません。別のターンの結果は取り込みません。",
  "version-changed": "送信後に下書きが編集されました。結果は破棄し、現在の図面で送り直してください。",
  "base-changed": "送信後に図面の内容が変わりました（基準ハッシュ不一致）。結果は破棄しました。",
  "not-terminal": "まだ終端状態ではありません。",
  "empty-result": "結果が空です。成功として扱いません。",
  "too-large": `結果が上限（${MAX_RESULT_BYTES} バイト）を超えています。`,
}

export class ConversationContractError extends Error {
  readonly code: RejectionCode
  constructor(code: RejectionCode) {
    super(REJECTION_MESSAGES[code])
    this.name = "ConversationContractError"
    this.code = code
  }
}

export function describeRejection(code: RejectionCode): string {
  return REJECTION_MESSAGES[code]
}

export function scopeOf(value: TurnScope): TurnScope {
  return { conversationId: value.conversationId, turnId: value.turnId, version: value.version, baseHash: value.baseHash }
}

export function isSameScope(a: TurnScope, b: TurnScope): boolean {
  return a.conversationId === b.conversationId && a.turnId === b.turnId && a.version === b.version && a.baseHash === b.baseHash
}

function isCompleteScope(scope: TurnScope): boolean {
  return (
    typeof scope.conversationId === "string" &&
    scope.conversationId.length > 0 &&
    typeof scope.turnId === "string" &&
    scope.turnId.length > 0 &&
    Number.isInteger(scope.version) &&
    scope.version >= 0 &&
    typeof scope.baseHash === "string" &&
    scope.baseHash.length > 0
  )
}

/** 送信前の検査。現在の編集バージョン・ハッシュと突き合わせる。 */
export function validateRequest(request: TurnRequest, current: { version: number; baseHash: string }): RejectionCode[] {
  const codes: RejectionCode[] = []
  if (!isCompleteScope(request)) codes.push("scope-incomplete")
  if (!DRAWING_OPERATIONS.includes(request.operation)) codes.push("operation-not-allowed")
  if (request.prompt.trim() === "") codes.push("prompt-empty")
  if (request.prompt.length > MAX_PROMPT_LENGTH) codes.push("prompt-too-long")
  if (request.version !== current.version) codes.push("version-changed")
  if (request.baseHash !== current.baseHash) codes.push("base-changed")
  return codes
}

/** 重複ターンの拒否。再送ではなく既存の受付を再開させるための境界。 */
export function assertNewTurn(history: readonly { turnId: string }[], turnId: string): void {
  if (history.some((entry) => entry.turnId === turnId)) throw new ConversationContractError("duplicate-turn")
}

export function isTerminal(status: TurnStatus): status is Extract<TurnStatus, "completed" | "failed"> {
  return status === "completed" || status === "failed"
}

export type AcceptDecision = { accepted: boolean; code: RejectionCode | null; message: string }

/**
 * 非同期境界を越えて戻ってきた結果を受け入れてよいか判定する。
 * 送信時のスコープ（request）と、いま画面が持っている下書き（current）の両方に一致することを要求する。
 */
export function acceptResult(
  request: TurnRequest | null,
  result: TurnResult,
  current: { version: number; baseHash: string },
): AcceptDecision {
  const reject = (code: RejectionCode): AcceptDecision => ({ accepted: false, code, message: REJECTION_MESSAGES[code] })

  if (!request) return reject("unknown-turn")
  if (!isCompleteScope(result)) return reject("scope-incomplete")
  if (result.conversationId !== request.conversationId) return reject("conversation-mismatch")
  if (result.turnId !== request.turnId) return reject("turn-mismatch")
  if (result.version !== request.version || result.version !== current.version) return reject("version-changed")
  if (result.baseHash !== request.baseHash || result.baseHash !== current.baseHash) return reject("base-changed")
  if (!isTerminal(result.status)) return reject("not-terminal")

  if (result.status === "completed") {
    const payload = result.candidateJson ?? ""
    if (payload === "" && result.summary.trim() === "") return reject("empty-result")
    if (payload !== "") {
      const bytes = new TextEncoder().encode(payload).length
      if (bytes > MAX_RESULT_BYTES) return reject("too-large")
    }
  }

  return { accepted: true, code: null, message: result.status === "completed" ? "結果を受け入れました。" : "失敗として記録しました。" }
}

export function nextTurnId(conversationId: string, turnIndex: number): string {
  return `${conversationId}-t${String(turnIndex).padStart(3, "0")}`
}

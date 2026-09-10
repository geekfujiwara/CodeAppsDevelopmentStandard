import type { PlantAgentProgress } from "./plant-agent-progress.ts"

export type PlantConversationScope = {
  conversationId: string
  turnId: string
  version: number
  operation: "plant-design" | "plant-knowledge"
  basis: string
  selection: string
}

export type PlantConversationRequest = PlantConversationScope & { prompt: string }
export type PlantConversationReceipt = { requestId: string; scope: PlantConversationScope }
export type PlantConversationResult = PlantConversationScope & {
  requestId: string
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled"
  reply?: string
  diagnostic?: string
}
export type PlantConversationTransport = {
  submit(request: PlantConversationRequest): Promise<{ requestId: string }>
  read(requestId: string): Promise<PlantConversationResult>
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 500_000

export class PlantConversationReconciliationError extends Error {
  constructor(requestId: string) {
    super(`エージェントの最終回答を確認できませんでした。受付ID: ${requestId}。自動再送は行いません。`)
    this.name = "PlantConversationReconciliationError"
  }
}

export class PlantConversationTerminalError extends Error {
  constructor(status: "failed" | "cancelled") {
    super(`エージェントの実行状態: ${status}`)
    this.name = "PlantConversationTerminalError"
  }
}

export function sameConversationScope(left: PlantConversationScope, right: PlantConversationScope) {
  return left.conversationId === right.conversationId && left.turnId === right.turnId
    && left.version === right.version && left.operation === right.operation
    && left.basis === right.basis && left.selection === right.selection
}

function validateScope(scope: PlantConversationScope) {
  if (!GUID.test(scope.conversationId) || !GUID.test(scope.turnId)
    || !Number.isSafeInteger(scope.version) || scope.version < 1
    || !["plant-design", "plant-knowledge"].includes(scope.operation)
    || typeof scope.basis !== "string" || !scope.basis
    || typeof scope.selection !== "string") throw new Error("要求の会話情報が不正です。")
}

export async function submitPlantConversation(transport: PlantConversationTransport, request: PlantConversationRequest): Promise<PlantConversationReceipt> {
  validateScope(request)
  if (!request.prompt.trim() || new TextEncoder().encode(JSON.stringify(request)).length > MAX_BYTES) {
    throw new Error("要求が空、または500 KBを超えています。")
  }
  const snapshot = structuredClone(request)
  const submitted = await transport.submit(snapshot)
  if (!GUID.test(submitted.requestId)) throw new Error("要求の受付IDを確認できません。再送せず実行履歴を確認してください。")
  const scope: PlantConversationScope = {
    conversationId: snapshot.conversationId, turnId: snapshot.turnId, version: snapshot.version,
    operation: snapshot.operation, basis: snapshot.basis, selection: snapshot.selection,
  }
  return { requestId: submitted.requestId, scope }
}

export function inspectPlantConversation(receipt: PlantConversationReceipt, value: unknown): PlantConversationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("結果の形式が不正です。")
  const result = value as PlantConversationResult
  if (result.requestId !== receipt.requestId || !sameConversationScope(result, receipt.scope)) {
    throw new Error("結果の会話・発話・設計・選択対象が要求と一致しません。")
  }
  if (!["pending", "running", "succeeded", "failed", "cancelled"].includes(result.status)) throw new Error("不明な実行状態です。")
  if (result.status === "succeeded" && (typeof result.reply !== "string" || !result.reply.trim()
    || new TextEncoder().encode(result.reply).length > MAX_BYTES)) throw new Error("完了結果が空、または500 KBを超えています。")
  return result
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, milliseconds)
    signal.addEventListener("abort", abort, { once: true })
  })
}

export async function waitForPlantConversation(transport: PlantConversationTransport, receipt: PlantConversationReceipt, options: {
  signal: AbortSignal
  isCurrent: () => boolean
  onStatus?: (status: PlantConversationResult["status"]) => void
  onProgress?: (progress: PlantAgentProgress) => void
  timeoutMs?: number
  pause?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}): Promise<string> {
  validateScope(receipt.scope)
  if (!GUID.test(receipt.requestId)) throw new Error("要求IDが不正です。")
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 300_000)])
  const active = () => {
    signal.throwIfAborted()
    if (!options.isCurrent()) throw new Error("設計または選択対象が変更されたため、結果は反映しません。")
  }
  const bounded = <Value,>(operation: () => Promise<Value>) => new Promise<Value>((resolve, reject) => {
    active()
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    Promise.resolve().then(() => { active(); return operation() }).then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
  })
  for (let attempt = 0; attempt < 150; attempt++) {
    active()
    const result = inspectPlantConversation(receipt, await bounded(() => transport.read(receipt.requestId)))
    active()
    options.onStatus?.(result.status)
    options.onProgress?.({
      requestId: receipt.requestId, status: result.status, checkedAt: Date.now(),
      needsReconciliation: result.status === "running" && ["AgentOutputRequiresReconciliation", "AgentInvocationIndeterminate"].includes(result.diagnostic ?? ""),
    })
    if (result.status === "succeeded") return result.reply!
    if (result.status === "running" && ["AgentOutputRequiresReconciliation", "AgentInvocationIndeterminate"].includes(result.diagnostic ?? "")) {
      throw new PlantConversationReconciliationError(receipt.requestId)
    }
    if (result.status === "failed" || result.status === "cancelled") throw new PlantConversationTerminalError(result.status)
    await bounded(() => (options.pause ?? wait)(2000, signal))
  }
  throw new Error("結果待機の上限に達しました。同じ要求の結果を再確認してください。")
}
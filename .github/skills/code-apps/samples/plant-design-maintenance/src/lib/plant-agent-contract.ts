import { throwIfPlantAuthenticationRequired } from "./plant-agent-auth.ts"

export const MAX_AGENT_QUESTION_LENGTH = 8000

export type PlantAgentSelection = {
  modelId: string
  modelRevision?: number
  nodeId: string | null
  unitId?: string
  partId?: string
  label: string
}

export function selectionKey(selection: PlantAgentSelection): string {
  return JSON.stringify([selection.modelId, selection.modelRevision ?? null, selection.nodeId, selection.partId ?? null, selection.unitId ?? null])
}

// 発話を挟まずに選択だけを切り替えたときは、直前の選択カードを捨てて最新の 1 枚だけを残す。
export function replaceTrailingSelection<T extends { role: string }>(messages: T[]): T[] {
  const lastUser = messages.reduce((last, message, index) => message.role === "user" ? index : last, -1)
  return messages.filter((message, index) => index <= lastUser || message.role !== "selection")
}

export function bindingFilter(selection: PlantAgentSelection, prefix: string): string {
  if (!selection.modelId || !selection.nodeId || !Number.isInteger(selection.modelRevision) || selection.modelRevision! < 1) {
    throw new Error("モデル改訂または設備が未確定です。")
  }
  const literal = (value: string) => `'${value.replace(/'/g, "''")}'`
  return [
    `${prefix}_modelid eq ${literal(selection.modelId)}`,
    `${prefix}_modelrevision eq ${selection.modelRevision}`,
    `${prefix}_nodeid eq ${literal(selection.nodeId)}`,
    selection.partId ? `${prefix}_partid eq ${literal(selection.partId)}` : `(${prefix}_partid eq null or ${prefix}_partid eq '')`,
    `${prefix}_active eq true`,
    "statecode eq 0",
  ].join(" and ")
}

export type AgentResponseFailure = "sdk" | "incomplete" | "empty" | "shape"

export class AgentResponseError extends Error {
  readonly reason: AgentResponseFailure
  constructor(reason: AgentResponseFailure) {
    super({ sdk: "エージェント呼び出しに失敗しました。接続とアクセス権を確認してください。", incomplete: "応答が完了していません。会話を再開してください。", empty: "応答テキストを取得できませんでした。", shape: "応答本文がありません。" }[reason])
    this.reason = reason
  }
}

export function parseAgentMessages(value: unknown): { messages: string[]; conversationId?: string } {
  throwIfPlantAuthenticationRequired(value)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentResponseError("shape")
  const envelope = value as Record<string, unknown>
  if (envelope.success === false || envelope.error) throw new AgentResponseError("sdk")
  const nested = envelope.data ?? envelope.body
  if (envelope.completed === false && nested && typeof nested === "object") throw new AgentResponseError("incomplete")
  if (nested && typeof nested === "object") return parseAgentMessages(nested)
  const responses = Array.isArray(envelope.responses) ? envelope.responses.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()) : []
  const messages = responses.length ? responses : typeof envelope.lastResponse === "string" && envelope.lastResponse.trim() ? [envelope.lastResponse.trim()] : []
  if (envelope.completed === false && (!messages.length || envelope.isExpectingInput !== false)) throw new AgentResponseError("incomplete")
  if (!messages.length) throw new AgentResponseError("empty")
  return { messages, conversationId: typeof envelope.conversationId === "string" ? envelope.conversationId : undefined }
}

export function parseAgentReply(value: unknown): { text: string; conversationId?: string } {
  const reply = parseAgentMessages(value)
  return { text: reply.messages.join("\n\n"), conversationId: reply.conversationId }
}

export function parseStartedConversationId(value: unknown): string {
  throwIfPlantAuthenticationRequired(value)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AgentResponseError("shape")
  const envelope = value as Record<string, unknown>
  if (envelope.success === false || envelope.error) throw new AgentResponseError("sdk")
  const nested = envelope.data ?? envelope.body
  if (nested && typeof nested === "object") return parseStartedConversationId(nested)
  const conversationId = envelope.conversationID ?? envelope.ConversationId ?? envelope.conversationId
  if (typeof conversationId !== "string" || !conversationId.trim()) throw new AgentResponseError("shape")
  return conversationId
}

export function createRequestGate() {
  let generation = 0
  let busy = false
  return {
    begin() { if (busy) return null; busy = true; return ++generation },
    current(ticket: number) { return busy && ticket === generation },
    finish(ticket: number) { if (ticket === generation) busy = false },
    invalidate() { generation++; busy = false },
  }
}

export function validSourceIndex(row: Record<string, unknown>, prefix: string, tablePrefix: string): boolean {
  const field = (name: string) => row[`${prefix}_${name}`]
  const reference = (name: string) => row[`_${prefix}_${name}_value`]
  const guid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (!guid(row[`${tablePrefix}sourceindexid`]) || field("verified") !== true || row.statecode !== 0 || !guid(reference("tagid"))) return false
  const kind = field("sourcekind")
  const drawing = reference("drawingrevisionid")
  const document = reference("documentid")
  const page = field("pagenumber")
  if (kind === 100000002) return !drawing && !document && typeof field("partcode") === "string" && !!(field("partcode") as string).trim()
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 9999) return false
  if (kind === 100000000) return guid(drawing) && !document
  if (kind === 100000001) return guid(document) && !drawing
  return false
}

export function appendAgentReply<T extends { role: string }>(messages: T[], reply: T): T[] {
  const lastUser = messages.reduce((last, message, index) => message.role === "user" ? index : last, -1)
  const pendingSelection = messages.findIndex((message, index) => index > lastUser && message.role === "selection")
  const insertion = pendingSelection < 0 ? messages.length : pendingSelection
  return [...messages.slice(0, insertion), reply, ...messages.slice(insertion)]
}
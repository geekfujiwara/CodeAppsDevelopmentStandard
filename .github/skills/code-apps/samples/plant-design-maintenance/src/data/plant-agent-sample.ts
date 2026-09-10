import { PLANT_SAMPLES, plantParts } from "./plant-catalog.ts"
import { getPlantMaintenance, parseMaintenanceSummary, type HeatFilter, type MaintenanceHistory } from "./plant-maintenance.ts"
import type { PlantAgentSelection } from "../lib/plant-agent-contract.ts"
import { AgentResponseError, parseAgentMessages, type AgentResponseFailure } from "../lib/plant-agent-contract.ts"

export class SampleAgentError extends Error {
  readonly code: "transport" | "response" | "format" | "evidence"
  constructor(code: SampleAgentError["code"], reason?: AgentResponseFailure) {
    const messages = {
      transport: "v1への通信に失敗しました。接続とアクセス権を確認してください。 [SA-01]",
      response: "v1から完了した回答を取得できませんでした。 [SA-02]",
      format: "v1は応答しましたが、指定したJSON回答形式ではありません。 [SA-03]",
      evidence: "v1の回答に形式不正または選択履歴にない出典が含まれるため、表示を停止しました。 [SA-04]",
    }
    const responseMessages = {
      sdk: "Copilot Studioコネクタが失敗応答を返しました。接続・権限・公開状態を確認してください。 [SA-02-SDK]",
      incomplete: "v1は処理未完了を返しました。認証やツール入力の待機中か、Studioの実行履歴を確認してください。 [SA-02-INCOMPLETE]",
      empty: "v1の応答にテキストがありません。カードのみの応答や回答未生成の可能性があります。 [SA-02-EMPTY]",
      shape: "コネクタから解析可能な応答オブジェクトを取得できませんでした。 [SA-02-SHAPE]",
    }
    super(code === "response" && reason ? responseMessages[reason] : messages[code])
    this.code = code
  }
}

export function parseSampleAgentReply(value: unknown, history: MaintenanceHistory) {
  let reply: ReturnType<typeof parseAgentMessages>
  try { reply = parseAgentMessages(value) } catch (error) { throw new SampleAgentError("response", error instanceof AgentResponseError ? error.reason : undefined) }
  const candidates = reply.messages.filter((message) => /^(?:\{|```(?:json)?\s)/i.test(message.trim()))
  if (candidates.length !== 1) throw new SampleAgentError("format")
  return { text: parseSampleAgentAnswer(candidates[0], history), conversationId: reply.conversationId }
}

export function plantAgentSample(selection: PlantAgentSelection, filter: HeatFilter): MaintenanceHistory | null {
  const sample = PLANT_SAMPLES.find((item) => item.id === selection.modelId)
  const node = sample?.nodes.find((item) => item.id === selection.nodeId)
  if (!sample || !node || selection.modelRevision !== 1) return null
  if (selection.partId && !plantParts(node).some((part) => part.id === selection.partId)) return null
  const history = getPlantMaintenance(sample.id, node.id, selection.partId)
  const failures = filter.from && filter.to && filter.from > filter.to ? [] : history.failures.filter((record) =>
    (!filter.from || record.occurredOn >= filter.from) && (!filter.to || record.occurredOn <= filter.to) && (!filter.unresolvedOnly || record.status !== "resolved"))
  const ids = new Set(failures.map((record) => record.id))
  return { ...history, failures, repairs: history.repairs.filter((repair) => ids.has(repair.failureId)) }
}

export function parseSampleAgentAnswer(text: string, history: MaintenanceHistory): string {
  const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new SampleAgentError("format") }
  let summary: ReturnType<typeof parseMaintenanceSummary>
  try { summary = parseMaintenanceSummary(parsed, history) } catch { throw new SampleAgentError("evidence") }
  return ["サンプル履歴に基づく回答", ...summary.findings.map((item) => `${item.text}\n出典: ${item.sourceIds.join(", ")}`),
    ...(summary.unresolved.length ? ["確認できなかったこと", ...summary.unresolved.map((item) => `${item.text}\n出典: ${item.sourceIds.join(", ")}`)] : [])].join("\n\n")
}
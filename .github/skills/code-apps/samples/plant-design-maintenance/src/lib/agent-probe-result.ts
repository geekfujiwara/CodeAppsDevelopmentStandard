export function agentProbeResult(data: unknown): string {
  if (!data || typeof data !== "object") return "応答テキスト未確認"
  const value = data as Record<string, unknown>
  const responses = Array.isArray(value.responses)
    ? value.responses.filter((entry): entry is string => typeof entry === "string")
    : []
  if (responses.length) return `受信内容: ${responses.join("\n\n")}`
  if (typeof value.lastResponse === "string" && value.lastResponse) return `受信内容: ${value.lastResponse}`
  if (value.body && typeof value.body === "object") return agentProbeResult(value.body)
  return "応答テキスト未確認"
}
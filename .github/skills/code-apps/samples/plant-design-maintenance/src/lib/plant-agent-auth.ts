export type PlantAuthenticationReason = "sign-in" | "consent"

export class PlantAuthenticationRequiredError extends Error {
  readonly reason: PlantAuthenticationReason
  readonly conversationId?: string

  constructor(reason: PlantAuthenticationReason, conversationId?: string) {
    super(reason === "consent" ? "接続へのサインインと同意が必要です。" : "接続へのサインインが必要です。")
    this.name = "PlantAuthenticationRequiredError"
    this.reason = reason
    this.conversationId = conversationId
  }
}

const authCodes = new Set(["unauthorized", "authenticationrequired", "invalidconnection", "connectionauthorizationfailed", "invalid_grant", "interaction_required", "login_required", "tokenexpired"])
const consentCodes = new Set(["aadsts65001", "consent_required", "consentrequired"])
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined

export function detectPlantAuthentication(value: unknown): PlantAuthenticationRequiredError | undefined {
  if (value instanceof PlantAuthenticationRequiredError) return value
  let reason: PlantAuthenticationReason | undefined
  let conversationId: string | undefined
  const seen = new Set<object>()
  const visit = (input: unknown, depth: number, errorContext = false) => {
    const current = record(input)
    if (!current || depth > 6 || seen.size >= 200 || seen.has(current)) return
    seen.add(current)
    for (const key of ["conversationId", "conversationID", "ConversationId"]) {
      const identifier = current[key]
      if (typeof identifier === "string" && /^[a-zA-Z0-9-]{1,200}$/.test(identifier)) conversationId ??= identifier
    }
    if (errorContext) {
      const code = typeof current.code === "string" ? current.code.toLowerCase() : ""
      if (consentCodes.has(code) || current.suberror === "consent_required") reason = "consent"
      else if (authCodes.has(code) || current.status === 401 || current.statusCode === 401) reason ??= "sign-in"
      if (typeof current.message === "string" && /\bAADSTS65001\b/.test(current.message)) reason = "consent"
      if (typeof current.error === "string" && consentCodes.has(current.error.toLowerCase())) reason = "consent"
      else if (typeof current.error === "string" && authCodes.has(current.error.toLowerCase())) reason ??= "sign-in"
    }
    for (const key of ["data", "body"]) visit(current[key], depth + 1, errorContext)
    for (const key of ["error", "innerError"]) visit(current[key], depth + 1, true)
    if (Array.isArray(current.attachments)) {
      for (const attachment of current.attachments.slice(0, 50)) {
        const type = record(attachment)?.contentType
        if (type === "application/vnd.microsoft.card.oauth" || type === "application/vnd.microsoft.card.signin") reason ??= "sign-in"
      }
    }
    for (const key of ["activities", "responses"]) {
      if (Array.isArray(current[key])) for (const activity of current[key].slice(0, 50)) visit(activity, depth + 1)
    }
  }
  visit(value, 0, true)
  return reason ? new PlantAuthenticationRequiredError(reason, conversationId) : undefined
}

export function throwIfPlantAuthenticationRequired(value: unknown): void {
  const required = detectPlantAuthentication(value)
  if (required) throw required
}

export function plantConnectionManagerUrl(environmentId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(environmentId)) throw new Error("接続先の環境を確認できません。")
  return `https://make.powerapps.com/environments/${environmentId}/connections`
}

export const PLANT_CONNECTION_SERVICES = [
  { id: "dataverse", name: "Microsoft Dataverse", detail: "設備対応・資料索引", connector: "Microsoft Dataverse" },
  { id: "drawings", name: "図面・設計文書", detail: "図面と設計書の参照", connector: "drawing-files-mcp" },
  { id: "failures", name: "故障管理", detail: "故障実績と修理履歴の参照", connector: "failure-db-mcp" },
] as const
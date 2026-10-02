// 画面の設定で変えられる値（モデルのデプロイ・推論の強さ・文字起こしの接続先）の許可リストと検証。
// クライアントから任意のデプロイ名や URL を受け取らないよう、選べる値は Function のアプリ設定だけで決める。

export const EFFORTS = ["none", "minimal", "low", "medium"] as const
export type Effort = (typeof EFFORTS)[number]

export interface ModelOptions {
  deployment: string
  reasoningEffort: Effort
  maxTokens: number
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean)

/** 選べるデプロイ（AOAI_DEPLOYMENTS。既定の AOAI_DEPLOYMENT は常に含む） */
export function allowedDeployments(): string[] {
  const fallback = process.env.AOAI_DEPLOYMENT ?? ""
  return [...new Set([fallback, ...list(process.env.AOAI_DEPLOYMENTS)].filter(Boolean))]
}

const LIMITS = { answer: { min: 200, max: 2000, default: 1200 }, identify: { min: 100, max: 600, default: 300 } }

/** 要求の options を検証する。省略した項目はアプリ設定の既定を使う。許可リストに無い値は拒否する */
export function resolveModelOptions(raw: unknown, kind: "answer" | "identify"): { ok: true; value: ModelOptions } | { ok: false; reason: string } {
  const o = (raw ?? {}) as Partial<Record<keyof ModelOptions, unknown>>
  const allowed = allowedDeployments()
  const deployment = typeof o.deployment === "string" && o.deployment ? o.deployment : allowed[0]
  if (!deployment) return { ok: false, reason: "no deployment is configured" }
  if (!allowed.includes(deployment)) return { ok: false, reason: `deployment is not allowed: ${deployment.slice(0, 60)}` }
  const effort = (typeof o.reasoningEffort === "string" && o.reasoningEffort ? o.reasoningEffort : process.env.AOAI_REASONING_EFFORT || "none") as Effort
  if (!EFFORTS.includes(effort)) return { ok: false, reason: `reasoningEffort must be one of ${EFFORTS.join(", ")}` }
  const limit = LIMITS[kind]
  const maxTokens = o.maxTokens === undefined || o.maxTokens === null ? limit.default : Number(o.maxTokens)
  if (!Number.isInteger(maxTokens) || maxTokens < limit.min || maxTokens > limit.max) return { ok: false, reason: `maxTokens must be ${limit.min}-${limit.max}` }
  return { ok: true, value: { deployment, reasoningEffort: effort, maxTokens } }
}

export interface SttEndpoint {
  id: string
  label: string
  endpoint: string
  region: string
  /** "fast" は Fast Transcription の既定モデル（enhancedMode なし）。それ以外は MAI-Transcribe のモデル名 */
  models: string[]
}

/**
 * 文字起こしの接続先（STT_ENDPOINTS: JSON 配列）。例:
 * [{"id":"sea","label":"MAI（東南アジア）","endpoint":"https://<name>.cognitiveservices.azure.com","region":"southeastasia","models":["MAI-Transcribe-1.5","MAI-Transcribe-2"]}]
 */
export function sttEndpoints(): SttEndpoint[] {
  try {
    const parsed = JSON.parse(process.env.STT_ENDPOINTS ?? "[]") as SttEndpoint[]
    return (Array.isArray(parsed) ? parsed : []).filter((e) => e && typeof e.id === "string" && /^https:\/\/[a-z0-9-]+\.cognitiveservices\.azure\.com\/?$/.test(e.endpoint) && Array.isArray(e.models))
  } catch {
    return []
  }
}

/** 画面に返す設定の選択肢（URL は返さない） */
export function publicConfig() {
  return {
    deployments: allowedDeployments(),
    defaultDeployment: allowedDeployments()[0] ?? null,
    efforts: EFFORTS,
    defaultEffort: process.env.AOAI_REASONING_EFFORT || "none",
    limits: LIMITS,
    stt: sttEndpoints().map((e) => ({ id: e.id, label: e.label, region: e.region, models: e.models })),
    realtime: { region: process.env.SPEECH_REGION ?? "" },
  }
}

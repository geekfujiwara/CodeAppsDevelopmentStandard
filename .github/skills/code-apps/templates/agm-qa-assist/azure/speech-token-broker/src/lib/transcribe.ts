import { accessToken } from "./answer"
import { sttEndpoints, type SttEndpoint } from "./options"

// 区間の音声を Fast Transcription（MAI-Transcribe は enhancedMode）で認識する。Managed Identity（Foundry User）で呼ぶ。
export interface TranscribeRequest {
  endpointId: string
  model: string
  /** WAV（16 kHz / 16 bit / mono 推奨）の base64 */
  audio: string
  locale: string
  phrases: string[]
  style?: "verbatim" | "clean"
}

export interface TranscribeResult {
  text: string
  phrases: { text: string; offsetMs: number; durationMs: number }[]
  durationMs: number
  ms: number
  model: string
}

const API = "speechtotext/transcriptions:transcribe?api-version=2025-10-15"
/** 1 区間の上限（16 kHz / 16 bit で約 2 分） */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024
/** MAI のキーワード一覧の上限（実測: 200 件で「Context list cannot have more than 200 items」） */
export const MAI_PHRASE_LIMIT = 100

export function validateTranscribeRequest(body: unknown): { ok: true; value: TranscribeRequest; endpoint: SttEndpoint; bytes: Buffer } | { ok: false; reason: string } {
  const b = body as Partial<TranscribeRequest> | null
  if (!b || typeof b !== "object") return { ok: false, reason: "body must be JSON" }
  const endpoint = sttEndpoints().find((e) => e.id === b.endpointId)
  if (!endpoint) return { ok: false, reason: "endpointId is not allowed" }
  if (typeof b.model !== "string" || !endpoint.models.includes(b.model)) return { ok: false, reason: "model is not allowed for the endpoint" }
  if (typeof b.audio !== "string" || !b.audio) return { ok: false, reason: "audio is required" }
  const bytes = Buffer.from(b.audio, "base64")
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return { ok: false, reason: "audio must be a WAV file" }
  if (bytes.length > MAX_AUDIO_BYTES) return { ok: false, reason: `audio is larger than ${MAX_AUDIO_BYTES} bytes` }
  const style = b.style === "clean" || b.style === "verbatim" ? b.style : undefined
  const phrases = (Array.isArray(b.phrases) ? b.phrases : [])
    .filter((p): p is string => typeof p === "string" && !!p.trim())
    .map((p) => p.trim().slice(0, 50))
    .slice(0, b.model === "fast" ? 500 : MAI_PHRASE_LIMIT)
  const locale = typeof b.locale === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(b.locale) ? b.locale : "ja"
  return { ok: true, value: { endpointId: endpoint.id, model: b.model, audio: "", locale, phrases, style }, endpoint, bytes }
}

/** Fast Transcription の definition。MAI は enhancedMode でモデルを指定し、言語は "ja"。既定モデルは "ja-JP" */
export function definitionOf(req: TranscribeRequest): Record<string, unknown> {
  const mai = req.model !== "fast"
  const language = mai ? req.locale.split("-")[0] : req.locale.includes("-") ? req.locale : `${req.locale}-JP`
  return {
    locales: [language],
    ...(req.phrases.length ? { phraseList: { phrases: req.phrases } } : {}),
    ...(mai ? { enhancedMode: { enabled: true, model: req.model, ...(req.style ? { modelOptions: { transcribeStyle: req.style } } : {}) } } : {}),
  }
}

export async function transcribe(req: TranscribeRequest, endpoint: SttEndpoint, audio: Buffer): Promise<TranscribeResult> {
  const t0 = Date.now()
  const form = new FormData()
  form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "audio.wav")
  form.append("definition", JSON.stringify(definitionOf(req)))
  const res = await fetch(`${endpoint.endpoint.replace(/\/+$/, "")}/${API}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}` },
    body: form,
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`transcribe failed: ${res.status} ${raw.slice(0, 300)}`)
  const body = JSON.parse(raw) as { durationMilliseconds?: number; combinedPhrases?: { text: string }[]; phrases?: { text: string; offsetMilliseconds: number; durationMilliseconds: number }[] }
  return {
    text: (body.combinedPhrases ?? []).map((p) => p.text).join(""),
    phrases: (body.phrases ?? []).map((p) => ({ text: p.text, offsetMs: p.offsetMilliseconds, durationMs: p.durationMilliseconds })),
    durationMs: body.durationMilliseconds ?? 0,
    ms: Date.now() - t0,
    model: req.model,
  }
}

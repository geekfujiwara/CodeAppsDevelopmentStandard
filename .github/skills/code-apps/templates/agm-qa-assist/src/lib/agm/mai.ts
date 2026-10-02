// 区間の録音を Function の /transcribe（MAI-Transcribe・Fast Transcription）で認識する
import { withTimeout } from "./corpus"
import { getAnswerTicket } from "./generate"

export interface TranscribeOptions {
  endpointId: string
  model: string
  style?: "verbatim" | "clean"
  phrases: string[]
  locale?: string
}

export interface TranscribeResult {
  text: string
  ms: number
  /** 内訳（チケット・base64 化・通信） */
  breakdown: { encodeMs: number; ticketMs: number; fetchMs: number }
  model: string
  durationMs: number
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function transcribeWav(audio: Blob, options: TranscribeOptions): Promise<TranscribeResult> {
  const t0 = performance.now()
  const body = JSON.stringify({ ...options, locale: options.locale ?? "ja", audio: await toBase64(audio) })
  const encodeMs = Math.round(performance.now() - t0)
  let ticketMs = 0
  let sentAt = 0
  const call = async (force: boolean) => {
    const tt = performance.now()
    const ticket = await getAnswerTicket(force)
    ticketMs += Math.round(performance.now() - tt)
    sentAt = performance.now()
    return withTimeout(
      fetch(ticket.endpoint.replace(/\/answer\/stream$/, "/transcribe"), { method: "POST", headers: { Authorization: `Ticket ${ticket.ticket}`, "Content-Type": "application/json" }, body }),
      30000,
      "文字起こし（MAI）",
    )
  }
  let res = await call(false)
  // チケット（15 分）が切れていたら取り直して 1 回だけやり直す
  if (res.status === 401) res = await call(true)
  if (!res.ok) throw new Error(`文字起こし API が ${res.status} を返しました: ${(await res.text()).slice(0, 120)}`)
  const out = (await res.json()) as { text: string; model: string; durationMs: number }
  return { text: out.text, model: out.model, durationMs: out.durationMs, ms: Math.round(performance.now() - t0), breakdown: { encodeMs, ticketMs, fetchMs: Math.round(performance.now() - sentAt) } }
}

export { charDiffRate, diffSegments } from "./text-diff"

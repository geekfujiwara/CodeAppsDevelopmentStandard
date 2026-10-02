import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions"
import { verifyTicket } from "../lib/ticket"
import { publicConfig } from "../lib/options"
import { transcribe, validateTranscribeRequest } from "../lib/transcribe"

const NO_STORE = { "Cache-Control": "no-store", "Content-Type": "application/json" }

/** 設定画面の選択肢（選べるデプロイ・推論の強さ・文字起こしの接続先とモデル）。チケットで認証する */
export async function config(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = verifyTicket(request.headers.get("authorization"))
  if (!auth.ok) {
    context.warn(`config rejected: ${auth.reason}`)
    return { status: 401, headers: NO_STORE, jsonBody: { error: "unauthorized" } }
  }
  return { status: 200, headers: NO_STORE, jsonBody: publicConfig() }
}

/** 区間の音声を MAI-Transcribe（または Fast Transcription の既定モデル）で認識する。チケットで認証する */
export async function transcribeAudio(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = verifyTicket(request.headers.get("authorization"))
  if (!auth.ok) {
    context.warn(`transcribe rejected: ${auth.reason}`)
    return { status: 401, headers: NO_STORE, jsonBody: { error: "unauthorized" } }
  }
  let parsed: ReturnType<typeof validateTranscribeRequest>
  try {
    parsed = validateTranscribeRequest(await request.json())
  } catch {
    parsed = { ok: false, reason: "body must be JSON" }
  }
  if (!parsed.ok) return { status: 400, headers: NO_STORE, jsonBody: { error: parsed.reason } }
  try {
    const result = await transcribe(parsed.value, parsed.endpoint, parsed.bytes)
    // 発言の本文は個人情報を含み得るためログに出さない
    context.log(`transcribe oid=${auth.claims.oid} endpoint=${parsed.endpoint.id} model=${parsed.value.model} bytes=${parsed.bytes.length} audioMs=${result.durationMs} out=${result.text.length}ch ms=${result.ms}`)
    return { status: 200, headers: NO_STORE, jsonBody: result }
  } catch (error) {
    context.error(`transcribe failed: ${(error as Error).message}`)
    return { status: 502, headers: NO_STORE, jsonBody: { error: "文字起こしに失敗しました" } }
  }
}

app.http("settingsConfig", { route: "config", methods: ["GET"], authLevel: "anonymous", handler: config })
app.http("transcribe", { route: "transcribe", methods: ["POST"], authLevel: "anonymous", handler: transcribeAudio })

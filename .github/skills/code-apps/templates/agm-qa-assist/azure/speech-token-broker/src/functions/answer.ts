import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions"
import { verifyRequest } from "../lib/auth"
import { issueTicket, verifyTicket } from "../lib/ticket"
import { openChatStream, parseOpenAiEvent, validateRequest, warmUp, type StreamTiming } from "../lib/answer"
import { identifyShareholder, validateIdentifyRequest } from "../lib/identify"
import { resolveModelOptions, type ModelOptions } from "../lib/options"

warmUp()

const NO_STORE = { "Cache-Control": "no-store", "Content-Type": "application/json" }

/** コネクタ経由（利用者の委任トークン）で、生成 API を呼ぶための短期チケットを出す */
export async function answerTicket(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = await verifyRequest(request.headers.get("authorization"))
  if (!auth.ok) {
    context.warn(`answer-ticket rejected: ${auth.reason}`)
    return { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" }, jsonBody: { error: "unauthorized" } }
  }
  try {
    const { ticket, claims } = issueTicket(auth.caller.oid, auth.caller.upn)
    const origin = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || new URL(request.url).origin
    context.log(`answer-ticket issued for oid=${auth.caller.oid} jti=${claims.jti}`)
    return {
      status: 200,
      headers: NO_STORE,
      jsonBody: { ticket, endpoint: `${origin}/api/answer/stream`, expiresAt: new Date(claims.exp * 1000).toISOString(), expiresInSeconds: claims.exp - Math.floor(Date.now() / 1000) },
    }
  } catch (error) {
    context.error(`answer-ticket failed: ${(error as Error).message}`)
    return { status: 500, headers: NO_STORE, jsonBody: { error: "ticket unavailable" } }
  }
}

/** チケットで認証し、根拠付きの回答案を Server-Sent Events で流す */
export async function answerStream(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = verifyTicket(request.headers.get("authorization"))
  if (!auth.ok) {
    context.warn(`answer-stream rejected: ${auth.reason}`)
    return { status: 401, headers: NO_STORE, jsonBody: { error: "unauthorized" } }
  }
  let parsed: ReturnType<typeof validateRequest>
  let options: ReturnType<typeof resolveModelOptions> = { ok: false, reason: "body must be JSON" }
  try {
    const json = (await request.json()) as { options?: unknown }
    parsed = validateRequest(json)
    options = resolveModelOptions(json?.options, "answer")
  } catch {
    parsed = { ok: false, reason: "body must be JSON" }
  }
  if (!parsed.ok) return { status: 400, headers: NO_STORE, jsonBody: { error: parsed.reason } }
  if (!options.ok) return { status: 400, headers: NO_STORE, jsonBody: { error: options.reason } }
  const req = parsed.value
  const opts: ModelOptions = options.value
  const t0 = Date.now()
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      let firstTokenMs: number | null = null
      let chars = 0
      let usage: unknown
      try {
        send({ type: "start", model: opts.deployment, reasoningEffort: opts.reasoningEffort, maxTokens: opts.maxTokens })
        const timing: StreamTiming = { tokenMs: 0, headersMs: 0 }
        const res = await openChatStream(req, undefined, timing, opts)
        send({ type: "meta", ...timing })
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let index: number
          while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index).trim()
            buffer = buffer.slice(index + 1)
            const event = parseOpenAiEvent(line)
            if (!event) continue
            if (event.delta) {
              firstTokenMs ??= Date.now() - t0
              chars += event.delta.length
              send({ type: "delta", text: event.delta })
            }
            if (event.usage) usage = event.usage
          }
        }
        send({ type: "done", firstTokenMs, totalMs: Date.now() - t0, usage })
      } catch (error) {
        context.error(`answer-stream failed: ${(error as Error).message}`)
        send({ type: "error", message: "生成に失敗しました" })
      } finally {
        // 発言の本文は個人情報を含み得るためログに出さない
        context.log(`answer-stream oid=${auth.claims.oid} model=${opts.deployment}/${opts.reasoningEffort} mode=${req.mode} q=${req.question.length}ch qa=${req.qa.length} ir=${req.ir.length} out=${chars}ch first=${firstTokenMs}ms total=${Date.now() - t0}ms`)
        controller.close()
      }
    },
  })

  return {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    body,
  }
}

/** チケットで認証し、名乗りの発言と名簿の候補から株主を特定する（生成 AI の構造化出力） */
export async function identify(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = verifyTicket(request.headers.get("authorization"))
  if (!auth.ok) {
    context.warn(`identify rejected: ${auth.reason}`)
    return { status: 401, headers: NO_STORE, jsonBody: { error: "unauthorized" } }
  }
  let parsed: ReturnType<typeof validateIdentifyRequest>
  let options: ReturnType<typeof resolveModelOptions> = { ok: false, reason: "body must be JSON" }
  try {
    const json = (await request.json()) as { options?: unknown }
    parsed = validateIdentifyRequest(json)
    options = resolveModelOptions(json?.options, "identify")
  } catch {
    parsed = { ok: false, reason: "body must be JSON" }
  }
  if (!parsed.ok) return { status: 400, headers: NO_STORE, jsonBody: { error: parsed.reason } }
  if (!options.ok) return { status: 400, headers: NO_STORE, jsonBody: { error: options.reason } }
  try {
    const result = await identifyShareholder(parsed.value, options.value)
    // 発言・名簿の内容は個人情報のためログに出さない
    context.log(`identify oid=${auth.claims.oid} candidates=${parsed.value.candidates.length} found=${result.number !== null} conf=${result.confidence.toFixed(2)} ms=${result.ms}`)
    return { status: 200, headers: NO_STORE, jsonBody: result }
  } catch (error) {
    context.error(`identify failed: ${(error as Error).message}`)
    return { status: 502, headers: NO_STORE, jsonBody: { error: "照合に失敗しました" } }
  }
}

app.http("shareholderIdentify", { route: "shareholder/identify", methods: ["POST"], authLevel: "anonymous", handler: identify })
app.http("answerTicket", { route: "answer/ticket", methods: ["GET"], authLevel: "anonymous", handler: answerTicket })
app.http("answerStream", { route: "answer/stream", methods: ["POST"], authLevel: "anonymous", handler: answerStream })

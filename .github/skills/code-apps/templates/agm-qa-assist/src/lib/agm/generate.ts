import { AGMSpeechTokenBrokerService } from "./services"
import { createLogger } from "@/lib/debug-log"
import { currentSettings } from "./settings"
import { errorText, withTimeout } from "./corpus"
import type { IrDoc, QaDoc } from "./types"

const log = createLogger("generate")

type Ticket = { ticket: string; endpoint: string; expiresAt: number }
let cached: Ticket | null = null
let inflight: Promise<Ticket> | null = null

/**
 * 生成 API のチケットをコネクタ経由（利用者の権限）で取る。15 分有効なので、失効 60 秒前まで使い回す。
 * ホスト再現テスト用のビルドでは VITE_DEV_ANSWER_TICKET_URL のファイルを使う。
 */
export async function getAnswerTicket(force = false): Promise<Ticket> {
  // テスト用ビルドだけ: 同じオリジンに置いたチケットのファイルを読む（チケットは 15 分で切れるため、ビルドに埋め込まない）
  const devUrl = import.meta.env.VITE_DEV_ANSWER_TICKET_URL
  if (devUrl) {
    const t = (await (await fetch(devUrl, { cache: "no-store" })).json()) as { ticket: string; endpoint: string; expiresAt: string }
    return { ticket: t.ticket, endpoint: t.endpoint, expiresAt: new Date(t.expiresAt).getTime() }
  }
  if (!force && cached && cached.expiresAt - Date.now() > 60_000) return cached
  inflight ??= withTimeout(AGMSpeechTokenBrokerService.GetAnswerTicket(), 20000, "生成チケットの取得")
    .then((result) => {
      if (!result.success || !result.data) throw new Error(`生成チケットを取得できません: ${errorText(result.error)}`)
      const d = result.data as unknown as { ticket: string; endpoint: string; expiresAt: string }
      const t: Ticket = { ticket: d.ticket, endpoint: d.endpoint, expiresAt: new Date(d.expiresAt).getTime() }
      log.info("生成チケットを取得", { endpoint: t.endpoint, expiresInSec: Math.round((t.expiresAt - Date.now()) / 1000) })
      cached = t
      return t
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export interface GenerateInput {
  mode: "draft" | "search"
  question: string
  qa: QaDoc[]
  ir: IrDoc[]
}

export interface GenerateResult {
  text: string
  model?: string
  firstMs: number | null
  totalMs: number
}

const toContext = (input: GenerateInput) => ({
  mode: input.mode,
  question: input.question,
  qa: input.qa.map((q) => ({ id: q.id, category: q.category, question: q.question, answer: q.answer, answerPoints: q.answerPoints, cautions: q.cautions, responder: q.responder })),
  ir: input.ir.map((d) => ({ id: d.id, docTitle: d.docTitle, section: d.section, page: d.page, text: d.text })),
})

/** Server-Sent Events の 1 件（data: 行）を取り出す。途中で切れた分は残りとして返す */
export function splitSse(buffer: string): { events: Record<string, unknown>[]; rest: string } {
  const events: Record<string, unknown>[] = []
  const parts = buffer.split(/\r?\n\r?\n/)
  const rest = parts.pop() ?? ""
  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("")
    if (!data) continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // 壊れた 1 件は捨てる
    }
  }
  return { events, rest }
}

/**
 * 根拠（想定問答・IR 抜粋）を渡して回答案を生成し、差分を onDelta で順に返す。
 * チケットの失効（401）は 1 回だけ取り直して再試行する。
 */
export async function streamAnswer(input: GenerateInput, onDelta: (text: string) => void, signal?: AbortSignal): Promise<GenerateResult> {
  const t0 = performance.now()
  let first: number | null = null
  let model: string | undefined
  let text = ""
  for (let attempt = 0; attempt < 2; attempt++) {
    const ticket = await getAnswerTicket(attempt > 0)
    const res = await fetch(ticket.endpoint, {
      method: "POST",
      headers: { Authorization: `Ticket ${ticket.ticket}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...toContext(input), options: currentSettings().answer }),
      signal,
    })
    if (res.status === 401 && attempt === 0) {
      log.warn("生成チケットが無効になったため取り直します")
      cached = null
      continue
    }
    if (!res.ok || !res.body) throw new Error(`生成 API が ${res.status} を返しました`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = splitSse(buffer)
      buffer = rest
      for (const event of events) {
        if (event.type === "start") model = String(event.model ?? "")
        else if (event.type === "delta" && typeof event.text === "string") {
          first ??= performance.now() - t0
          text += event.text
          onDelta(event.text)
        } else if (event.type === "error") throw new Error(String(event.message ?? "生成に失敗しました"))
      }
    }
    break
  }
  return { text, model, firstMs: first === null ? null : Math.round(first), totalMs: Math.round(performance.now() - t0) }
}

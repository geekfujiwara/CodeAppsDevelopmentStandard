import { createLogger } from "@/lib/debug-log"
import { getAnswerTicket } from "./generate"
import { withTimeout } from "./corpus"
import type { Shareholder } from "./shareholders"
import { rivalsOf, shortlist, type Candidate } from "./match"

export type { Candidate }

const log = createLogger("identify")

export interface Identification {
  number: string | null
  confidence: number
  reason: string
  ms: number
  model?: string
  candidates: Candidate[]
}

/**
 * 名乗りの発言を名簿と照らして株主を特定する。候補は端末で選び、最終判断を生成 AI（構造化出力）に任せる。
 * 生成 AI が使えないときは、候補の 1 位を一致度そのままで返す。
 */
export async function identifyShareholder(utterance: string, register: Shareholder[]): Promise<Identification> {
  const candidates = shortlist(register, utterance)
  if (!candidates.length) return { number: null, confidence: 0, reason: "名簿に近い株主がいません", ms: 0, candidates }
  const t0 = performance.now()
  try {
    const ticket = await getAnswerTicket()
    const endpoint = ticket.endpoint.replace(/\/answer\/stream$/, "/shareholder/identify")
    const res = await withTimeout(
      fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Ticket ${ticket.ticket}`, "Content-Type": "application/json" },
        body: JSON.stringify({ utterance, candidates: candidates.map((c) => ({ number: c.shareholder.number, name: c.shareholder.name, kana: c.shareholder.kana })) }),
      }),
      15000,
      "株主の照合",
    )
    if (!res.ok) throw new Error(`照合 API が ${res.status} を返しました`)
    const r = (await res.json()) as { number: string | null; confidence: number; reason: string; model?: string }
    const rivals = rivalsOf(r.number, candidates)
    // 見分けのつかない候補がいれば自動では決めない（候補の先頭に、選んだ株主と紛らわしい人を並べる）
    const result = rivals.length
      ? { number: r.number, confidence: Math.min(r.confidence, 0.7), reason: `${r.reason}（紛らわしい候補: ${rivals.map((x) => `${x.shareholder.number} ${x.shareholder.name}`).join("、")}）`, model: r.model, ms: Math.round(performance.now() - t0), candidates: [...candidates.filter((x) => x.shareholder.number === r.number), ...rivals, ...candidates.filter((x) => x.shareholder.number !== r.number && !rivals.includes(x))] }
      : { number: r.number, confidence: r.confidence, reason: r.reason, model: r.model, ms: Math.round(performance.now() - t0), candidates }
    log.info("株主を照合しました", { number: result.number, confidence: result.confidence, ms: result.ms, candidates: candidates.length })
    return result
  } catch (error) {
    log.warn("生成 AI で照合できないため、候補の 1 位を使います", String(error))
    const top = candidates[0]
    return { number: top.shareholder.number, confidence: Math.min(0.6, top.score), reason: "名簿との近さだけで推定（生成 AI 不使用）", ms: Math.round(performance.now() - t0), candidates }
  }
}

import { useCallback, useEffect, useRef, useState } from "react"
import { createLogger } from "@/lib/debug-log"
import type { Card, Engine } from "@/lib/agm/engine"
import { errorText } from "@/lib/agm/corpus"
import { streamAnswer, type GenerateInput } from "@/lib/agm/generate"
import type { IrDoc, QaDoc } from "@/lib/agm/types"

const log = createLogger("generate")

export type GenStatus = "waiting" | "streaming" | "done" | "error"
export interface Generation {
  status: GenStatus
  text: string
  key: string
  model?: string
  firstMs?: number | null
  totalMs?: number
  error?: string
  sources: string[]
}

const MAX_PARALLEL = 2
const DEBOUNCE_MS = 500

/** カードの質問に合わせて、生成に渡す根拠を選ぶ（採用・上位の想定問答と、その根拠の IR + 質問文で引いた IR） */
export function contextFor(engine: Engine, irById: Map<string, IrDoc>, card: Card): { qa: QaDoc[]; ir: IrDoc[] } {
  const ordered = [...card.segment.candidates].sort((a, b) => (a.doc.id === card.adoptedQaId ? -1 : b.doc.id === card.adoptedQaId ? 1 : 0))
  const qa = card.segment.novel && !card.adoptedQaId ? [] : ordered.slice(0, 2).map((h) => h.doc)
  const ir: IrDoc[] = []
  const add = (d?: IrDoc) => d && !ir.some((x) => x.id === d.id) && ir.push(d)
  qa.flatMap((q) => q.sourceIds).forEach((id) => add(irById.get(id)))
  engine.searchIr(card.segment.text, 4).forEach((h) => add(h.doc))
  return { qa, ir: ir.slice(0, 5) }
}

/**
 * 質問カードごとに回答案を生成してストリームで受け取る。
 * 文字起こしが確定した（途中結果を含まない）カードだけを対象にし、質問文や採用した想定問答が変わったら作り直す。
 */
export function useGenerations(engine: Engine | null, irDocs: IrDoc[], cards: Card[], interimStart: number, enabled: boolean, resetKey: string) {
  const [gens, setGens] = useState<Record<string, Generation>>({})
  const controllers = useRef(new Map<string, AbortController>())
  const running = useRef(0)
  const queue = useRef<{ id: string; key: string; input: GenerateInput; sources: string[] }[]>([])
  // 株主が替わって画面から消えた後も、保存のために完成した生成文を残す
  const archive = useRef(new Map<string, { text: string; model?: string }>())
  const irById = useRef(new Map<string, IrDoc>())
  irById.current = new Map(irDocs.map((d) => [d.id, d]))

  const pump = useCallback(() => {
    while (running.current < MAX_PARALLEL && queue.current.length) {
      const job = queue.current.shift()!
      const controller = new AbortController()
      controllers.current.get(job.id)?.abort()
      controllers.current.set(job.id, controller)
      running.current += 1
      setGens((g) => ({ ...g, [job.id]: { status: "streaming", text: "", key: job.key, sources: job.sources } }))
      log.info("回答案の生成を開始", { card: job.id, mode: job.input.mode, qa: job.input.qa.map((q) => q.id), ir: job.input.ir.map((d) => d.id) })
      streamAnswer(job.input, (delta) => setGens((g) => (g[job.id]?.key === job.key ? { ...g, [job.id]: { ...g[job.id], text: g[job.id].text + delta } } : g)), controller.signal)
        .then((r) => {
          archive.current.set(job.id, { text: r.text, model: r.model })
          setGens((g) => (g[job.id]?.key === job.key ? { ...g, [job.id]: { ...g[job.id], status: "done", model: r.model, firstMs: r.firstMs, totalMs: r.totalMs } } : g))
          log.info("回答案の生成が完了", { card: job.id, model: r.model, firstMs: r.firstMs, totalMs: r.totalMs, chars: r.text.length })
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          log.error("回答案の生成に失敗", error)
          setGens((g) => (g[job.id]?.key === job.key ? { ...g, [job.id]: { ...g[job.id], status: "error", error: errorText(error) } } : g))
        })
        .finally(() => {
          running.current -= 1
          if (controllers.current.get(job.id) === controller) controllers.current.delete(job.id)
          pump()
        })
    }
  }, [])

  const request = useCallback(
    (card: Card, key: string) => {
      if (!engine) return
      const { qa, ir } = contextFor(engine, irById.current, card)
      if (!qa.length && !ir.length) return
      queue.current = queue.current.filter((j) => j.id !== card.id)
      queue.current.push({ id: card.id, key, input: { mode: "draft", question: card.segment.text, qa, ir }, sources: [...qa.map((q) => q.answer), ...ir.map((d) => d.text)] })
      setGens((g) => ({ ...g, [card.id]: { status: "waiting", text: "", key, sources: [] } }))
      pump()
    },
    [engine, pump],
  )

  // 株主が替わったら、生成中のものを止めて一覧を空にする
  useEffect(() => {
    controllers.current.forEach((c) => c.abort())
    controllers.current.clear()
    queue.current = []
    setGens({})
  }, [resetKey])

  // 確定したカードを、質問文と採用の組み合わせが変わったときだけ（少し待ってから）生成する
  const latest = useRef({ gens, request })
  latest.current = { gens, request }
  useEffect(() => {
    if (!enabled || !engine) return
    const timer = window.setTimeout(() => {
      for (const card of cards) {
        if (card.segment.span.end > interimStart) continue
        const key = `${card.segment.text}|${card.adoptedQaId ?? card.segment.candidates[0]?.doc.id ?? "-"}`
        if (latest.current.gens[card.id]?.key === key) continue
        latest.current.request(card, key)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [cards, interimStart, enabled, engine])

  const regenerate = useCallback((card: Card) => request(card, `${card.segment.text}|${card.adoptedQaId ?? "-"}|${Date.now()}`), [request])

  const generatedFor = useCallback((cardId: string) => archive.current.get(cardId), [])

  return { gens, regenerate, generatedFor }
}

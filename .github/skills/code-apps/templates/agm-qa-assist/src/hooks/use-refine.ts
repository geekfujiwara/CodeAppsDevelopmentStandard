import { useEffect, useRef, useState } from "react"
import { createLogger } from "@/lib/debug-log"
import type { FinalLine } from "@/hooks/use-continuous-session"
import { transcribeWav } from "@/lib/agm/mai"
import { currentSettings, type SttEngine } from "@/lib/agm/settings"

const log = createLogger("refine")
const MAX_PARALLEL = 2

export interface Refined {
  status: "pending" | "done" | "error" | "skipped"
  text?: string
  ms?: number
  model?: string
  error?: string
}

/**
 * Azure Speech（リアルタイム）の確定文ごとに、その区間の録音を MAI-Transcribe で認識し直す。
 * engine が "mai" なら画面と質問の整理に MAI の結果を使い、"compare" なら両方を並べる（質問の整理は Azure のまま）。
 */
export function useRefine(lines: FinalLine[], engine: SttEngine, slice: (fromMs: number, toMs: number) => Blob | null, phrases: string[], resetKey: unknown) {
  const [refined, setRefined] = useState<Record<number, Refined>>({})
  const queued = useRef(new Set<number>())
  const running = useRef(0)
  const queue = useRef<FinalLine[]>([])
  const enqueuedAt = useRef(new Map<number, number>())
  const latest = useRef({ slice, phrases })
  latest.current = { slice, phrases }

  useEffect(() => {
    queued.current = new Set()
    queue.current = []
    setRefined({})
  }, [resetKey])

  useEffect(() => {
    if (engine === "azure") return
    const pump = () => {
      while (running.current < MAX_PARALLEL && queue.current.length) {
        const line = queue.current.shift()!
        const audio = latest.current.slice(line.offsetMs, line.offsetMs + (line.durationMs ?? 0))
        if (!audio) {
          setRefined((r) => ({ ...r, [line.id]: { status: "skipped", error: "録音が無い区間です（文字だけのリハーサル、または保存済みの区間）" } }))
          continue
        }
        running.current += 1
        const queuedAt = enqueuedAt.current.get(line.id) ?? performance.now()
        const s = currentSettings().stt
        setRefined((r) => ({ ...r, [line.id]: { status: "pending", model: s.model } }))
        transcribeWav(audio, { endpointId: s.endpointId, model: s.model, style: s.style, phrases: s.phrases ? latest.current.phrases : [] })
          .then((res) => {
            setRefined((r) => ({ ...r, [line.id]: { status: "done", text: res.text, ms: res.ms, model: res.model } }))
            log.info("確定文を認識し直しました", { line: line.id, model: res.model, ms: res.ms, ...res.breakdown, sinceFinalMs: Math.round(performance.now() - queuedAt), azure: line.text, mai: res.text })
          })
          .catch((error) => {
            setRefined((r) => ({ ...r, [line.id]: { status: "error", error: String(error) } }))
            log.warn("確定文を認識し直せません（Azure の結果を使います）", { line: line.id, error: String(error) })
          })
          .finally(() => {
            running.current -= 1
            pump()
          })
      }
    }
    for (const line of lines) {
      if (queued.current.has(line.id) || !line.durationMs) continue
      queued.current.add(line.id)
      enqueuedAt.current.set(line.id, performance.now())
      queue.current.push(line)
    }
    pump()
  }, [lines, engine])

  return refined
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createLogger } from "@/lib/debug-log"
import { createEngine, reconcileCards, type Card, type Engine } from "@/lib/agm/engine"
import type { Corpus, TranscriptView } from "@/lib/agm/types"

const log = createLogger("analysis")

/**
 * 発言（ターン）の文字起こしが更新されるたびに質問の区切り・候補検索をやり直し、カードの id を引き継ぐ。
 * ターンが切り替わったら、前のターンのカード（採用状態を含む）を控えて、画面を新しいターンでやり直す。
 */
export function useAgmAnalysis(corpus: Corpus | null, turnKey: string, view: TranscriptView) {
  const engine: Engine | null = useMemo(() => (corpus ? createEngine(corpus) : null), [corpus])
  const [cards, setCards] = useState<Card[]>([])
  const [lastMs, setLastMs] = useState(0)
  const counter = useRef(0)
  const previous = useRef<Card[]>([])
  const currentKey = useRef(turnKey)
  const snapshots = useRef(new Map<string, Card[]>())

  useEffect(() => {
    if (!engine) return
    if (currentKey.current !== turnKey) {
      snapshots.current.set(currentKey.current, previous.current)
      currentKey.current = turnKey
      previous.current = snapshots.current.get(turnKey) ?? []
    }
    if (!view.text) {
      previous.current = []
      setCards([])
      return
    }
    const t0 = performance.now()
    const segments = engine.analyze(view.text)
    const next = reconcileCards(previous.current, segments, () => `q${++counter.current}`)
    const added = next.filter((c) => !previous.current.some((p) => p.id === c.id))
    for (const card of added) {
      log.info("質問を検出", { turn: turnKey, id: card.id, category: card.segment.category, top: card.segment.candidates[0]?.doc.id, novel: card.segment.novel })
    }
    previous.current = next
    setCards(next)
    setLastMs(performance.now() - t0)
  }, [engine, turnKey, view.text])

  const adopt = useCallback((cardId: string, qaId: string) => {
    const next = previous.current.map((c) => (c.id === cardId ? { ...c, adoptedQaId: qaId } : c))
    previous.current = next
    setCards(next)
    log.info("候補を採用", { cardId, qaId })
  }, [])

  /** 閉じたターンのカード。最後に解析した内容と、確定した全文の解析を突き合わせて採用状態を引き継ぐ */
  const finalCards = useCallback(
    (key: string, analysisText: string): Card[] => {
      if (!engine) return []
      const base = key === currentKey.current ? previous.current : snapshots.current.get(key) ?? []
      const result = reconcileCards(base, analysisText ? engine.analyze(analysisText) : [], () => `q${++counter.current}`)
      snapshots.current.delete(key)
      return result
    },
    [engine],
  )

  return { engine, cards, lastMs, adopt, finalCards }
}

/** 振り返り用。保存した文字起こしをそのまま解析する（ターンの切り替えは無い） */
export function analyzeOnce(engine: Engine | null, text: string): Card[] {
  if (!engine || !text) return []
  let n = 0
  return reconcileCards([], engine.analyze(text), () => `r${++n}`)
}

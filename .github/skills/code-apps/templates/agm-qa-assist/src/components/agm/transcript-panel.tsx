import { useEffect, useRef, useState } from "react"
import { Mic } from "lucide-react"
import type { Card } from "@/lib/agm/engine"
import type { TranscriptView } from "@/lib/agm/types"
import { qColor, qTint } from "./colors"

type Piece = { text: string; card?: number; interim: boolean; answer: boolean; start: number }

function splitPieces(view: TranscriptView, cards: Card[], answerFrom: number): Piece[] {
  const cuts = new Set<number>([0, view.text.length, view.interimStart, answerFrom])
  cards.forEach((c) => {
    cuts.add(c.segment.span.start)
    cuts.add(c.segment.span.end)
  })
  const points = [...cuts].filter((n) => n >= 0 && n <= view.text.length).sort((a, b) => a - b)
  const pieces: Piece[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const [start, end] = [points[i], points[i + 1]]
    if (start === end) continue
    const card = cards.findIndex((c) => c.segment.span.start <= start && end <= c.segment.span.end)
    pieces.push({ text: view.text.slice(start, end), card: card >= 0 ? card : undefined, interim: start >= view.interimStart, answer: start >= answerFrom, start })
  }
  return pieces
}

export function TranscriptPanel({
  view,
  cards,
  selectedId,
  onSelect,
  listening,
  answerFrom,
  title,
}: {
  view: TranscriptView
  cards: Card[]
  selectedId?: string
  onSelect: (id: string) => void
  listening: boolean
  /** 回答（議長・役員）が始まる位置。そこから先は薄く表示する */
  answerFrom: number
  title?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && follow) el.scrollTop = el.scrollHeight
  }, [view.text, follow])

  const pieces = splitPieces(view, cards, answerFrom)

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-xl border border-agm-line bg-agm-panel" aria-label="文字起こし">
      <header className="flex items-center justify-between gap-2 border-b border-agm-line px-4 py-2.5">
        <h2 className="min-w-0 truncate text-sm font-semibold tracking-wide text-agm-muted">① 文字起こし{title ? `（${title}）` : ""}</h2>
        {!follow && (
          <button type="button" className="text-xs text-agm-accent underline-offset-2 hover:underline" onClick={() => setFollow(true)}>
            最新へ戻る
          </button>
        )}
      </header>
      <div
        ref={scrollRef}
        className="agm-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
        onScroll={(e) => {
          const el = e.currentTarget
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
        }}
        data-testid="transcript"
      >
        {view.text ? (
          <p className="whitespace-pre-wrap break-words text-[17px] leading-8">
            {pieces.map((p) => {
              const card = p.card === undefined ? undefined : cards[p.card]
              const style = card
                ? { background: qTint(p.card!, card.id === selectedId ? 34 : 20), boxShadow: `inset 0 -2px 0 ${qColor(p.card!)}` }
                : undefined
              return (
                <span
                  key={p.start}
                  className={`${p.answer ? "text-agm-muted/80" : ""} ${p.start === answerFrom && p.answer ? "before:mr-1 before:rounded before:bg-agm-line before:px-1.5 before:py-0.5 before:text-[11px] before:text-agm-muted before:content-['回答'] before:not-italic" : ""} ${p.interim ? "text-agm-muted underline decoration-dotted decoration-agm-muted/60 underline-offset-4" : ""} ${card ? "cursor-pointer rounded-sm px-0.5 transition-colors" : ""}`}
                  style={style}
                  onClick={card ? () => onSelect(card.id) : undefined}
                  data-question={card ? `Q${p.card! + 1}` : undefined}
                >
                  {p.text}
                </span>
              )
            })}
          </p>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-agm-muted">
            <Mic className="size-8 opacity-60" aria-hidden />
            <p className="text-sm">{listening ? "発言を待っています…" : "「開始」を押すと、発言がここに流れます。株主番号は名乗った番号から自動で拾います"}</p>
          </div>
        )}
      </div>
    </section>
  )
}

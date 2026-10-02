import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { CircleHelp, Sparkles } from "lucide-react"
import type { Card } from "@/lib/agm/engine"
import { qColor, qTint } from "./colors"

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-agm-line" aria-hidden>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  )
}

export function QuestionCards({
  cards,
  selectedId,
  onSelect,
  onAdopt,
  registerRef,
  scrollRef,
  resetKey,
}: {
  cards: Card[]
  selectedId?: string
  onSelect: (id: string) => void
  onAdopt: (cardId: string, qaId: string) => void
  registerRef: (id: string, el: HTMLElement | null) => void
  scrollRef: (el: HTMLDivElement | null) => void
  /** 株主が替わったら一覧を作り直す（前の株主のカードを残さない） */
  resetKey: string
}) {
  const reduce = useReducedMotion()
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-xl border border-agm-line bg-agm-panel" aria-label="質問カード">
      <header className="flex items-center justify-between gap-2 border-b border-agm-line px-4 py-2.5">
        <h2 className="text-sm font-semibold tracking-wide text-agm-muted">② 質問の整理</h2>
        <span className="text-xs text-agm-muted">{cards.length ? `${cards.length} 件` : ""}</span>
      </header>
      <div ref={scrollRef} className="agm-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-testid="question-cards">
        {!cards.length && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-agm-muted">
            <Sparkles className="size-7 opacity-60" aria-hidden />
            <p className="text-sm">質問を聞き取ると、ここに分類して並べます</p>
          </div>
        )}
        <LayoutGroup key={resetKey}>
          {cards.map((card, index) => {
            const color = qColor(index)
            const selected = card.id === selectedId
            const activeId = card.adoptedQaId ?? card.segment.candidates[0]?.doc.id
            const novel = card.segment.novel
            return (
              <motion.article
                key={card.id}
                ref={(el: HTMLElement | null) => registerRef(card.id, el)}
                layout={!reduce}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                onClick={() => onSelect(card.id)}
                className={`min-w-0 cursor-pointer rounded-lg border bg-agm-raised p-3 outline-none transition-shadow ${reduce ? "" : "animate-in fade-in-0 slide-in-from-bottom-3 duration-300"} ${novel ? "border-dashed" : ""}`}
                style={{ borderColor: selected ? color : "var(--agm-line)", boxShadow: selected ? `0 0 0 1px ${color}` : undefined }}
                aria-current={selected}
                data-testid="question-card"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-xs font-bold text-agm-bg" style={{ background: color }}>
                    Q{index + 1}
                  </span>
                  <span className="truncate text-sm font-semibold" style={{ color: novel ? "var(--agm-warn)" : undefined }}>
                    {card.segment.category}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-agm-muted">
                    一致度
                    <Meter value={card.segment.confidence} color={novel ? "var(--agm-warn)" : color} />
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 rounded px-2 py-1 text-[13px] leading-6" style={{ background: qTint(index, 12) }}>
                  {card.segment.text}
                </p>
                {novel && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-agm-warn">
                    <CircleHelp className="size-3.5" aria-hidden />
                    想定問答に該当なし（新規質問として記録します）
                  </p>
                )}
                <ol className="mt-2 space-y-1">
                  {card.segment.candidates.map((hit, rank) => {
                    const active = hit.doc.id === activeId
                    return (
                      <li key={hit.doc.id}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelect(card.id)
                            onAdopt(card.id, hit.doc.id)
                          }}
                          className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors ${active ? "bg-agm-bg" : "hover:bg-agm-bg/60"}`}
                          style={active ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                          aria-pressed={active}
                          title={active ? "この想定問答で回答案を作っています" : "この想定問答を採用する"}
                        >
                          <span className="w-4 shrink-0 text-agm-muted">{rank + 1}</span>
                          <span className="shrink-0 font-mono text-[11px] text-agm-muted">{hit.doc.id}</span>
                          <span className="min-w-0 truncate">{hit.doc.question}</span>
                          {card.adoptedQaId === hit.doc.id && <span className="ml-auto shrink-0 text-[11px] text-agm-ok">採用</span>}
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </motion.article>
            )
          })}
        </LayoutGroup>
      </div>
    </section>
  )
}

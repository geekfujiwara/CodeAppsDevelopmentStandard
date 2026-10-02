import type { ReactNode } from "react"
import { AlertTriangle, BookOpenText, CircleHelp, MessageSquareQuote, UserRound } from "lucide-react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { findNumber, type Card, type Engine } from "@/lib/agm/engine"
import { extractClaims } from "@/lib/agm/text"
import type { AnswerDraft, Citation } from "@/lib/agm/types"
import { qColor } from "./colors"
import { GeneratedView } from "./generated-view"
import type { Generation } from "@/hooks/use-generations"
import { CiteChip } from "@/components/agm/source-context"

type Mark = { start: number; end: number; ref?: number; unverified?: boolean }

/** 回答案の中の数値に根拠番号（[1] など）か「要確認」を付ける位置を求める */
function numberMarks(draft: AnswerDraft, numbered: Citation[]): Mark[] {
  const marks: Mark[] = []
  const text = draft.text.normalize("NFKC")
  for (const number of extractClaims(draft.text)) {
    let from = 0
    for (;;) {
      const hit = findNumber(text.slice(from), number)
      if (!hit) break
      const start = from + hit.index
      const ref = numbered.findIndex((c) => c.claim === number)
      marks.push({ start, end: start + hit.length, ref: ref >= 0 ? ref + 1 : undefined, unverified: draft.unverified.includes(number) })
      from = start + hit.length
    }
  }
  return marks.sort((a, b) => a.start - b.start)
}

function MarkedText({ text, marks, idPrefix }: { text: string; marks: Mark[]; idPrefix: string }) {
  const out: ReactNode[] = []
  let pos = 0
  for (const m of marks) {
    if (m.start < pos) continue
    out.push(text.slice(pos, m.start))
    const value = text.slice(m.start, m.end)
    out.push(
      m.unverified ? (
        <mark key={m.start} className="rounded bg-agm-danger/20 px-0.5 text-agm-danger" title="根拠となる資料が見つからない数値です">
          {value}
          <span className="ml-0.5 text-[10px] font-bold">要確認</span>
        </mark>
      ) : (
        <a key={m.start} href={`#${idPrefix}-cite-${m.ref}`} className="rounded bg-agm-ok/15 px-0.5 font-semibold text-agm-ink underline decoration-agm-ok decoration-2 underline-offset-4">
          {value}
          {m.ref && <sup className="ml-0.5 text-[10px] text-agm-ok">[{m.ref}]</sup>}
        </a>
      ),
    )
    pos = m.end
  }
  out.push(text.slice(pos))
  return <>{out}</>
}

function Snippet({ citation }: { citation: Citation }) {
  if (!citation.highlight) return <>{citation.snippet}</>
  const { start, end } = citation.highlight
  return (
    <>
      {citation.snippet.slice(0, start)}
      <mark className="rounded bg-agm-ok/25 px-0.5 font-semibold text-agm-ink">{citation.snippet.slice(start, end)}</mark>
      {citation.snippet.slice(end)}
    </>
  )
}

function AnswerBlock({
  card,
  index,
  engine,
  selected,
  onSelect,
  blockRef,
  gen,
  onRegenerate,
}: {
  card: Card
  index: number
  engine: Engine
  selected: boolean
  onSelect: () => void
  blockRef: (el: HTMLElement | null) => void
  gen?: Generation
  onRegenerate?: () => void
}) {
  const color = qColor(index)
  const qaId = card.adoptedQaId ?? card.segment.candidates[0]?.doc.id
  const qa = card.segment.candidates.find((c) => c.doc.id === qaId)?.doc
  const draft = !card.segment.novel && qa ? engine.compose(qa) : undefined
  const numbered = draft ? draft.citations.filter((c) => c.kind === "number") : []
  const related = !draft ? engine.searchIr(card.segment.text, 2) : []
  const idPrefix = `a-${card.id}`
  return (
    <article
      ref={blockRef}
      onClick={onSelect}
      className={`min-w-0 cursor-pointer rounded-lg border bg-agm-raised p-3 transition-shadow ${card.segment.novel ? "border-dashed" : ""}`}
      style={{ borderColor: selected ? color : "var(--agm-line)", boxShadow: selected ? `0 0 0 1px ${color}` : `inset 3px 0 0 ${color}` }}
      data-testid="answer-block"
    >
      <header className="flex min-w-0 items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-xs font-bold text-agm-bg" style={{ background: color }}>
          Q{index + 1}
        </span>
        {draft ? (
          <>
            <span className="flex min-w-0 items-center gap-1 text-xs text-agm-muted">
              <UserRound className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate font-semibold text-agm-ink">{draft.responder}</span>
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-agm-muted"><CiteChip id={draft.qaId} />{card.adoptedQaId ? "・採用" : ""}</span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-xs text-agm-warn">
            <CircleHelp className="size-3.5" aria-hidden />
            想定問答なし — 担当役員へ確認
          </span>
        )}
      </header>

      <div className="mt-2">
        <GeneratedView gen={gen} onRegenerate={onRegenerate} />
      </div>

      {draft && (
        <details className="group mt-2" open={!gen || gen.status === "error"} onClick={(e) => e.stopPropagation()}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-agm-muted hover:text-agm-ink">
            <BookOpenText className="size-3.5" aria-hidden />
            承認済みの回答（{draft.qaId}）と数値の根拠
            <span className="ml-auto text-[10px] group-open:hidden">開く</span>
          </summary>
          <p className="mt-2 text-[15px] leading-7" data-testid="answer-text">
            <MarkedText text={draft.text.normalize("NFKC")} marks={numberMarks(draft, numbered)} idPrefix={idPrefix} />
          </p>
          {draft.unverified.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-agm-danger/40 bg-agm-danger/10 p-1.5 text-xs text-agm-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              資料で確認できない数値: {draft.unverified.join("、")}
            </p>
          )}
          {draft.cautions.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-agm-warn/10 px-2 py-1 text-xs text-agm-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {draft.cautions.join(" / ")}
            </p>
          )}
          {numbered.length > 0 && (
            <ol className="mt-2 space-y-1" data-testid="citations">
              {numbered.map((c, i) => (
                <li key={`${c.claim}-${c.sourceId}`} id={`${idPrefix}-cite-${i + 1}`} className="text-xs leading-5">
                  <details>
                    <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 text-agm-muted hover:text-agm-ink">
                      <BookOpenText className="size-3 shrink-0" aria-hidden />
                      <span className="font-bold text-agm-ok">[{i + 1}]</span>
                      <span className="font-semibold text-agm-ink">{c.claim}</span>
                      <span className="min-w-0 truncate">
                        {c.sourceTitle}
                        {c.page ? ` p.${c.page}` : ""}
                      </span>
                    </summary>
                    <p className="mt-1 rounded bg-agm-bg p-2 text-agm-muted">
                      <Snippet citation={c} />
                    </p>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </details>
      )}

      {!draft && (
        <ul className="mt-2 space-y-1.5">
          {related.map((r) => (
            <li key={r.doc.id} className="rounded bg-agm-bg p-2 text-xs leading-5">
              <span className="font-semibold">
                {r.doc.docTitle}｜{r.doc.section}
              </span>
              <span className="ml-1 font-mono text-agm-muted">p.{r.doc.page}</span>
              <p className="line-clamp-2 text-agm-muted">{r.doc.text}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export function AnswersColumn({
  cards,
  engine,
  selectedId,
  onSelect,
  registerRef,
  scrollRef,
  resetKey,
  gens,
  onRegenerate,
}: {
  cards: Card[]
  engine: Engine | null
  gens?: Record<string, Generation>
  onRegenerate?: (card: Card) => void
  selectedId?: string
  onSelect: (id: string) => void
  registerRef: (id: string, el: HTMLElement | null) => void
  scrollRef: (el: HTMLDivElement | null) => void
  resetKey: string
}) {
  const reduce = useReducedMotion()
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-xl border border-agm-line bg-agm-panel" aria-label="回答案">
      <header className="flex items-center justify-between gap-2 border-b border-agm-line px-4 py-2.5">
        <h2 className="text-sm font-semibold tracking-wide text-agm-muted">③ 回答案と根拠</h2>
        <span className="text-xs text-agm-muted">{cards.length ? `${cards.length} 件` : ""}</span>
      </header>
      <div ref={scrollRef} className="agm-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-testid="answer-panel">
        {(!cards.length || !engine) && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-agm-muted">
            <MessageSquareQuote className="size-7 opacity-60" aria-hidden />
            <p className="text-sm">質問ごとの回答案と根拠を、ここに並べて出します</p>
          </div>
        )}
        <LayoutGroup key={resetKey}>
          {engine &&
            cards.map((card, index) => (
              <motion.div
                key={card.id}
                layout={!reduce}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className={reduce ? undefined : "animate-in fade-in-0 slide-in-from-right-3 duration-300"}
              >
                <AnswerBlock
                  card={card}
                  index={index}
                  engine={engine}
                  selected={card.id === selectedId}
                  onSelect={() => onSelect(card.id)}
                  blockRef={(el) => registerRef(card.id, el)}
                  gen={gens?.[card.id]}
                  onRegenerate={onRegenerate ? () => onRegenerate(card) : undefined}
                />
              </motion.div>
            ))}
        </LayoutGroup>
      </div>
    </section>
  )
}

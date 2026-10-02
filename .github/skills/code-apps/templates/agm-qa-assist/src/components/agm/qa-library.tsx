import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpenText, ChevronDown, Library, Maximize2, Search, Sparkles, UserRound } from "lucide-react"
import type { Engine } from "@/lib/agm/engine"
import { errorText } from "@/lib/agm/corpus"
import { streamAnswer, type GenerateInput } from "@/lib/agm/generate"
import type { Corpus, IrDoc, QaDoc } from "@/lib/agm/types"
import { createLogger } from "@/lib/debug-log"
import type { Generation } from "@/hooks/use-generations"
import { SourceBadge, SourceFlow, type FlowRun } from "./source-flow"
import { answerLines, sourceLinks } from "@/lib/agm/source-graph"

const log = createLogger("qa-library")

/** 1 件ずつ生成する（新しい依頼が来たら前の生成を止める） */
function useSingleGeneration() {
  const [gen, setGen] = useState<Generation>()
  const controller = useRef<AbortController | null>(null)
  const [run, setRun] = useState<FlowRun | null>(null)
  const start = useCallback((input: GenerateInput, label: string, flow: Omit<FlowRun, "key" | "qa" | "ir"> & { scores?: Map<string, number> }) => {
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    const sources = [...input.qa.map((q) => q.answer), ...input.ir.map((d) => d.text)]
    const key = `${label}|${Date.now()}`
    setGen({ status: "streaming", text: "", key, sources })
    setRun({ key, mode: flow.mode, question: flow.question, searchMs: flow.searchMs, qa: input.qa.map((doc) => ({ doc, score: flow.scores?.get(doc.id) ?? 0 })), ir: input.ir })
    log.info("説明の生成を開始", { label, qa: input.qa.map((q) => q.id), ir: input.ir.map((d) => d.id) })
    streamAnswer(input, (delta) => setGen((g) => (g?.key === key ? { ...g, text: g.text + delta } : g)), c.signal)
      .then((r) => {
        log.info("説明の生成が完了", { label, model: r.model, firstMs: r.firstMs, totalMs: r.totalMs, chars: r.text.length })
        setGen((g) => (g?.key === key ? { ...g, status: "done", model: r.model, firstMs: r.firstMs, totalMs: r.totalMs } : g))
      })
      .catch((error) => {
        if (c.signal.aborted) return
        setGen((g) => (g?.key === key ? { ...g, status: "error", error: errorText(error) } : g))
      })
  }, [])
  useEffect(() => () => controller.current?.abort(), [])
  return { gen, run, start }
}

export function QaLibrary({ corpus, engine, source, initialQuery }: { corpus: Corpus | null; engine: Engine | null; source: string; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "")
  const [category, setCategory] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(true)
  const { gen, run, start } = useSingleGeneration()
  const irById = useMemo(() => new Map((corpus?.ir ?? []).map((d) => [d.id, d])), [corpus])
  const categories = useMemo(() => [...new Set((corpus?.qa ?? []).map((q) => q.category))], [corpus])

  const { results, searchMs } = useMemo(() => {
    if (!corpus || !engine) return { results: [], searchMs: 0 }
    const t0 = performance.now()
    const list = query.trim()
      ? engine.searchQa(query, corpus.qa.length).map((h) => ({ doc: h.doc, score: h.score }))
      : corpus.qa.map((doc) => ({ doc, score: 0 }))
    return { results: list.filter((r) => !category || r.doc.category === category), searchMs: performance.now() - t0 }
  }, [corpus, engine, query, category])

  const selected = corpus?.qa.find((q) => q.id === selectedId) ?? results[0]?.doc ?? null

  const contextFor = useCallback(
    (qa: QaDoc[], text: string): IrDoc[] => {
      const ir: IrDoc[] = []
      const add = (d?: IrDoc) => d && !ir.some((x) => x.id === d.id) && ir.push(d)
      qa.flatMap((q) => q.sourceIds).forEach((id) => add(irById.get(id)))
      engine?.searchIr(text, 4).forEach((h) => add(h.doc))
      return ir.slice(0, 5)
    },
    [engine, irById],
  )

  // 検索語を入れたら、少し待ってから上位の想定問答と IR 抜粋を根拠に要約・回答案を作る
  const latest = useRef({ results, searchMs })
  latest.current = { results, searchMs }
  useEffect(() => {
    const q = query.trim()
    if (q.length < 4 || !engine) return
    const t = window.setTimeout(() => {
      const top = latest.current.results.slice(0, 3)
      const docs = top.map((r) => r.doc)
      start({ mode: "search", question: q, qa: docs, ir: contextFor(docs, q) }, `search:${q}`, { mode: "search", question: q, searchMs: latest.current.searchMs, scores: new Map(top.map((r) => [r.doc.id, r.score])) })
    }, 800)
    return () => window.clearTimeout(t)
    // 検索語が変わったときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, engine])

  const explainSelected = () => {
    if (!selected) return
    start({ mode: "search", question: selected.question, qa: [selected], ir: contextFor([selected], selected.question) }, `qa:${selected.id}`, { mode: "qa", question: selected.question })
  }

  // 一覧の印（今の生成に渡した順位と引用数）
  const usage = useMemo(() => {
    const ids = run ? [...run.qa.map((q) => q.doc.id), ...run.ir.map((d) => d.id)] : []
    const links = sourceLinks(ids, answerLines(gen?.text ?? ""))
    return { rank: new Map(run?.qa.map((q, i) => [q.doc.id, i + 1]) ?? []), links }
  }, [run, gen?.text])
  const done = gen?.status === "done"

  const draft = selected && engine ? engine.compose(selected) : null

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(21rem,0.72fr)_minmax(0,2.28fr)] gap-3 p-3" data-testid="qa-library">
      <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-agm-line bg-agm-panel">
        <header className="space-y-2 border-b border-agm-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-agm-muted">
            <Library className="size-4" aria-hidden />
            想定問答（{source}・{corpus?.qa.length ?? 0} 件）
          </h2>
          <label className="flex items-center gap-2 rounded-md border border-agm-line bg-agm-bg px-2 focus-within:border-agm-accent">
            <Search className="size-4 text-agm-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="検索（例: 自社株買いは配当の代わりか）"
              className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none"
              data-testid="qa-search"
            />
          </label>
          <div className="agm-scroll flex gap-1.5 overflow-x-auto pb-0.5">
            <button type="button" onClick={() => setCategory(null)} className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${!category ? "border-agm-accent text-agm-accent" : "border-agm-line text-agm-muted"}`}>
              すべて
            </button>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(category === c ? null : c)} className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${category === c ? "border-agm-accent text-agm-accent" : "border-agm-line text-agm-muted"}`}>
                {c}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-agm-muted">
            {results.length} 件{query.trim() ? `・検索 ${searchMs.toFixed(1)} ms（端末内）・上位 3 件を AI に渡します` : ""}
          </p>
        </header>
        <ol className="agm-scroll min-h-0 flex-1 space-y-1 overflow-y-auto p-2" data-testid="qa-results">
          {results.map((r) => {
            const rank = usage.rank.get(r.doc.id)
            return (
              <li key={r.doc.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(r.doc.id)
                    setDetailOpen(true)
                  }}
                  className={`flex w-full min-w-0 flex-col rounded-md px-3 py-2 text-left ${selected?.id === r.doc.id ? "bg-agm-raised ring-1 ring-agm-accent" : "hover:bg-agm-raised/60"}`}
                  data-testid="qa-result"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[11px] text-agm-muted">
                    <span className="font-mono">{r.doc.id}</span>
                    <span className="truncate">{r.doc.category}</span>
                    {rank && <SourceBadge rank={rank} cites={usage.links.uses.get(r.doc.id)?.count ?? 0} done={done} />}
                    {r.score > 0 && <span className="ml-auto shrink-0 tabular-nums">{r.score.toFixed(1)}</span>}
                  </span>
                  <span className="truncate text-sm">{r.doc.question}</span>
                </button>
              </li>
            )
          })}
        </ol>
        {selected && draft && (
          <div className={`flex min-h-0 flex-col border-t border-agm-line ${detailOpen ? "max-h-[48%]" : ""}`}>
            <button type="button" onClick={() => setDetailOpen((o) => !o)} className="flex items-center gap-2 px-4 py-2 text-left text-xs text-agm-muted hover:text-agm-ink">
              <ChevronDown className={`size-4 transition-transform ${detailOpen ? "" : "-rotate-90"}`} aria-hidden />
              登録内容
              <span className="font-mono">{selected.id}</span>
              <span className="truncate">{selected.question}</span>
            </button>
            {detailOpen && (
              <div className="agm-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-3 text-sm" data-testid="qa-detail">
                <p className="text-[11px] text-agm-muted">
                  {selected.category}・
                  <UserRound className="mb-0.5 inline size-3" aria-hidden /> {selected.responder}
                </p>
                <h3 className="text-base font-bold leading-6">{selected.question}</h3>
                <p className="rounded-md bg-agm-raised p-2.5 leading-7">{selected.answer}</p>
                {selected.answerPoints.length > 0 && (
                  <ol className="list-decimal space-y-0.5 pl-5 text-[13px]">
                    {selected.answerPoints.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                )}
                {selected.cautions.length > 0 && <p className="rounded bg-agm-warn/10 px-2 py-1 text-xs text-agm-warn">注意: {selected.cautions.join(" / ")}</p>}
                {selected.questionVariants.length > 0 && <p className="text-xs text-agm-muted">言い換え: {selected.questionVariants.join(" / ")}</p>}
                <div>
                  <h4 className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-agm-muted">
                    <BookOpenText className="size-3.5" aria-hidden />
                    数値の根拠
                  </h4>
                  <ul className="space-y-1 text-xs">
                    {draft.citations
                      .filter((c) => c.kind === "number")
                      .map((c) => (
                        <li key={`${c.claim}-${c.sourceId}`} className="flex min-w-0 gap-2">
                          <span className="shrink-0 font-semibold">{c.claim}</span>
                          <span className="truncate text-agm-muted">
                            {c.sourceTitle}
                            {c.page ? ` p.${c.page}` : ""}（{c.sourceId}）
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-agm-line bg-agm-panel">
        <header className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-agm-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-agm-muted">根拠と AI 回答案のつながり</h2>
          <span className="flex items-center gap-3 text-[11px] text-agm-muted" data-testid="flow-legend">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 rounded bg-agm-accent" aria-hidden />
              引用した行へ
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-6 border-t border-dashed border-agm-muted" aria-hidden />
              渡したが引用なし
            </span>
            <span>根拠にマウスを重ねると、引用した行が光ります</span>
          </span>
          {run && (
            <span className="text-[11px] text-agm-muted" data-testid="flow-stats">
              想定問答 {run.qa.length}・IR {run.ir.length} を渡し、{usage.links.uses.size - usage.links.uncited.length} 件を引用
              {usage.links.unknown.length > 0 && <span className="ml-2 text-agm-danger">渡していない根拠を引用: {usage.links.unknown.join("、")}（要確認）</span>}
            </span>
          )}
          <button
            type="button"
            onClick={explainSelected}
            disabled={!selected}
            className="ml-auto flex items-center gap-1 rounded-md border border-agm-line px-2.5 py-1 text-xs text-agm-muted hover:text-agm-ink disabled:opacity-50"
            data-testid="explain-selected"
          >
            <Sparkles className="size-3.5" aria-hidden />
            選んだ問答で説明を作成
          </button>
        </header>
        <div className="relative min-h-0 flex-1" data-testid="source-flow">
          {run ? (
            <SourceFlow run={run} gen={gen} selectedQaId={selected?.id} onSelectQa={(id) => { setSelectedId(id); setDetailOpen(true) }} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-agm-muted">
              <Maximize2 className="size-6" aria-hidden />
              <p>検索語を入れる（4 文字以上）か、想定問答を選んで「選んだ問答で説明を作成」を押すと、</p>
              <p>AI に渡した想定問答・IR 抜粋と、回答案のどの行がそれを引用したかを線で結んで表示します</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
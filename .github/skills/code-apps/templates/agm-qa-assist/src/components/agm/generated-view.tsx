import type { CSSProperties, ReactNode } from "react"
import { AlertTriangle, Loader2, RotateCw, Sparkles } from "lucide-react"
import type { Generation } from "@/hooks/use-generations"
import { findNumber } from "@/lib/agm/engine"
import { CITE, splitSections, unverifiedClaims } from "@/lib/agm/generated"
import { extractClaims } from "@/lib/agm/text"
import { CiteChip } from "./source-context"

type Mark = { start: number; end: number; kind: "cite" | "ok" | "ng"; label: string }

/** 生成文の 1 行を、根拠 ID のチップと数値（根拠あり / 要確認）に分けて描く */
function Inline({ text, sources }: { text: string; sources: string[] }) {
  const t = text.normalize("NFKC")
  const marks: Mark[] = []
  for (const m of t.matchAll(CITE)) marks.push({ start: m.index!, end: m.index! + m[0].length, kind: "cite", label: m[1] })
  const unknown = new Set(unverifiedClaims(t, sources))
  for (const claim of extractClaims(t)) {
    let from = 0
    for (;;) {
      const hit = findNumber(t.slice(from), claim)
      if (!hit) break
      const start = from + hit.index
      if (!marks.some((m) => start < m.end && m.start < start + hit.length)) marks.push({ start, end: start + hit.length, kind: unknown.has(claim) ? "ng" : "ok", label: t.slice(start, start + hit.length) })
      from = start + hit.length
    }
  }
  marks.sort((a, b) => a.start - b.start)
  const out: ReactNode[] = []
  let pos = 0
  for (const m of marks) {
    out.push(t.slice(pos, m.start))
    if (m.kind === "cite") {
      out.push(<CiteChip key={m.start} id={m.label} />)
    } else if (m.kind === "ok") {
      out.push(
        <span key={m.start} className="rounded bg-agm-ok/15 px-0.5 font-semibold underline decoration-agm-ok decoration-2 underline-offset-4" title="根拠の資料にある数値">
          {m.label}
        </span>,
      )
    } else {
      out.push(
        <mark key={m.start} className="rounded bg-agm-danger/20 px-0.5 text-agm-danger" title="根拠の資料に無い数値です">
          {m.label}
          <span className="ml-0.5 text-[10px] font-bold">要確認</span>
        </mark>,
      )
    }
    pos = m.end
  }
  out.push(t.slice(pos))
  return <>{out}</>
}

/** 行ごとの付け足し（線をつなぐ位置の目印・強調）。キーは要約 s0.. / 回答案 a / 補足 n0..（source-graph の answerLines と同じ） */
export type LineDecor = (key: string) => { anchor?: ReactNode; className?: string; style?: CSSProperties }

export function GeneratedView({ gen, onRegenerate, emptyText, decor }: { gen?: Generation; onRegenerate?: () => void; emptyText?: string; decor?: LineDecor }) {
  const d = (key: string) => decor?.(key) ?? {}
  const streaming = gen?.status === "streaming" || gen?.status === "waiting"
  const s = splitSections(gen?.text ?? "")
  const unknown = gen?.status === "done" ? unverifiedClaims(gen.text, gen.sources) : []
  const caret = streaming ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-agm-accent align-middle" aria-hidden /> : null
  const lastPart = s.notes.length ? "notes" : s.answer ? "answer" : "summary"
  return (
    <div className="rounded-md border border-agm-accent/40 bg-agm-bg/60 p-2.5" data-testid="generated">
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        <Sparkles className="size-3.5 shrink-0 text-agm-accent" aria-hidden />
        <span className="font-semibold text-agm-accent">AI 要約・回答案</span>
        <span className="rounded bg-agm-warn/15 px-1 text-agm-warn">生成・要確認</span>
        <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate text-agm-muted">
          {gen?.status === "waiting" && "順番待ち"}
          {gen?.status === "streaming" && (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden />
              生成中
            </>
          )}
          {gen?.status === "done" && `${gen.model ?? ""} ・ 開始 ${((gen.firstMs ?? 0) / 1000).toFixed(1)} 秒 ・ 完了 ${((gen.totalMs ?? 0) / 1000).toFixed(1)} 秒`}
          {gen?.status === "error" && <span className="text-agm-danger">失敗: {gen.error}</span>}
        </span>
        {onRegenerate && !streaming && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRegenerate()
            }}
            className="shrink-0 rounded p-0.5 text-agm-muted hover:text-agm-ink"
            title="作り直す"
            aria-label="回答案を作り直す"
          >
            <RotateCw className="size-3.5" />
          </button>
        )}
      </div>
      {!gen && <p className="mt-1.5 text-xs text-agm-muted">{emptyText ?? "質問の文が確定すると、根拠の資料から要約と回答案を作ります"}</p>}
      {gen && (
        <div className="mt-1.5 space-y-1.5 text-[14px] leading-6">
          {s.summary.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
              {s.summary.map((line, i) => (
                <li key={i} className={d(`s${i}`).className} style={d(`s${i}`).style} data-line={`s${i}`}>
                  {d(`s${i}`).anchor}
                  <Inline text={line} sources={gen.sources} />
                  {lastPart === "summary" && i === s.summary.length - 1 && caret}
                </li>
              ))}
            </ul>
          )}
          {s.answer && (
            <p className={`rounded bg-agm-raised/80 px-2 py-1.5 ${d("a").className ?? ""}`} data-testid="generated-answer" data-line="a" style={d("a").style}>
              {d("a").anchor}
              <Inline text={s.answer} sources={gen.sources} />
              {lastPart === "answer" && caret}
            </p>
          )}
          {s.notes.length > 0 && (
            <ul className="space-y-0.5 text-xs text-agm-warn">
              {s.notes.map((line, i) => (
                <li key={i} className={`flex gap-1 ${d(`n${i}`).className ?? ""}`} style={d(`n${i}`).style} data-line={`n${i}`}>
                  {d(`n${i}`).anchor}
                  <AlertTriangle className="mt-1 size-3 shrink-0" aria-hidden />
                  <span>
                    <Inline text={line} sources={gen.sources} />
                    {lastPart === "notes" && i === s.notes.length - 1 && caret}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!s.summary.length && !s.answer && streaming && caret}
          {unknown.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-agm-danger">
              <AlertTriangle className="size-3.5" aria-hidden />
              根拠の資料に無い数値: {unknown.join("、")}（読み上げ前に確認）
            </p>
          )}
        </div>
      )}
    </div>
  )
}

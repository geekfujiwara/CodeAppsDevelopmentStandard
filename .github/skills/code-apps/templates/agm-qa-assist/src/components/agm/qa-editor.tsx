import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Save, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { errorText } from "@/lib/agm/corpus"
import { APPROVED, DRAFT, checkQa, nextQaCode, saveQa } from "@/lib/agm/qa-edit"
import type { IrDoc, QaDoc } from "@/lib/agm/types"

const EMPTY: QaDoc = { id: "", category: "", question: "", questionVariants: [], keywords: [], answer: "", answerPoints: [], responder: "", sourceIds: [], cautions: [], status: DRAFT, createdVia: "アプリ" }
const lines = (v: string) => v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
const words = (v: string) => v.split(/[,、\s]+/).map((s) => s.trim()).filter(Boolean)

const input = "w-full rounded-md border border-agm-line bg-agm-bg px-2 py-1.5 text-sm outline-none focus:border-agm-accent"

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3">
      <span className="pt-1.5 text-sm text-agm-muted">
        {label}
        {hint && <span className="block text-[10px] leading-4">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

/** 想定問答の追加・編集（保存すると下書き。承認すると質疑応答の検索に使われる） */
export function QaEditor({
  open,
  onOpenChange,
  doc,
  rowId,
  all,
  ir,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 編集する問答（追加は undefined） */
  doc?: QaDoc
  rowId?: string
  all: QaDoc[]
  ir: IrDoc[]
  onSaved: (doc: QaDoc, rowId: string) => void
}) {
  const [draft, setDraft] = useState<QaDoc>(EMPTY)
  const [text, setText] = useState({ variants: "", keywords: "", points: "", sources: "", cautions: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!open) return
    const d = doc ?? { ...EMPTY, id: nextQaCode(all) }
    setDraft(d)
    setText({ variants: d.questionVariants.join("\n"), keywords: d.keywords.join(" "), points: d.answerPoints.join("\n"), sources: d.sourceIds.join(" "), cautions: d.cautions.join("\n") })
    setError(undefined)
  }, [open, doc, all])

  const value: QaDoc = useMemo(
    () => ({ ...draft, questionVariants: lines(text.variants), keywords: words(text.keywords), answerPoints: lines(text.points), sourceIds: words(text.sources), cautions: lines(text.cautions) }),
    [draft, text],
  )
  const issues = useMemo(() => checkQa(value, all, ir, doc?.id), [value, all, ir, doc?.id])
  const blocking = issues.some((i) => i.severity === "error")
  const categories = useMemo(() => [...new Set(all.map((q) => q.category))], [all])
  const suggestions = useMemo(() => {
    const q = `${value.question} ${value.answer}`
    if (q.trim().length < 4) return []
    return ir
      .map((d) => ({ d, hit: words(value.keywords.join(" ") + " " + value.category).filter((w) => d.text.includes(w) || d.section.includes(w)).length }))
      .filter((x) => x.hit > 0 && !value.sourceIds.includes(x.d.id))
      .sort((a, b) => b.hit - a.hit)
      .slice(0, 6)
      .map((x) => x.d)
  }, [ir, value])

  const save = async (status: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const next = { ...value, status }
      const id = await saveQa(next, rowId)
      onSaved(next, id)
      onOpenChange(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="agm flex max-h-[92vh] w-[min(1100px,96vw)] max-w-[96vw] flex-col gap-3 border-agm-line text-agm-ink sm:max-w-[96vw]" data-testid="qa-editor">
        <DialogTitle>{doc ? `想定問答を編集（${doc.id}）` : "想定問答を追加"}</DialogTitle>
        <DialogDescription className="text-agm-muted">保存すると「下書き」になり、承認すると質疑応答の検索に使われます。回答の数値は根拠の IR 抜粋にあるものだけを使ってください。</DialogDescription>
        <div className="agm-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
          <Row label="問答コード">
            <input className={`${input} w-40 font-mono`} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.trim() })} data-testid="qa-edit-id" />
          </Row>
          <Row label="分類">
            <input className={input} list="qa-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} data-testid="qa-edit-category" />
            <datalist id="qa-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Row>
          <Row label="質問">
            <textarea className={`${input} min-h-16`} value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} data-testid="qa-edit-question" />
          </Row>
          <Row label="言い換え" hint="1 行に 1 つ">
            <textarea className={`${input} min-h-16`} value={text.variants} onChange={(e) => setText({ ...text, variants: e.target.value })} />
          </Row>
          <Row label="キーワード" hint="空白区切り">
            <input className={input} value={text.keywords} onChange={(e) => setText({ ...text, keywords: e.target.value })} data-testid="qa-edit-keywords" />
          </Row>
          <Row label="承認済みの回答">
            <textarea className={`${input} min-h-28 leading-6`} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} data-testid="qa-edit-answer" />
          </Row>
          <Row label="回答の要点" hint="1 行に 1 つ">
            <textarea className={`${input} min-h-16`} value={text.points} onChange={(e) => setText({ ...text, points: e.target.value })} />
          </Row>
          <Row label="回答者">
            <input className={input} value={draft.responder} onChange={(e) => setDraft({ ...draft, responder: e.target.value })} placeholder="例: 取締役CFO" data-testid="qa-edit-responder" />
          </Row>
          <Row label="根拠 ID" hint="IR 抜粋の ID（空白区切り）">
            <div className="space-y-1">
              <input className={`${input} font-mono`} value={text.sources} onChange={(e) => setText({ ...text, sources: e.target.value })} data-testid="qa-edit-sources" />
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs">
                  <span className="text-agm-muted">候補:</span>
                  {suggestions.map((d) => (
                    <button key={d.id} type="button" onClick={() => setText((t) => ({ ...t, sources: `${t.sources} ${d.id}`.trim() }))} className="rounded border border-agm-line px-1.5 hover:border-agm-accent" title={d.text}>
                      <span className="font-mono">{d.id}</span> {d.section}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Row>
          <Row label="注意事項" hint="1 行に 1 つ">
            <textarea className={`${input} min-h-14`} value={text.cautions} onChange={(e) => setText({ ...text, cautions: e.target.value })} />
          </Row>
        </div>
        {issues.length > 0 && (
          <ul className="space-y-0.5 rounded-md border border-agm-line p-2 text-xs" data-testid="qa-edit-issues">
            {issues.map((i) => (
              <li key={i.message} className={`flex items-start gap-1 ${i.severity === "error" ? "text-agm-danger" : "text-agm-warn"}`}>
                {i.severity === "error" ? <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                {i.message}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-agm-danger">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-agm-muted">作成元: {draft.createdVia || "アプリ"}・状態: {draft.status || APPROVED}</span>
          <button type="button" disabled={busy || blocking} onClick={() => void save(DRAFT)} className="flex h-9 items-center gap-1 rounded-md border border-agm-line px-3 text-sm disabled:opacity-40" data-testid="qa-edit-save-draft">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            下書きとして保存
          </button>
          <button type="button" disabled={busy || blocking} onClick={() => void save(APPROVED)} className="flex h-9 items-center gap-1 rounded-md bg-agm-accent px-3 text-sm font-semibold text-agm-bg disabled:opacity-40" data-testid="qa-edit-approve">
            <CheckCircle2 className="size-4" aria-hidden />
            承認して保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

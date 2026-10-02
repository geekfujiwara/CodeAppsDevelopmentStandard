import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { Eye, Loader2, Radio, UserRound } from "lucide-react"
import { TranscriptPanel } from "@/components/agm/transcript-panel"
import { QuestionCards } from "@/components/agm/question-cards"
import { AnswersColumn } from "@/components/agm/answers-column"
import { CardAnswerLinks } from "@/components/agm/card-answer-links"
import { createLogger } from "@/lib/debug-log"
import { errorText } from "@/lib/agm/corpus"
import type { Engine } from "@/lib/agm/engine"
import { listLiveSessions, readState, unpackCards, type LiveSession, type LiveState } from "@/lib/agm/live"
import type { Corpus } from "@/lib/agm/types"

const log = createLogger("live-watch")
const POLL_MS = 1500

/** LIVE の閲覧（幹部向け・読み取り専用）。スクロールと根拠の確認はできるが、編集はできない */
export function LiveWatch({ corpus, engine }: { corpus: Corpus | null; engine: Engine | null }) {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null)
  const [liveId, setLiveId] = useState<string | null>(null)
  const [state, setState] = useState<LiveState | null>(null)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(Date.now())
  const [follow, setFollow] = useState(true)
  const [localSelected, setLocalSelected] = useState<string>()
  const lastRevision = useRef(-1)

  useEffect(() => {
    const load = () =>
      listLiveSessions()
        .then((list) => {
          setSessions(list)
          setLiveId((id) => (id && list.some((s) => s.id === id) ? id : list[0]?.id ?? null))
        })
        .catch((e) => setError(errorText(e)))
    void load()
    const t = window.setInterval(load, 15000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!liveId) return
    lastRevision.current = -1
    let stopped = false
    const tick = async () => {
      try {
        const r = await readState(liveId)
        if (stopped) return
        setStatus(r.status)
        if (r.revision !== lastRevision.current && r.state) {
          lastRevision.current = r.revision
          setState(r.state)
          log.debug("LIVE を更新", { revision: r.revision, lagMs: Date.now() - r.state.at })
        }
        setError(undefined)
      } catch (e) {
        if (!stopped) setError(errorText(e))
      }
    }
    void tick()
    const t = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(t)
    }
  }, [liveId])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const qaMap = useMemo(() => new Map((corpus?.qa ?? []).map((q) => [q.id, q])), [corpus])
  const cards = useMemo(() => (state ? unpackCards(state.cards, qaMap) : []), [state, qaMap])
  const selectedId = follow ? state?.selectedId : localSelected ?? state?.selectedId

  const linksBox = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const answerRefs = useRef(new Map<string, HTMLElement>())
  const cardScroll = useRef<HTMLDivElement | null>(null)
  const answerScroll = useRef<HTMLDivElement | null>(null)
  const register = (map: RefObject<Map<string, HTMLElement>>) => (id: string, el: HTMLElement | null) => {
    if (el) map.current.set(id, el)
    else map.current.delete(id)
  }
  const select = (id: string) => {
    setLocalSelected(id)
    setFollow(false)
    answerRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }

  if (sessions === null)
    return (
      <p className="flex items-center gap-2 p-6 text-agm-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        共有されている LIVE を探しています…
      </p>
    )
  if (!sessions.length) return <p className="p-6 text-agm-muted">いま共有されている LIVE はありません。担当者が LIVE を開始し、あなたに共有すると表示されます。{error && <span className="text-agm-danger">（{error}）</span>}</p>

  const lagSec = state ? Math.max(0, Math.round((now - state.at) / 1000)) : null
  const sh = state?.shareholder
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3" data-testid="live-watch">
      <section className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-agm-line bg-agm-panel px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-agm-rec">
          <Radio className={`size-4 ${status === "live" ? "agm-rec-dot" : ""}`} aria-hidden />
          {status === "live" ? "LIVE" : "終了"}
        </span>
        {sessions.length > 1 ? (
          <select value={liveId ?? ""} onChange={(e) => setLiveId(e.target.value)} className="h-8 rounded-md border border-agm-line bg-agm-bg px-2 text-sm">
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}（{s.ownerName}）
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm">
            {sessions[0].title}
            <span className="ml-2 text-xs text-agm-muted">配信: {sessions[0].ownerName}</span>
          </span>
        )}
        <span className="flex items-center gap-1 text-xs text-agm-muted">
          <Eye className="size-3.5" aria-hidden />
          閲覧専用
        </span>
        <span className={`text-xs ${lagSec !== null && lagSec > 10 && state?.running ? "text-agm-warn" : "text-agm-muted"}`} data-testid="live-lag">
          {lagSec === null ? "最初の更新を待っています" : `最終更新 ${lagSec} 秒前${state?.running ? "・録音中" : "・停止中"}`}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-agm-muted">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          担当者の選択に追従
        </label>
        {error && <span className="text-xs text-agm-danger">{error}</span>}
      </section>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,2.3fr)] gap-3">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <section className="flex items-center gap-3 rounded-xl border border-agm-line bg-agm-panel px-4 py-3" data-testid="live-shareholder">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-agm-raised text-agm-accent">
              <UserRound className="size-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[11px] text-agm-muted">株主番号</span>
                <span className="font-mono text-2xl font-bold">{sh?.number ?? "—"}</span>
                <span className="text-xl font-bold">{sh?.name}</span>
              </p>
              {sh?.shares !== undefined && (
                <p className="text-xs text-agm-muted">
                  {sh.type}・保有 {sh.shares.toLocaleString("ja-JP")} 株{sh.note ? `・${sh.note}` : ""}
                </p>
              )}
            </div>
          </section>
          <div className="min-h-0 flex-1">
            <TranscriptPanel
              view={state?.view ?? { text: "", interimStart: 0 }}
              cards={cards}
              selectedId={selectedId}
              onSelect={select}
              listening={!!state?.running}
              answerFrom={state?.answerFrom ?? 0}
              title={sh?.number ? `株主番号 ${sh.number}` : undefined}
            />
          </div>
        </div>
        <div ref={linksBox} className="relative grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-12">
          <div className="min-h-0 min-w-0">
            <QuestionCards
              cards={cards}
              selectedId={selectedId}
              onSelect={select}
              onAdopt={() => undefined}
              resetKey={state?.turnKey ?? "none"}
              registerRef={register(cardRefs)}
              scrollRef={(el) => {
                cardScroll.current = el
              }}
            />
          </div>
          <div className="min-h-0 min-w-0">
            <AnswersColumn
              cards={cards}
              engine={engine}
              gens={state?.gens}
              resetKey={state?.turnKey ?? "none"}
              selectedId={selectedId}
              onSelect={select}
              registerRef={register(answerRefs)}
              scrollRef={(el) => {
                answerScroll.current = el
              }}
            />
          </div>
          <CardAnswerLinks containerRef={linksBox} cardRefs={cardRefs} answerRefs={answerRefs} cardScroll={cardScroll} answerScroll={answerScroll} cards={cards} selectedId={selectedId} />
        </div>
      </main>
    </div>
  )
}

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, History, Loader2, Pencil, Sparkles, UserRound, Users } from "lucide-react"
import { nameMatches, type Shareholder, type ShareholderProfile } from "@/lib/agm/shareholders"

export interface TodayTurn {
  key: string
  startedAt: Date
  questionCount: number
  categories: string[]
}

const date = (value: string) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("ja-JP")
}

export type NumberSource = "detected" | "ai" | "manual" | null

export interface IdentState {
  status: "running" | "done"
  number?: string | null
  confidence?: number
  reason?: string
  ms?: number
  candidates?: Shareholder[]
}

function NumberEditor({ value, onCommit, readOnly }: { value: string | null; onCommit: (v: string) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? "")
  useEffect(() => setDraft(value ?? ""), [value])
  if (readOnly || !editing)
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1 rounded-md px-1 font-mono text-2xl font-bold tabular-nums enabled:hover:bg-agm-raised"
        title={readOnly ? undefined : "押すと株主番号を直せます"}
        data-testid="current-number"
      >
        {value ?? "—"}
        {!readOnly && <Pencil className="size-3.5 text-agm-muted opacity-60 group-hover:opacity-100" aria-label="株主番号を編集" />}
      </button>
    )
  const commit = () => {
    setEditing(false)
    onCommit(draft.trim())
  }
  return (
    <input
      autoFocus
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[^\d]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") {
          setDraft(value ?? "")
          setEditing(false)
        }
      }}
      className="h-9 w-28 rounded-md border border-agm-accent bg-agm-bg px-2 font-mono text-2xl font-bold tabular-nums outline-none"
      aria-label="株主番号"
      data-testid="number-input"
    />
  )
}

const SOURCE_LABEL: Record<Exclude<NumberSource, null>, string> = { detected: "発言から検出", ai: "AI 照合", manual: "手入力" }

export function ShareholderPanel({
  number,
  numberSource,
  spokenName,
  cause,
  profile,
  loading,
  today,
  heard,
  ident,
  nameCandidates,
  onEditNumber,
  onChoose,
  onOpenPicker,
  readOnly,
}: {
  number: string | null
  numberSource?: NumberSource
  spokenName: string | null
  cause: "number" | "cue" | "manual" | "start" | null
  /** 「株主番号」の後ろで聞こえたまま（数字に直せなかったとき） */
  heard?: string | null
  profile: ShareholderProfile | null
  loading: boolean
  today: TodayTurn[]
  ident?: IdentState
  /** 名乗った名前で名簿を引いた候補（番号を言わない株主向け） */
  nameCandidates?: Shareholder[]
  onEditNumber?: (value: string) => void
  onChoose?: (s: Shareholder) => void
  onOpenPicker?: () => void
  readOnly?: boolean
}) {
  const holder = profile?.shareholder
  const match = nameMatches(spokenName, holder?.name)
  const lowConfidence = ident?.status === "done" && (ident.confidence ?? 0) < 0.8 && numberSource !== "manual"
  const candidates = (lowConfidence ? ident?.candidates : !number ? nameCandidates : undefined)?.filter((s) => s.number !== number).slice(0, 5) ?? []
  return (
    <section className="rounded-xl border border-agm-line bg-agm-panel" aria-label="発言中の株主" data-testid="shareholder-panel">
      <div className="flex min-w-0 items-start gap-3 px-4 py-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-agm-raised text-agm-accent">
          <UserRound className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3">
            <span className="text-[11px] text-agm-muted">株主番号</span>
            <NumberEditor value={number} onCommit={(v) => onEditNumber?.(v)} readOnly={readOnly || !onEditNumber} />
            {holder && <span className="truncate text-xl font-bold">{holder.name}</span>}
            {holder?.kana && <span className="truncate text-xs text-agm-muted">{holder.kana}</span>}
            {loading && <Loader2 className="size-4 animate-spin text-agm-muted" aria-label="照会中" />}
            {number && numberSource && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${numberSource === "manual" ? "bg-agm-raised text-agm-ink" : "bg-agm-accent/15 text-agm-accent"}`} data-testid="number-source">
                {SOURCE_LABEL[numberSource]}
              </span>
            )}
            {!readOnly && onOpenPicker && (
              <button
                type="button"
                onClick={onOpenPicker}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-agm-line px-2 py-1 text-xs text-agm-muted hover:border-agm-accent hover:text-agm-ink"
                data-testid="open-picker"
              >
                <Users className="size-3.5" aria-hidden />
                名簿から選ぶ
              </button>
            )}
          </div>
          {ident && (
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-agm-muted" data-testid="ident-status">
              <Sparkles className="size-3.5 shrink-0 text-agm-accent" aria-hidden />
              {ident.status === "running" ? (
                <span>名乗りを名簿と AI で照合しています…</span>
              ) : (
                <span className="truncate" title={ident.reason}>
                  AI 照合: {ident.number ?? "該当なし"}（確からしさ {Math.round((ident.confidence ?? 0) * 100)}%・{ident.ms} ms）{ident.reason}
                </span>
              )}
            </p>
          )}
          {!number && heard && (
            <p className="flex items-start gap-1 text-sm text-agm-warn" data-testid="number-unparsed">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>株主番号を聞き取れませんでした（「{heard}」）。質問の整理は続けています。番号を押すと直接入力できます</span>
            </p>
          )}
          {!number && !heard && !ident && (
            <p className="text-sm text-agm-muted">
              {cause === "manual"
                ? "手動で区切りました。番号を押すと株主番号を入力できます"
                : cause === "cue"
                  ? "議長の指名で次の株主に切り替えました（株主番号は未確認）。質問の整理は続けています"
                  : "株主が名乗った株主番号を自動で拾います（「株主番号〇〇番の〇〇です」。読み・漢数字でも可）"}
            </p>
          )}
          {candidates.length > 0 && (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5" data-testid="shareholder-candidates">
              <span className="text-[11px] text-agm-warn">{lowConfidence ? "候補（確認してください）" : "名前から推定"}</span>
              {candidates.map((s) => (
                <button
                  key={s.number}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onChoose?.(s)}
                  className="rounded-md border border-agm-line bg-agm-bg px-2 py-0.5 text-xs enabled:hover:border-agm-accent"
                  data-testid="candidate"
                >
                  <span className="font-mono">{s.number}</span> {s.name}
                </button>
              ))}
            </div>
          )}
          {number && holder && (
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-agm-muted">
              <span>{holder.type}</span>
              <span>保有 {holder.shares.toLocaleString("ja-JP")} 株</span>
              {holder.since && <span>{holder.since} 年から</span>}
              {holder.note && <span className="text-agm-ink">{holder.note}</span>}
            </p>
          )}
          {number && !loading && profile && !holder && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-agm-warn">
              <AlertTriangle className="size-3.5" aria-hidden />
              {profile.error ? `名簿を照会できません（${profile.error}）` : "株主名簿にない番号です。聞き間違いの可能性があります"}
            </p>
          )}
          {spokenName && (
            <p className={`mt-0.5 flex items-center gap-1 text-xs ${match === false ? "text-agm-warn" : "text-agm-muted"}`}>
              {match === true ? <CheckCircle2 className="size-3.5 text-agm-ok" aria-hidden /> : match === false ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
              名乗った名前: {spokenName}
              {match === false && "（名簿の氏名と違います）"}
            </p>
          )}
        </div>
      </div>
      {number && (profile?.history.length || today.length) ? (
        <div className="border-t border-agm-line px-4 py-2">
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-agm-muted">
            <History className="size-3.5" aria-hidden />
            この株主の過去の質問
          </h3>
          <ul className="agm-scroll max-h-28 space-y-1 overflow-y-auto text-xs" data-testid="shareholder-history">
            {today.map((t) => (
              <li key={t.key} className="flex min-w-0 gap-2">
                <span className="shrink-0 text-agm-accent">本日 {t.startedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="truncate">{t.categories.join("・") || "質問なし"}</span>
              </li>
            ))}
            {profile?.history.map((h) => (
              <li key={h.id} className="min-w-0">
                <span className="text-agm-muted">
                  {h.meeting || "過去の総会"}（{date(h.startedAt)}）
                </span>
                {h.questions.map((q) => (
                  <p key={q.seq} className="truncate pl-3" title={q.excerpt}>
                    <span className="text-agm-ink">{q.category}</span>
                    <span className="text-agm-muted">「{q.excerpt}」</span>
                    {q.qaCode && <span className="ml-1 font-mono text-[10px] text-agm-muted">{q.qaCode}</span>}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

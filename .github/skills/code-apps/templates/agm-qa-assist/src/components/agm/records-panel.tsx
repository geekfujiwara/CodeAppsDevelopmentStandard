import { useMemo, useState, type ReactNode } from "react"
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, Pencil, RotateCw, XCircle } from "lucide-react"
import type { SaveSteps, StepState, TurnSummary } from "@/lib/agm/records"

export type RecordsTab = "records" | "script" | "compare"

export interface LocalRecord {
  key: string
  turnId?: string
  shareholderNumber: string
  shareholderName: string
  startedAt: Date
  durationSec: number
  questionCount: number
  categories: string[]
  rehearsal: boolean
  steps: SaveSteps
  audioUrl?: string
  error?: string
}

const STEP_LABEL: Record<keyof SaveSteps, string> = { audio: "録音", turn: "発言", questions: "質問" }

function StepChip({ name, state }: { name: keyof SaveSteps; state: StepState }) {
  const icon = {
    pending: <CircleDashed className="size-3.5" aria-hidden />,
    running: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
    done: <CheckCircle2 className="size-3.5 text-agm-ok" aria-hidden />,
    failed: <XCircle className="size-3.5 text-agm-danger" aria-hidden />,
    skipped: <CircleDashed className="size-3.5 opacity-40" aria-hidden />,
  }[state]
  const text = { pending: "待機", running: "保存中", done: "保存済み", failed: "失敗", skipped: "なし" }[state]
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-agm-muted" title={`${STEP_LABEL[name]}: ${text}`}>
      {icon}
      {STEP_LABEL[name]}
    </span>
  )
}

const time = (value: Date | string) => {
  const d = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

/** 株主番号のセル。押すとその場で直せる（保存済みの発言だけ） */
function NumberCell({ value, turnId, onEdit }: { value: string; turnId?: string; onEdit?: (turnId: string, number: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  if (!turnId || !onEdit)
    return <span className={value ? "" : "text-agm-warn"}>{value || "未確認"}</span>
  if (!editing)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setDraft(value)
          setEditing(true)
        }}
        className={`group inline-flex items-center gap-1 rounded px-1 hover:bg-agm-bg ${value ? "" : "text-agm-warn"}`}
        title="押すと株主番号を直せます"
        data-testid="record-number"
      >
        {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        {value || "未確認"}
        <Pencil className="size-3 opacity-40 group-hover:opacity-100" aria-hidden />
      </button>
    )
  // 入力欄の今の値で確定する（入力の直後に Enter を押すと、state の更新前の値で確定してしまうため）
  const commit = (raw: string = draft) => {
    if (!editing) return
    setEditing(false)
    const next = raw.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[^\d]/g, "")
    if (next === value) return
    setBusy(true)
    void onEdit(turnId, next).finally(() => setBusy(false))
  }
  return (
    <input
      autoFocus
      value={draft}
      inputMode="numeric"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value)
        if (e.key === "Escape") setEditing(false)
      }}
      className="h-7 w-20 rounded border border-agm-accent bg-agm-bg px-1 font-mono text-sm outline-none"
      aria-label="株主番号"
      data-testid="record-number-input"
    />
  )
}

export function RecordsPanel({  local,
  saved,
  loading,
  onReload,
  reviewId,
  onReview,
  tab = "records",
  onTab,
  scriptView,
  compareView,
  onEditNumber,
}: {
  local: LocalRecord[]
  saved: TurnSummary[]
  loading: boolean
  onReload: () => void
  reviewId?: string
  onReview: (turnId: string) => void
  tab?: RecordsTab
  onTab?: (tab: RecordsTab) => void
  /** リハーサル台本（あれば「台本」タブを出す） */
  scriptView?: ReactNode
  /** 文字起こしの比較（Azure Speech と MAI） */
  compareView?: ReactNode
  /** 保存済みの発言の株主番号を直す（名簿を引き直して氏名も更新する） */
  onEditNumber?: (turnId: string, number: string) => Promise<void>
}) {
  const [filter, setFilter] = useState<string | null>(null)
  const localIds = new Set(local.map((r) => `${r.shareholderNumber}|${r.startedAt.toISOString().slice(0, 19)}`))
  const older = saved.filter((t) => !localIds.has(`${t.shareholderNumber}|${t.startedAt.slice(0, 19)}`))
  const numbers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of [...local.map((r) => r.shareholderNumber), ...older.map((t) => t.shareholderNumber)]) counts.set(n, (counts.get(n) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [local, older])
  const show = (n: string) => !filter || filter === n

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-xl border border-agm-line bg-agm-panel" aria-label="記録">
      <header className="flex min-w-0 items-center gap-2 border-b border-agm-line px-4 py-2">
        <div className="flex shrink-0 items-center gap-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "records"} onClick={() => onTab?.("records")} data-testid="records-tab" className={`text-sm font-semibold tracking-wide ${tab === "records" ? "text-agm-ink" : "text-agm-muted hover:text-agm-ink"}`}>
            ④ 記録（株主番号ごと）
          </button>
          {scriptView && (
            <button type="button" role="tab" aria-selected={tab === "script"} onClick={() => onTab?.("script")} className={`ml-3 rounded-full border px-2.5 py-0.5 text-xs ${tab === "script" ? "border-agm-warn text-agm-warn" : "border-agm-line text-agm-muted"}`} data-testid="script-tab">
              リハーサル台本
            </button>
          )}
          {compareView && (
            <button type="button" role="tab" aria-selected={tab === "compare"} onClick={() => onTab?.("compare")} className={`ml-1 rounded-full border px-2.5 py-0.5 text-xs ${tab === "compare" ? "border-agm-accent text-agm-accent" : "border-agm-line text-agm-muted"}`} data-testid="compare-tab">
              文字起こしの比較
            </button>
          )}
        </div>
        <div className="agm-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          <button type="button" onClick={() => setFilter(null)} className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${!filter ? "border-agm-accent text-agm-accent" : "border-agm-line text-agm-muted"}`}>
            すべて
          </button>
          {numbers.map(([n, count]) => (
            <button
              key={n}
              type="button"
              onClick={() => setFilter(filter === n ? null : n)}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-xs ${filter === n ? "border-agm-accent text-agm-accent" : "border-agm-line text-agm-muted"}`}
            >
              {n || "未確認"}
              <span className="ml-1 opacity-70">×{count}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onReload} className="shrink-0 rounded p-1 text-agm-muted hover:text-agm-ink" title="Dataverse から読み直す" aria-label="記録を読み直す">
          <RotateCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>
      {tab === "compare" && compareView ? <div className="min-h-0 flex-1">{compareView}</div> : tab === "script" && scriptView ? <div className="min-h-0 flex-1">{scriptView}</div> : (
      <div className="agm-scroll min-h-0 flex-1 overflow-y-auto" data-testid="records">
        <table className="w-full table-fixed text-sm">
          <thead className="sticky top-0 bg-agm-panel text-left text-[11px] text-agm-muted">
            <tr>
              <th className="w-24 px-4 py-1.5 font-medium">株主番号</th>
              <th className="w-32 px-2 py-1.5 font-medium">氏名</th>
              <th className="w-24 px-2 py-1.5 font-medium">開始</th>
              <th className="w-16 px-2 py-1.5 font-medium">長さ</th>
              <th className="px-2 py-1.5 font-medium">保存状態</th>
              <th className="w-20 px-4 py-1.5 font-medium">録音</th>
            </tr>
          </thead>
          <tbody>
            {local.filter((r) => show(r.shareholderNumber)).map((r) => (
              <tr key={r.key} className={`border-t border-agm-line/60 ${r.turnId ? "cursor-pointer hover:bg-agm-raised" : ""} ${r.turnId && r.turnId === reviewId ? "bg-agm-raised" : ""}`} onClick={r.turnId ? () => onReview(r.turnId!) : undefined} title={r.turnId ? "この発言を振り返る" : undefined}>
                <td className="px-4 py-1.5 font-mono"><NumberCell value={r.shareholderNumber} turnId={r.turnId} onEdit={onEditNumber} /></td>
                <td className="truncate px-2 py-1.5">{r.shareholderName || "-"}</td>
                <td className="px-2 py-1.5 text-agm-muted">{time(r.startedAt)}</td>
                <td className="px-2 py-1.5 text-agm-muted">{Math.round(r.durationSec)} 秒</td>
                <td className="px-2 py-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                    {(Object.keys(STEP_LABEL) as (keyof SaveSteps)[]).map((k) => (
                      <StepChip key={k} name={k} state={r.steps[k]} />
                    ))}
                    <span className="text-[11px] text-agm-muted">質問 {r.questionCount} 件</span>
                    {r.rehearsal && <span className="text-[11px] text-agm-warn">リハーサル</span>}
                    {r.error && <span className="truncate text-[11px] text-agm-danger" title={r.error}>{r.error}</span>}
                  </div>
                </td>
                <td className="px-4 py-1.5">{r.audioUrl ? <AudioLink url={r.audioUrl} /> : <span className="text-agm-muted">-</span>}</td>
              </tr>
            ))}
            {older.filter((t) => show(t.shareholderNumber)).map((t) => (
              <tr key={t.id} className={`cursor-pointer border-t border-agm-line/60 text-agm-muted hover:bg-agm-raised ${t.id === reviewId ? "bg-agm-raised" : ""}`} onClick={() => onReview(t.id)} title="この発言を振り返る" data-testid="saved-turn">
                <td className="px-4 py-1.5 font-mono text-agm-ink"><NumberCell value={t.shareholderNumber} turnId={t.id} onEdit={onEditNumber} /></td>
                <td className="truncate px-2 py-1.5">{t.shareholderName || "-"}</td>
                <td className="px-2 py-1.5">{time(t.startedAt)}</td>
                <td className="px-2 py-1.5">{t.durationSec} 秒</td>
                <td className="truncate px-2 py-1.5 text-[11px]" title={t.transcript}>{t.saveStatus}</td>
                <td className="px-4 py-1.5">{t.audioUrl ? <AudioLink url={t.audioUrl} /> : "-"}</td>
              </tr>
            ))}
            {!local.length && !older.length && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-sm text-agm-muted">
                  {loading ? "読み込み中…" : "まだ記録はありません。次の株主番号を拾うか停止すると、前の株主の録音・文字起こし・質問を保存します"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </section>
  )
}

function AudioLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-agm-accent hover:underline">
      開く
      <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

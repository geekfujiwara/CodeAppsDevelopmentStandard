import { BarChart3, Library, Loader2, Mic, MonitorSpeaker, Radio, Scissors, Square, Theater, Tv } from "lucide-react"
import type { ReactNode } from "react"
import type { SessionState, SessionStats } from "@/hooks/use-transcription-session"

export type Mode = "live" | "rehearsal"
export type View = "cockpit" | "library" | "meeting" | "watch"
/** tts: Windows の音声で読み上げ（マイクで拾う） / human: 人が読み上げ / text: 文字だけ流す（音声・録音なし） */
export type RehearsalStyle = "tts" | "human" | "text"

function Level({ value, active }: { value: number; active: boolean }) {
  const bars = 8
  return (
    <div className="flex h-5 items-end gap-0.5" aria-label="入力レベル" title="入力レベル">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="w-1 rounded-sm transition-colors"
          style={{ height: `${30 + i * 10}%`, background: active && value * bars > i ? (i > 5 ? "var(--agm-warn)" : "var(--agm-ok)") : "var(--agm-line)" }}
        />
      ))}
    </div>
  )
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0")
const clock = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}:${pad((sec % 3600) / 60)}:${pad(sec % 60)}` : `${pad(sec / 60)}:${pad(sec % 60)}`)

const STYLE_LABEL: Record<RehearsalStyle, string> = {
  tts: "Windows の音声で読み上げ",
  human: "人が台本を読み上げ",
  text: "文字だけ流す（音声なし）",
}

const VIEW_LABEL: Record<View, string> = { cockpit: "質疑応答", library: "想定問答", meeting: "総会・集計", watch: "LIVE 視聴" }
const VIEW_ICON: Record<View, ReactNode> = {
  cockpit: <MonitorSpeaker className="size-3.5" aria-hidden />,
  library: <Library className="size-3.5" aria-hidden />,
  meeting: <BarChart3 className="size-3.5" aria-hidden />,
  watch: <Tv className="size-3.5" aria-hidden />,
}

export function TopBar(props: {
  meetingTitle: string
  view: View
  onView: (v: View) => void
  mode: Mode
  onMode: (m: Mode) => void
  style: RehearsalStyle
  onStyle: (s: RehearsalStyle) => void
  voiceCount: number
  state: SessionState
  elapsedSec: number
  turnCount: number
  stats: SessionStats
  showLevel: boolean
  disabledReason?: string
  onToggle: () => void
  /** 総会の切り替え・作成（押すと総会の画面へ） */
  onMeeting: () => void
  /** LIVE 共有（配信側）。undefined なら出さない（閲覧専用の利用者） */
  live?: { active: boolean; viewers: number; onOpen: () => void }
  /** 自分に共有された LIVE があるときだけ「LIVE 視聴」タブを出す */
  watchable: boolean
  onCut: () => void
  status: { label: string; tone: "ok" | "warn" | "danger" | "muted" }[]
}) {
  const running = props.state === "running"
  const busy = props.state === "starting" || props.state === "stopping"
  const locked = running || busy
  const startLabel = props.mode === "live" ? "開始（連続で録音・文字起こし）" : props.style === "text" ? "リハーサル開始（文字のみ）" : "リハーサル開始（録音あり）"
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-agm-line bg-agm-panel px-5 py-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-agm-muted">AGM Q&amp;A Assist</p>
        <button type="button" onClick={props.onMeeting} className="max-w-72 truncate text-left text-lg font-bold hover:text-agm-accent" title="総会を切り替える" data-testid="meeting-title">
          {props.meetingTitle}
        </button>
      </div>

      <div className="flex h-9 rounded-md border border-agm-line p-0.5" role="tablist" aria-label="画面">
        {(["cockpit", "library", "meeting", ...(props.watchable ? ["watch"] : [])] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={props.view === v}
            onClick={() => props.onView(v)}
            className={`flex items-center gap-1 rounded px-2.5 text-sm ${props.view === v ? "bg-agm-accent text-agm-bg" : "text-agm-muted hover:text-agm-ink"}`}
            data-testid={`view-${v}`}
          >
            {VIEW_ICON[v]}
            {VIEW_LABEL[v]}
            {v === "cockpit" && props.view !== "cockpit" && running && <span className="agm-rec-dot ml-1 size-2 rounded-full bg-agm-rec" aria-label="録音中" />}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-agm-muted">入力</span>
          <div className="flex h-9 rounded-md border border-agm-line p-0.5" role="radiogroup" aria-label="入力の種類">
            {(["live", "rehearsal"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={props.mode === m}
                disabled={locked}
                onClick={() => props.onMode(m)}
                className={`flex items-center gap-1 rounded px-2.5 text-sm ${props.mode === m ? "bg-agm-raised text-agm-ink" : "text-agm-muted"} disabled:opacity-60`}
              >
                {m === "live" ? <Mic className="size-3.5" aria-hidden /> : <Theater className="size-3.5" aria-hidden />}
                {m === "live" ? "本番（マイク）" : "リハーサル"}
              </button>
            ))}
          </div>
        </div>
        {props.mode === "rehearsal" && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-agm-muted">読み方</span>
            <select
              value={props.style}
              onChange={(e) => props.onStyle(e.target.value as RehearsalStyle)}
              disabled={locked}
              className="h-9 rounded-md border border-agm-line bg-agm-bg px-2 text-sm outline-none focus:border-agm-accent"
              data-testid="rehearsal-style"
            >
              {(Object.keys(STYLE_LABEL) as RehearsalStyle[]).map((s) => (
                <option key={s} value={s} disabled={s === "tts" && props.voiceCount === 0}>
                  {STYLE_LABEL[s]}
                  {s === "tts" && props.voiceCount === 0 ? "（日本語の音声なし）" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={props.onToggle}
          disabled={busy || (!running && !!props.disabledReason)}
          className={`flex h-11 items-center gap-2 rounded-lg px-5 text-base font-bold shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            running ? "bg-agm-rec text-white hover:brightness-110" : "bg-agm-accent text-agm-bg hover:brightness-110"
          }`}
          title={!running ? props.disabledReason : undefined}
          data-testid="toggle"
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : running ? <Square className="size-4 fill-current" aria-hidden /> : <span className="size-3 rounded-full bg-agm-rec" aria-hidden />}
          {props.state === "starting" ? "開始しています…" : props.state === "stopping" ? "保存しています…" : running ? "終了して保存" : startLabel}
        </button>
        <div className="flex flex-col items-start">
          <span className={`flex items-center gap-1.5 font-mono text-lg tabular-nums ${running ? "text-agm-ink" : "text-agm-muted"}`} data-testid="elapsed">
            {running && <span className="agm-rec-dot size-2.5 rounded-full bg-agm-rec" aria-hidden />}
            {clock(props.elapsedSec)}
          </span>
          <span className="text-[11px] text-agm-muted">発言 {props.turnCount} 件</span>
        </div>
        {props.showLevel && <Level value={props.stats.level} active={running} />}
        {!running && props.disabledReason && <span className="max-w-48 text-xs text-agm-warn">{props.disabledReason}</span>}
      </div>

      {props.live && (
        <button
          type="button"
          onClick={props.live.onOpen}
          className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm ${props.live.active ? "border-agm-rec text-agm-rec" : "border-agm-line text-agm-muted hover:text-agm-ink"}`}
          title="幹部の画面へ読み取り専用で共有する"
          data-testid="live-button"
        >
          <Radio className={`size-4 ${props.live.active ? "agm-rec-dot" : ""}`} aria-hidden />
          {props.live.active ? `LIVE 配信中・${props.live.viewers} 人` : "LIVE 共有"}
        </button>
      )}
      {running && (
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={props.onCut}
            className="flex h-9 items-center gap-1 rounded-md border border-agm-line px-2.5 text-sm text-agm-muted hover:text-agm-ink"
            title="株主番号が聞き取れなかったときに、次の発言から新しい株主として区切る"
          >
            <Scissors className="size-3.5" aria-hidden />
            ここで区切る
          </button>
        </div>
      )}

      <ul className="ml-auto flex flex-wrap items-center gap-1.5" aria-label="状態">
        {props.status.map((s) => (
          <li
            key={s.label}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
              { ok: "border-agm-ok/50 text-agm-ok", warn: "border-agm-warn/50 text-agm-warn", danger: "border-agm-danger/50 text-agm-danger", muted: "border-agm-line text-agm-muted" }[s.tone]
            }`}
          >
            {s.label}
          </li>
        ))}
      </ul>
    </header>
  )
}

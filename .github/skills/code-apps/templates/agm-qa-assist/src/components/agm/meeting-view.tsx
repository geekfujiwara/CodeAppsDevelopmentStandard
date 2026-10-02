import { useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { CalendarPlus, CheckCircle2, ExternalLink, FileDown, Loader2, RotateCw, Star } from "lucide-react"
import { CiteChip } from "@/components/agm/source-context"
import { createLogger } from "@/lib/debug-log"
import { errorText } from "@/lib/agm/corpus"
import { createMeeting, listMeetings, updateMeeting, type Meeting } from "@/lib/agm/meetings"
import { loadMeetingData, saveRating, type MeetingData } from "@/lib/agm/meeting-data"
import { meetingMarkdown, meetingStats, questionsCsv } from "@/lib/agm/meeting-stats"
import { uploadMeetingFile } from "@/lib/agm/records"
import { col } from "@/lib/agm/config"

const log = createLogger("meeting-view")
const AXIS = { fill: "var(--agm-muted)", fontSize: 11 }
const TOOLTIP = { contentStyle: { background: "var(--agm-raised)", border: "1px solid var(--agm-line)", color: "var(--agm-ink)", fontSize: 12 }, cursor: { fill: "rgba(92,200,255,0.08)" } }

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="min-w-0 rounded-lg border border-agm-line bg-agm-panel px-4 py-3" data-testid="kpi">
      <p className="text-[11px] text-agm-muted">{label}</p>
      <p className={`font-mono text-3xl font-bold tabular-nums ${tone === "warn" ? "text-agm-warn" : tone === "ok" ? "text-agm-ok" : ""}`}>{value}</p>
      {sub && <p className="truncate text-[11px] text-agm-muted">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-lg border border-agm-line bg-agm-panel p-3">
      <h3 className="mb-2 text-xs font-semibold text-agm-muted">{title}</h3>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

function Stars({ value, onChange, readOnly }: { value: number; onChange: (v: number) => void; readOnly?: boolean }) {
  return (
    <span className="inline-flex" role="radiogroup" aria-label="回答案の評価">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={readOnly} onClick={() => onChange(n === value ? 0 : n)} aria-label={`${n} 点`} className="p-0.5 disabled:cursor-default" data-testid="rate-star">
          <Star className={`size-4 ${n <= value ? "fill-agm-warn text-agm-warn" : "text-agm-line"}`} aria-hidden />
        </button>
      ))}
    </span>
  )
}

/** 株主総会ごとの記録・集計・評価・まとめての保存 */
export function MeetingView({ current, onUseMeeting, readOnly, refreshKey }: { current: Meeting | null; onUseMeeting: (m: Meeting) => void; readOnly?: boolean; refreshKey?: number }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(current?.id ?? null)
  const [data, setData] = useState<MeetingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState({ title: "", date: new Date().toISOString().slice(0, 10) })
  const [exporting, setExporting] = useState<"idle" | "running" | "done" | "failed">("idle")
  const [holderFilter, setHolderFilter] = useState<string | null>(null)

  const reloadMeetings = useCallback(() => {
    listMeetings()
      .then((list) => {
        setMeetings(list)
        setSelectedId((id) => id ?? current?.id ?? list[0]?.id ?? null)
      })
      .catch((e) => setError(errorText(e)))
  }, [current?.id])
  useEffect(() => reloadMeetings(), [reloadMeetings])
  useEffect(() => {
    if (current?.id) setSelectedId(current.id)
  }, [current?.id])

  const selected = meetings.find((m) => m.id === selectedId) ?? (current && current.id === selectedId ? current : null)

  const reload = useCallback(() => {
    if (!selectedId) return
    setLoading(true)
    setError(undefined)
    const t0 = performance.now()
    loadMeetingData(selectedId)
      .then((d) => {
        setData(d)
        log.info("総会の記録を読み込みました", { meetingId: selectedId, turns: d.turns.length, questions: d.questions.length, ms: Math.round(performance.now() - t0) })
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false))
  }, [selectedId])
  useEffect(() => reload(), [reload, refreshKey])

  const stats = useMemo(() => (data ? meetingStats(data.turns, data.questions) : null), [data])
  const turnById = useMemo(() => new Map((data?.turns ?? []).map((t) => [t.id, t])), [data])
  const rows = useMemo(
    () =>
      (data?.questions ?? [])
        .map((q) => ({ q, t: turnById.get(q.turnId) }))
        .filter(({ t }) => !holderFilter || t?.shareholderNumber === holderFilter)
        .sort((a, b) => (a.t?.startedAt ?? "").localeCompare(b.t?.startedAt ?? "") || a.q.seq - b.q.seq),
    [data, turnById, holderFilter],
  )

  const rate = async (questionId: string, rating: number, comment?: string) => {
    setData((d) => d && { ...d, questions: d.questions.map((q) => (q.id === questionId ? { ...q, rating, ratingComment: comment ?? q.ratingComment } : q)) })
    try {
      const q = data?.questions.find((x) => x.id === questionId)
      await saveRating(questionId, rating, comment ?? q?.ratingComment ?? "")
      log.info("評価を保存しました", { questionId, rating })
    } catch (e) {
      log.error("評価を保存できません", e)
      setError(errorText(e))
    }
  }

  const create = async () => {
    if (!draft.title.trim()) return
    try {
      const m = await createMeeting(draft.title.trim(), draft.date)
      setMeetings((list) => [m, ...list])
      setSelectedId(m.id)
      onUseMeeting(m)
      setDraft((d) => ({ ...d, title: "" }))
    } catch (e) {
      setError(errorText(e))
    }
  }

  const exportAll = async () => {
    if (!selected || !data) return
    setExporting("running")
    const t0 = performance.now()
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
      const md = meetingMarkdown(selected.title, selected.date, data.turns, data.questions)
      const csv = questionsCsv(data.turns, data.questions)
      if (data.source === "local-demo") {
        log.info("テスト用ビルドのため、まとめは保存しません", { mdChars: md.length, csvChars: csv.length })
      } else {
        const url = await uploadMeetingFile(selected.title, `${stamp}_まとめ.md`, md)
        await uploadMeetingFile(selected.title, `${stamp}_質問一覧.csv`, csv)
        await updateMeeting(selected.id, { [col("summaryurl")]: url })
        setMeetings((list) => list.map((m) => (m.id === selected.id ? { ...m, summaryUrl: url } : m)))
        log.info("総会のまとめを保存しました", { url, ms: Math.round(performance.now() - t0) })
      }
      setExporting("done")
    } catch (e) {
      log.error("まとめを保存できません", e)
      setError(errorText(e))
      setExporting("failed")
    }
  }

  const matchedRate = stats && stats.questions ? Math.round((stats.matched / stats.questions) * 100) : 0
  return (
    <div className="agm-scroll flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3" data-testid="meeting-view">
      <section className="flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-agm-line bg-agm-panel px-4 py-3">
        <label className="flex min-w-64 flex-col gap-0.5">
          <span className="text-[11px] text-agm-muted">株主総会</span>
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className="h-9 rounded-md border border-agm-line bg-agm-bg px-2 text-sm outline-none focus:border-agm-accent" data-testid="meeting-select">
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
                {m.date ? `（${m.date}）` : ""}
                {m.id === current?.id ? " ● 記録先" : ""}
              </option>
            ))}
          </select>
        </label>
        {!readOnly && selected && selected.id !== current?.id && (
          <button type="button" onClick={() => onUseMeeting(selected)} className="h-9 rounded-md border border-agm-accent px-3 text-sm text-agm-accent hover:bg-agm-accent/10" data-testid="use-meeting">
            この総会に記録する
          </button>
        )}
        {selected?.id === current?.id && (
          <span className="flex h-9 items-center gap-1 text-xs text-agm-ok">
            <CheckCircle2 className="size-4" aria-hidden />
            新しい発言はこの総会に記録します
          </span>
        )}
        <button type="button" onClick={reload} className="h-9 rounded-md p-2 text-agm-muted hover:text-agm-ink" aria-label="読み直す" title="読み直す">
          <RotateCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        {!readOnly && (
          <div className="ml-auto flex items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] text-agm-muted">新しい総会</span>
              <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="例: 第43期 定時株主総会" className="h-9 w-56 rounded-md border border-agm-line bg-agm-bg px-2 text-sm outline-none focus:border-agm-accent" data-testid="new-meeting-title" />
            </label>
            <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className="h-9 rounded-md border border-agm-line bg-agm-bg px-2 text-sm outline-none" aria-label="開催日" />
            <button type="button" onClick={() => void create()} disabled={!draft.title.trim()} className="flex h-9 items-center gap-1 rounded-md bg-agm-raised px-3 text-sm disabled:opacity-50" data-testid="create-meeting">
              <CalendarPlus className="size-4" aria-hidden />
              作成して記録先にする
            </button>
            <button type="button" onClick={() => void exportAll()} disabled={!data || exporting === "running"} className="flex h-9 items-center gap-1 rounded-md bg-agm-accent px-3 text-sm font-semibold text-agm-bg disabled:opacity-50" data-testid="export-meeting">
              {exporting === "running" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileDown className="size-4" aria-hidden />}
              まとめて保存（Markdown＋CSV）
            </button>
          </div>
        )}
        {selected?.summaryUrl && (
          <a href={selected.summaryUrl} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 text-sm text-agm-accent hover:underline">
            <ExternalLink className="size-4" aria-hidden />
            保存したまとめ
          </a>
        )}
        {exporting === "done" && <span className="text-xs text-agm-ok" data-testid="export-done">まとめを保存しました</span>}
      </section>

      {error && <p className="rounded-md border border-agm-danger/50 bg-agm-danger/10 px-3 py-2 text-sm text-agm-danger">{error}</p>}
      {data?.source === "local-demo" && <p className="text-xs text-agm-warn">テスト用ビルド: 同梱の過去の総会（デモ）を表示しています。評価・まとめは保存しません</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="発言" value={stats.turns} sub={`合計 ${stats.totalMinutes} 分`} />
            <Kpi label="株主" value={stats.shareholders} sub="番号が確認できた人数" />
            <Kpi label="番号未確認" value={stats.unidentified} tone={stats.unidentified ? "warn" : "ok"} sub="記録で直せます" />
            <Kpi label="質問" value={stats.questions} />
            <Kpi label="想定問答に一致" value={`${matchedRate}%`} sub={`一致 ${stats.matched}・新規 ${stats.novel}`} tone={matchedRate >= 80 ? "ok" : "warn"} />
            <Kpi label="AI 回答案" value={stats.aiDrafts} sub={stats.questions ? `${Math.round((stats.aiDrafts / stats.questions) * 100)}% の質問` : undefined} />
            <Kpi label="平均評価" value={stats.averageRating ?? "—"} sub={`${stats.rated} 件を評価`} />
          </div>

          <div className="grid min-h-[16rem] grid-cols-1 gap-3 lg:grid-cols-4" style={{ height: "17rem" }}>
            <ChartCard title="分類別の質問数">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byCategory} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid stroke="var(--agm-line)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={AXIS} />
                  <YAxis type="category" dataKey="category" width={96} tick={AXIS} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="count" name="質問" fill="var(--agm-q1)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="時間帯ごとの質問数（15 分）">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byTime} margin={{ right: 8 }}>
                  <CartesianGrid stroke="var(--agm-line)" vertical={false} />
                  <XAxis dataKey="slot" tick={AXIS} />
                  <YAxis allowDecimals={false} tick={AXIS} width={24} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="count" name="質問" fill="var(--agm-q3)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="想定問答との一致">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "想定問答に一致", value: stats.matched },
                      { name: "新規の質問", value: stats.novel },
                    ]}
                    dataKey="value"
                    innerRadius="50%"
                    outerRadius="78%"
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill="var(--agm-ok)" />
                    <Cell fill="var(--agm-warn)" />
                  </Pie>
                  <Tooltip {...TOOLTIP} />
                  <Legend verticalAlign="bottom" iconType="circle" formatter={(value, entry) => <span className="text-xs text-agm-ink">{value} {(entry.payload as { value?: number } | undefined)?.value ?? 0}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="回答案の評価の分布">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.ratings} margin={{ right: 8 }}>
                  <CartesianGrid stroke="var(--agm-line)" vertical={false} />
                  <XAxis dataKey="rating" tick={AXIS} tickFormatter={(v) => `★${v}`} />
                  <YAxis allowDecimals={false} tick={AXIS} width={24} />
                  <Tooltip {...TOOLTIP} />
                  <Bar dataKey="count" name="件数" fill="var(--agm-warn)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <section className="rounded-lg border border-agm-line bg-agm-panel">
            <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-agm-line px-4 py-2">
              <h3 className="text-sm font-semibold">質問と回答案の評価</h3>
              <span className="text-xs text-agm-muted">{rows.length} 件</span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setHolderFilter(null)} className={`rounded-full border px-2.5 py-0.5 text-xs ${!holderFilter ? "border-agm-accent text-agm-accent" : "border-agm-line text-agm-muted"}`}>
                  すべて
                </button>
                {stats.topShareholders.map((h) => (
                  <button key={h.number} type="button" onClick={() => setHolderFilter(holderFilter === h.number ? null : h.number)} className={`rounded-full border px-2.5 py-0.5 text-xs ${holderFilter === h.number ? "border-agm-accent text-agm-accent" : "border-agm-line text-agm-muted"}`}>
                    <span className="font-mono">{h.number}</span> {h.name}×{h.questions}
                  </button>
                ))}
              </div>
            </header>
            <table className="w-full table-fixed text-sm" data-testid="meeting-questions">
              <thead className="text-left text-[11px] text-agm-muted">
                <tr>
                  <th className="w-36 px-4 py-1.5 font-medium">株主</th>
                  <th className="w-28 px-2 py-1.5 font-medium">分類</th>
                  <th className="px-2 py-1.5 font-medium">質問</th>
                  <th className="w-24 px-2 py-1.5 font-medium">想定問答</th>
                  <th className="w-32 px-2 py-1.5 font-medium">評価</th>
                  <th className="w-56 px-4 py-1.5 font-medium">コメント</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ q, t }) => (
                  <tr key={q.id} className="border-t border-agm-line/60 align-top">
                    <td className="truncate px-4 py-1.5">
                      <span className={`font-mono ${t?.shareholderNumber ? "" : "text-agm-warn"}`}>{t?.shareholderNumber || "未確認"}</span> {t?.shareholderName}
                    </td>
                    <td className="truncate px-2 py-1.5 text-agm-muted">{q.category}</td>
                    <td className="px-2 py-1.5">
                      <p className="line-clamp-2" title={q.excerpt}>
                        {q.excerpt}
                      </p>
                      {q.aiDraft && (
                        <details className="text-xs text-agm-muted">
                          <summary className="cursor-pointer">AI 回答案</summary>
                          <p className="whitespace-pre-wrap pt-1 leading-5 text-agm-ink">{q.aiDraft}</p>
                        </details>
                      )}
                    </td>
                    <td className="px-2 py-1.5">{q.qaCode ? <CiteChip id={q.qaCode} /> : <span className="text-xs text-agm-warn">新規</span>}</td>
                    <td className="px-2 py-1.5">
                      <Stars value={q.rating} readOnly={readOnly} onChange={(v) => void rate(q.id, v)} />
                    </td>
                    <td className="px-4 py-1.5">
                      <input
                        defaultValue={q.ratingComment}
                        disabled={readOnly}
                        onBlur={(e) => e.target.value !== q.ratingComment && void rate(q.id, q.rating, e.target.value)}
                        placeholder="気づき（任意）"
                        className="h-7 w-full rounded border border-agm-line bg-agm-bg px-2 text-xs outline-none focus:border-agm-accent"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {!stats && loading && (
        <p className="flex items-center gap-2 text-sm text-agm-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          記録を読み込んでいます…
        </p>
      )}
    </div>
  )
}

import { AlertTriangle, Loader2 } from "lucide-react"
import type { FinalLine } from "@/hooks/use-continuous-session"
import type { Refined } from "@/hooks/use-refine"
import { charDiffRate, diffSegments } from "@/lib/agm/text-diff"
import type { SttEngine } from "@/lib/agm/settings"
import { qTint } from "./colors"

function Marked({ parts, tone }: { parts: { text: string; same: boolean }[]; tone: "a" | "b" }) {
  return (
    <>
      {parts.map((p, i) =>
        p.same ? (
          <span key={i}>{p.text}</span>
        ) : (
          <mark key={i} className="rounded px-0.5 text-agm-ink" style={{ background: tone === "a" ? qTint(0, 35) : qTint(1, 40) }}>
            {p.text}
          </mark>
        ),
      )}
    </>
  )
}

const time = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms / 1000) % 60)).padStart(2, "0")}`

/** Azure Speech（リアルタイム）と MAI-Transcribe の確定文ごとの結果を並べ、違う箇所に印を付ける */
export function SttComparePanel({ lines, refined, engine, model }: { lines: FinalLine[]; refined: Record<number, Refined>; engine: SttEngine; model: string }) {
  if (engine === "azure")
    return <p className="p-4 text-sm text-agm-muted">設定の「文字起こし」で MAI-Transcribe か「比較」を選ぶと、確定文ごとに Azure Speech と MAI の結果を並べます（マイク・Windows の読み上げのとき。文字だけのリハーサルは録音が無いため対象外）。</p>
  const done = lines.filter((l) => refined[l.id]?.status === "done")
  const rates = done.map((l) => charDiffRate(l.text, refined[l.id].text ?? ""))
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
  const lat = done.map((l) => refined[l.id].ms ?? 0).sort((a, b) => a - b)
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="stt-compare">
      <p className="flex flex-wrap gap-x-4 border-b border-agm-line px-4 py-1.5 text-xs text-agm-muted" data-testid="stt-compare-summary">
        <span>
          確定文 {lines.length}・再認識 {done.length}
        </span>
        <span>食い違い（文字）平均 {(avg * 100).toFixed(1)}%</span>
        <span>違う文 {rates.filter((r) => r > 0).length}</span>
        {lat.length > 0 && <span>{model} の応答 中央値 {lat[Math.floor(lat.length / 2)]} ms</span>}
        <span className="ml-auto">
          <mark className="rounded px-1 text-agm-ink" style={{ background: qTint(0, 35) }}>Azure だけ</mark> <mark className="rounded px-1 text-agm-ink" style={{ background: qTint(1, 40) }}>MAI だけ</mark>
        </span>
      </p>
      <div className="agm-scroll min-h-0 flex-1 overflow-y-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="sticky top-0 bg-agm-panel text-left text-[11px] text-agm-muted">
            <tr>
              <th className="w-14 px-3 py-1 font-medium">位置</th>
              <th className="px-2 py-1 font-medium">Azure Speech（リアルタイム）</th>
              <th className="px-2 py-1 font-medium">{model}</th>
              <th className="w-16 px-3 py-1 text-right font-medium">違い</th>
            </tr>
          </thead>
          <tbody>
            {[...lines].reverse().map((l) => {
              const r = refined[l.id]
              const d = r?.status === "done" ? diffSegments(l.text, r.text ?? "") : null
              const rate = r?.status === "done" ? charDiffRate(l.text, r.text ?? "") : null
              return (
                <tr key={l.id} className="border-t border-agm-line/60 align-top" data-testid="stt-compare-row">
                  <td className="px-3 py-1 font-mono text-[11px] text-agm-muted">{time(l.offsetMs)}</td>
                  <td className="px-2 py-1 leading-6">{d ? <Marked parts={d.a} tone="a" /> : l.text}</td>
                  <td className="px-2 py-1 leading-6">
                    {d ? (
                      <Marked parts={d.b} tone="b" />
                    ) : r?.status === "pending" ? (
                      <Loader2 className="size-4 animate-spin text-agm-muted" aria-label="認識中" />
                    ) : r?.status === "error" || r?.status === "skipped" ? (
                      <span className="flex items-center gap-1 text-xs text-agm-warn">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        {r.error}
                      </span>
                    ) : (
                      <span className="text-agm-muted">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono text-xs tabular-nums ${rate ? "text-agm-warn" : "text-agm-muted"}`}>
                    {rate === null ? "" : `${(rate * 100).toFixed(0)}%`}
                    {r?.ms ? <span className="block text-[10px] text-agm-muted">{r.ms} ms</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

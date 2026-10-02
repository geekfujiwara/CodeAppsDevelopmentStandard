import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Cpu, Globe2, Loader2, Mic, RotateCcw, Save, Sparkles, UserSearch } from "lucide-react"
import { clearLocalSettings, saveOrgDefault, setLocalSettings, sourceOf, useSettings, type AppSettings, type SettingsPatch, type Source, type SttEngine } from "@/lib/agm/settings"
import { errorText } from "@/lib/agm/corpus"
import sttEval from "../../../spec/eval/stt-compare.json"

const SOURCE_LABEL: Record<Source, string> = { initial: "アプリの初期値", org: "組織の既定", local: "この端末だけ" }
const ENGINE_LABEL: Record<SttEngine, { title: string; detail: string }> = {
  azure: { title: "Azure Speech（リアルタイム）", detail: "途中経過が 0.3 秒ほどで出る。日本（東日本）で処理" },
  mai: { title: "MAI-Transcribe（確定文ごとに再認識）", detail: "Azure Speech の確定文ごとに、その区間の録音を MAI で認識し直して置き換える。途中経過は Azure Speech" },
  compare: { title: "比較（両方を並べる）", detail: "質問の整理は Azure Speech のまま。記録の下の「文字起こしの比較」に両方の結果と違いを出す" },
}

function Chip({ source }: { source: Source }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${source === "local" ? "bg-agm-warn/15 text-agm-warn" : source === "org" ? "bg-agm-accent/15 text-agm-accent" : "bg-agm-raised text-agm-muted"}`}>{SOURCE_LABEL[source]}</span>
}

function Field({ label, source, children }: { label: string; source: Source; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[10rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5">
      <span className="text-sm text-agm-muted">{label}</span>
      <span className="min-w-0">{children}</span>
      <Chip source={source} />
    </label>
  )
}

const select = "h-9 w-full rounded-md border border-agm-line bg-agm-bg px-2 text-sm outline-none focus:border-agm-accent disabled:opacity-50"

/** 設定（文字起こしの接続先・回答案と株主照合の AI モデル）。「既定にする」で組織の既定、「この端末だけで試す」でブラウザに保存 */
export function SettingsView({ readOnly }: { readOnly?: boolean }) {
  const { settings, org, local, config, configError, orgError, orgLoaded } = useSettings()
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string }>()
  useEffect(() => setDraft(settings), [settings])

  const patch = <K extends keyof AppSettings>(section: K, values: Partial<AppSettings[K]>) => setDraft((d) => ({ ...d, [section]: { ...d[section], ...values } }))
  const changed = JSON.stringify(draft) !== JSON.stringify(settings)
  /** 下書きと「組織の既定」の差分だけを、この端末の変更として残す */
  const localPatch = (): SettingsPatch => {
    const out: Record<string, Record<string, unknown>> = {}
    for (const section of Object.keys(draft) as (keyof AppSettings)[]) {
      const orgSection = (org[section] ?? {}) as Record<string, unknown>
      for (const [k, v] of Object.entries(draft[section])) if (orgSection[k] !== v) (out[section] ??= {})[k] = v
    }
    return out as SettingsPatch
  }
  const srcOf = (section: keyof AppSettings, key: string) => (changed && JSON.stringify((draft[section] as Record<string, unknown>)[key]) !== JSON.stringify((settings[section] as Record<string, unknown>)[key]) ? "local" : sourceOf(section, key, org, local))

  const maiEndpoints = (config?.stt ?? []).filter((e) => e.models.some((m) => m.startsWith("MAI")))
  const endpoint = maiEndpoints.find((e) => e.id === draft.stt.endpointId)
  const outsideJapan = endpoint && !/^japan/.test(endpoint.region)

  const saveDefault = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      await saveOrgDefault(draft)
      setMessage({ tone: "ok", text: "組織の既定にしました（全員の次の操作から効きます）" })
    } catch (e) {
      setMessage({ tone: "danger", text: `${errorText(e)}（既定を変えるにはロール「AGM オペレーター」が必要です）` })
    } finally {
      setBusy(false)
    }
  }

  const modelSection = (key: "answer" | "identify", title: string, icon: React.ReactNode, hint: string) => {
    const limit = config?.limits[key]
    return (
      <section className="rounded-xl border border-agm-line bg-agm-panel p-4" data-testid={`settings-${key}`}>
        <h3 className="mb-1 flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </h3>
        <p className="mb-2 text-xs text-agm-muted">{hint}</p>
        <Field label="モデル（デプロイ）" source={srcOf(key, "deployment")}>
          <select className={select} value={draft[key].deployment} disabled={readOnly || !config} onChange={(e) => patch(key, { deployment: e.target.value })} data-testid={`${key}-deployment`}>
            {(config?.deployments ?? [draft[key].deployment]).map((d) => (
              <option key={d} value={d}>
                {d}
                {d === config?.defaultDeployment ? "（Function の既定）" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="推論の強さ" source={srcOf(key, "reasoningEffort")}>
          <select className={select} value={draft[key].reasoningEffort} disabled={readOnly || !config || /^gpt-4/.test(draft[key].deployment)} onChange={(e) => patch(key, { reasoningEffort: e.target.value })}>
            {(config?.efforts ?? ["none"]).map((e) => (
              <option key={e} value={e}>
                {e}
                {e === "none" ? "（最速・既定）" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="最大トークン" source={srcOf(key, "maxTokens")}>
          <span className="flex items-center gap-3">
            <input type="range" min={limit?.min ?? 100} max={limit?.max ?? 2000} step={50} value={draft[key].maxTokens} disabled={readOnly} onChange={(e) => patch(key, { maxTokens: Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--agm-accent)]" />
            <span className="w-14 text-right font-mono text-sm tabular-nums">{draft[key].maxTokens}</span>
          </span>
        </Field>
      </section>
    )
  }

  return (
    <div className="agm-scroll flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3" data-testid="settings-view">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-agm-line bg-agm-panel px-4 py-3">
        <h2 className="text-base font-bold">設定</h2>
        <span className="text-xs text-agm-muted">効く順: アプリの初期値 ← 組織の既定（Dataverse）← この端末だけ</span>
        {!orgLoaded && <Loader2 className="size-4 animate-spin text-agm-muted" aria-label="読み込み中" />}
        {(configError || orgError) && (
          <span className="flex items-center gap-1 text-xs text-agm-warn">
            <AlertTriangle className="size-3.5" aria-hidden />
            {configError ? `選べる値を取得できません（${configError}）` : `組織の既定を読めません（${orgError}）`}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" disabled={readOnly || !Object.keys(local).length} onClick={() => clearLocalSettings()} className="flex h-9 items-center gap-1 rounded-md border border-agm-line px-3 text-sm text-agm-muted hover:text-agm-ink disabled:opacity-40" data-testid="settings-clear-local">
            <RotateCcw className="size-4" aria-hidden />
            この端末の変更を戻す
          </button>
          <button type="button" disabled={readOnly || !changed} onClick={() => setLocalSettings(localPatch())} className="flex h-9 items-center gap-1 rounded-md border border-agm-warn px-3 text-sm text-agm-warn disabled:opacity-40" data-testid="settings-try-local">
            この端末だけで試す
          </button>
          <button type="button" disabled={readOnly || busy} onClick={() => void saveDefault()} className="flex h-9 items-center gap-1 rounded-md bg-agm-accent px-3 text-sm font-semibold text-agm-bg disabled:opacity-40" data-testid="settings-save-default">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            このモデル・設定を既定にする
          </button>
        </div>
        {message && (
          <p className={`w-full text-sm ${message.tone === "ok" ? "text-agm-ok" : "text-agm-danger"}`} data-testid="settings-message">
            {message.tone === "ok" && <CheckCircle2 className="mr-1 inline size-4" aria-hidden />}
            {message.text}
          </p>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="rounded-xl border border-agm-line bg-agm-panel p-4 xl:row-span-2" data-testid="settings-stt">
          <h3 className="mb-1 flex items-center gap-2 font-semibold">
            <Mic className="size-4 text-agm-accent" aria-hidden />
            文字起こし
          </h3>
          <p className="mb-3 text-xs text-agm-muted">リアルタイムの区切り・途中経過は Azure Speech（{config?.realtime.region || "東日本"}）。MAI-Transcribe は確定文ごとに認識し直します。</p>
          <div className="mb-2 grid gap-2" role="radiogroup" aria-label="文字起こしの方式">
            {(Object.keys(ENGINE_LABEL) as SttEngine[]).map((engine) => (
              <label key={engine} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${draft.stt.engine === engine ? "border-agm-accent bg-agm-accent/5" : "border-agm-line"}`}>
                <input type="radio" name="stt-engine" checked={draft.stt.engine === engine} disabled={readOnly} onChange={() => patch("stt", { engine })} className="mt-1 accent-[var(--agm-accent)]" data-testid={`engine-${engine}`} />
                <span>
                  <span className="block text-sm font-semibold">{ENGINE_LABEL[engine].title}</span>
                  <span className="block text-xs text-agm-muted">{ENGINE_LABEL[engine].detail}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Chip source={srcOf("stt", "engine")} />
          </div>
          <div className={draft.stt.engine === "azure" ? "opacity-50" : ""}>
            <Field label="MAI の接続先" source={srcOf("stt", "endpointId")}>
              <select className={select} value={draft.stt.endpointId} disabled={readOnly || !maiEndpoints.length} onChange={(e) => patch("stt", { endpointId: e.target.value })} data-testid="stt-endpoint">
                {maiEndpoints.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
                {!maiEndpoints.length && <option value={draft.stt.endpointId}>（Function に MAI の接続先がありません）</option>}
              </select>
            </Field>
            <Field label="モデル" source={srcOf("stt", "model")}>
              <select className={select} value={draft.stt.model} disabled={readOnly || !endpoint} onChange={(e) => patch("stt", { model: e.target.value })} data-testid="stt-model">
                {(endpoint?.models ?? [draft.stt.model]).filter((m) => m !== "fast").map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="書き起こしの形" source={srcOf("stt", "style")}>
              <select className={select} value={draft.stt.style} disabled={readOnly} onChange={(e) => patch("stt", { style: e.target.value as "verbatim" | "clean" })}>
                <option value="verbatim">そのまま（言いよどみも残す・記録向け）</option>
                <option value="clean">読みやすく（言いよどみを除く）</option>
              </select>
            </Field>
            <Field label="キーワード" source={srcOf("stt", "phrases")}>
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.stt.phrases} disabled={readOnly} onChange={(e) => patch("stt", { phrases: e.target.checked })} className="accent-[var(--agm-accent)]" />
                想定問答のキーワードを渡す（上位 100 語。MAI の上限は 200 未満）
              </span>
            </Field>
            {outsideJapan && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md bg-agm-warn/10 px-3 py-2 text-xs text-agm-warn" data-testid="stt-residency">
                <Globe2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                MAI-Transcribe は日本のリージョンでは提供されていないため、確定文の録音は {endpoint.region} で処理されます（保存はされません）。社内の規程で国外処理が認められているか確認してください。
              </p>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-agm-line p-3" data-testid="stt-eval">
            <h4 className="mb-1 text-xs font-semibold text-agm-muted">参考: 台本の音声での比較（{Math.round(sttEval.audioSec)} 秒・Windows の読み上げ・`scripts/test/compare-stt.mjs`）</h4>
            <table className="w-full text-xs">
              <thead className="text-left text-agm-muted">
                <tr>
                  <th className="py-1 font-medium">方式</th>
                  <th className="py-1 text-right font-medium">文字誤り率</th>
                  <th className="py-1 text-right font-medium">株主番号</th>
                  <th className="py-1 text-right font-medium">数値</th>
                  <th className="py-1 pl-3 font-medium">応答</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(sttEval.rows as Record<string, { cer: number; numbers: string; claims: string; ms: number; note?: string }>).map(([name, r]) => (
                  <tr key={name} className="border-t border-agm-line/60">
                    <td className="py-1">{name}</td>
                    <td className="py-1 text-right font-mono tabular-nums">{(r.cer * 100).toFixed(1)}%</td>
                    <td className="py-1 text-right font-mono">{r.numbers}</td>
                    <td className="py-1 text-right font-mono">{r.claims}</td>
                    <td className="py-1 pl-3 text-agm-muted">{r.note ?? `${(r.ms / 1000).toFixed(1)} 秒`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] leading-5 text-agm-muted">MAI は「役員報酬 3.84 億円」を正しく取れた一方、「キャッシュ創出」を「キャッシュ喪失」と取り違えた行があります。意味が変わる誤りもあるため、本番前は比較モードで両方を確かめてください。</p>
          </div>
        </section>
        {modelSection("answer", "回答案・要約の AI", <Sparkles className="size-4 text-agm-accent" aria-hidden />, "質問カードごとの回答案と、想定問答の検索での要約を作るモデル。")}
        {modelSection("identify", "株主の照合の AI", <UserSearch className="size-4 text-agm-accent" aria-hidden />, "名乗りと株主名簿の候補から株主を選ぶモデル（構造化出力）。")}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-agm-muted">
        <Cpu className="size-3.5" aria-hidden />
        選べるモデル・接続先は Function のアプリ設定（AOAI_DEPLOYMENTS / STT_ENDPOINTS）で決まります。増やすときは `scripts/configure_azure.py` で設定します。
      </p>
    </div>
  )
}

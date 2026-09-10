import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, FileJson, Loader2, RefreshCw, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { designDiff, MAX_DESIGN_BYTES, type PlantDesign } from "@/data/plant-design"
import type { DesignRevision } from "@/data/plant-design-store"
import { PLANT_DESIGN_COPILOT_ENVIRONMENT, PLANT_DESIGN_COPILOT_SCHEMA } from "@/lib/plant-agent-config"
import { buildDesignCopilotRequest, designCopilotUrl, reviewDesignCopilotCandidate, type DesignCopilotRequest } from "@/lib/plant-design-copilot"
import { confirmDesignPlan, DESIGN_WIZARD_STEPS, initialDesignBrief, validateDesignBrief, type DesignBrief, type DesignPlanResult } from "@/lib/plant-design-assistant"
import "./plant-design-wizard.css"

type Field = { key: keyof DesignBrief; label: string; placeholder: string; rows?: number }

const STEP_FIELDS: Record<string, Field[]> = {
  limits: [
    { key: "exclusions", label: "使用できない区域", placeholder: "例: 北側 6 m は搬入道路。南東の角は既設受電設備のため使用不可。", rows: 3 },
    { key: "regulations", label: "法規・安全上の条件", placeholder: "例: 危険物貯槽は境界から 10 m 以上離す。防油堤の設置が必要。", rows: 3 },
  ],
  goal: [
    { key: "goal", label: "つくりたいプラント", placeholder: "例: 工業用水を受け入れて前処理し、製品タンクへ送る小規模な処理設備。", rows: 3 },
    { key: "capacity", label: "規模・処理量", placeholder: "例: 処理量 45 m3/h、将来 1.5 倍まで増設できる余地を残す。", rows: 2 },
    { key: "priorities", label: "重視する点", placeholder: "例: 点検動線の確保を最優先。配管長は短く、動力盤はポンプの近くに置く。", rows: 3 },
  ],
}

export function PlantDesignWizard({ design, designId, base, onShowProposals, onClose, onApply }: {
  design: PlantDesign
  designId: string
  base: DesignRevision | null
  onShowProposals: () => Promise<void>
  onClose: () => void
  onApply: (next: PlantDesign, notes: string) => void
}) {
  const [step, setStep] = useState(0)
  const [brief, setBrief] = useState<DesignBrief>(() => initialDesignBrief(design))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<DesignPlanResult | null>(null)
  const [reply, setReply] = useState("")
  const [basis, setBasis] = useState("")
  const [request, setRequest] = useState<DesignCopilotRequest | null>(null)
  const [notice, setNotice] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const current = DESIGN_WIZARD_STEPS[step]
  const inputErrors = validateDesignBrief(brief)
  const stale = !!result && basis !== JSON.stringify(design)
  const requestStale = !!request && request.basis !== JSON.stringify(design)
  const chatUrl = designCopilotUrl(PLANT_DESIGN_COPILOT_ENVIRONMENT, PLANT_DESIGN_COPILOT_SCHEMA)
  const patch = (key: keyof DesignBrief, value: string | number) => { setBrief((previous) => ({ ...previous, [key]: value })); setResult(null); setRequest(null); setReply(""); setNotice(""); setError("") }

  const prepare = async () => {
    if (pending.current || inputErrors.length || !brief.goal.trim()) return
    pending.current = true
    setLoading(true); setError(""); setResult(null); setRequest(null); setReply(""); setNotice("")
    try {
      const prepared = await buildDesignCopilotRequest(design, brief, designId, base)
      if (!active.current) return
      setBasis(prepared.basis)
      setRequest(prepared)
    } catch (caught) {
      if (active.current) setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      pending.current = false
      if (active.current) setLoading(false)
    }
  }

  const importCandidate = (text: string) => {
    setReply(text); setResult(null); setError("")
    try {
      if (!request || request.basis !== JSON.stringify(design)) throw new Error("依頼の基準が変更されています。依頼を作成し直してください。")
      setResult(reviewDesignCopilotCandidate(design, text, brief))
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
  }

  const showProposals = async () => {
    if (pending.current) return
    pending.current = true; setLoading(true); setError("")
    try { await onShowProposals() }
    catch (caught) { if (active.current) setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { pending.current = false; if (active.current) setLoading(false) }
  }

  const copyRequest = async () => {
    try {
      if (!request || requestStale || !navigator.clipboard) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(request.prompt)
      if (active.current) { setError(""); setNotice("依頼文をコピーしました。チャットへの送信は未実行です。") }
    } catch { if (active.current) setError("コピーできませんでした。依頼文を選択してコピーしてください。") }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !pending.current) onClose() }}>
    <DialogContent className="plant-design-wizard sm:max-w-3xl max-h-[90dvh] overflow-y-auto" onEscapeKeyDown={(event) => { if (pending.current) event.preventDefault() }} onInteractOutside={(event) => { if (pending.current) event.preventDefault() }}>
      <DialogHeader>
        <DialogTitle><Sparkles size={18} aria-hidden="true" />Plant Design Copilot</DialogTitle>
        <DialogDescription>{`ステップ ${step + 1} / ${DESIGN_WIZARD_STEPS.length}: ${current.title}`}</DialogDescription>
      </DialogHeader>
      <ol className="wizard-steps" aria-label="設計ステップ">
        {DESIGN_WIZARD_STEPS.map((entry, index) => <li key={entry.key} aria-current={index === step ? "step" : undefined} className={index < step ? "is-done" : index === step ? "is-current" : ""}>{entry.title}</li>)}
      </ol>

      {current.key === "site" && <div className="wizard-form">
        <label>敷地の名称<input value={brief.siteName} maxLength={200} onChange={(event) => patch("siteName", event.target.value)} placeholder="例: 第 2 工場 東側ヤード" /></label>
        <div className="wizard-row">
          <label>X 方向の広さ (m)<input type="number" min="10" max="400" step="any" value={Number.isFinite(brief.siteWidth) ? brief.siteWidth : ""} onChange={(event) => patch("siteWidth", event.target.valueAsNumber)} /></label>
          <label>Z 方向の広さ (m)<input type="number" min="10" max="400" step="any" value={Number.isFinite(brief.siteDepth) ? brief.siteDepth : ""} onChange={(event) => patch("siteDepth", event.target.valueAsNumber)} /></label>
          <label>ユニット間余白 (m)<input type="number" min="0" max="10" step="any" value={Number.isFinite(brief.clearance) ? brief.clearance : ""} onChange={(event) => patch("clearance", event.target.valueAsNumber)} /></label>
        </div>
        <label>搬入・アクセス・方位<textarea rows={3} maxLength={1000} value={brief.access} onChange={(event) => patch("access", event.target.value)} placeholder="例: 北辺に幅 6 m の搬入路。南が正面、既設の受電設備は西側にある。" /></label>
        {inputErrors.map((message) => <p key={message} role="alert" className="wizard-error">{message}</p>)}
      </div>}

      {(current.key === "limits" || current.key === "goal") && <div className="wizard-form">
        {STEP_FIELDS[current.key].map((field) => <label key={field.key}>{field.label}
          <textarea rows={field.rows ?? 3} required={field.key === "goal"} maxLength={1000} value={String(brief[field.key])} onChange={(event) => patch(field.key, event.target.value)} placeholder={field.placeholder} />
        </label>)}
      </div>}

      {current.key === "generate" && <div className="wizard-form">
        <ul className="wizard-summary">
          <li><strong>敷地</strong><span>{brief.siteName || "未設定"} / {brief.siteWidth} × {brief.siteDepth} m / 余白 {brief.clearance} m</span></li>
          <li><strong>アクセス</strong>{brief.access || "指定なし"}</li>
          <li><strong>制約</strong>{[brief.exclusions, brief.regulations].filter(Boolean).join(" / ") || "指定なし"}</li>
          <li><strong>ゴール</strong>{[brief.goal, brief.capacity, brief.priorities].filter(Boolean).join(" / ") || "指定なし"}</li>
        </ul>
        <div className="wizard-actions">
          <Button disabled={loading || !!inputErrors.length || !brief.goal.trim()} onClick={() => void prepare()}>{loading ? <Loader2 className="animate-spin" /> : <FileJson />}{request ? "依頼を作成し直す" : "依頼を作成"}</Button>
          <Button variant="outline" asChild><a href={chatUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />公開チャットを開く</a></Button>
        </div>
        {request && <>
          <p role="status" className="wizard-note">{request.mode === "shared" ? `共有設計 / 基準 Rev.${base?.revision} / 提案の採用待ち` : "未保存の下書き / 提案登録なし"} / 未送信</p>
          <details className="wizard-prompt" open><summary>依頼文</summary><textarea readOnly aria-label="Plant Design Copilot への依頼文" rows={6} value={request.prompt} /></details>
          <Button variant="outline" disabled={loading || requestStale} onClick={() => void copyRequest()}><Copy />依頼文をコピー</Button>
          <label>候補 JSON / エージェントの応答<textarea aria-label="候補 JSON" rows={5} maxLength={MAX_DESIGN_BYTES} value={reply} onChange={(event) => { setReply(event.target.value); setResult(null); setError("") }} /></label>
          <div className="wizard-actions">
            <Button variant="outline" disabled={loading || requestStale || !reply.trim()} onClick={() => importCandidate(reply)}><Check />候補を検証</Button>
            <Button variant="outline" disabled={loading || requestStale} onClick={() => fileInput.current?.click()}><FileJson />候補 JSON を読み込む</Button>
          </div>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ""
            if (!file) return
            if (file.size > MAX_DESIGN_BYTES) { setError("候補ファイルは 500 KB 以下にしてください。"); return }
            void file.text().then((text) => { if (active.current) importCandidate(text) }).catch(() => { if (active.current) setError("候補ファイルを読み込めませんでした。") })
          }} />
        </>}
        {!!designId && <Button variant="outline" disabled={loading} onClick={() => void showProposals()}><RefreshCw />Dataverse の提案を取得</Button>}
        {!!notice && <p role="status" className="wizard-note">{notice}</p>}
        {error && <p role="alert" className="wizard-error">{error}</p>}
        {requestStale && <p role="alert" className="wizard-error">元の設計が変更されました。依頼を作成し直してください。</p>}
        {stale && <p role="alert" className="wizard-error">元の設計が変更されました。もう一度生成してください。</p>}
        {!!reply && !result && !loading && <details className="wizard-prompt"><summary>AI の応答を確認する</summary><pre>{reply}</pre></details>}
        {result && <section className="wizard-result" aria-label="生成された配置案">
          <h3>{result.design.name}</h3>
          {result.notes && <p>{result.notes}</p>}
          <p>{result.design.units.length} ユニット / {result.design.connections.length} 接続</p>
          <h4>編集中の設計との差分</h4>
          <ul>{designDiff(design, result.design).slice(0, 20).map((change, index) => <li key={index}>{change}</li>)}</ul>
          <h4>設計チェック</h4>
          {result.issues.length
            ? <ul className="wizard-issues">{result.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>
            : <p className="wizard-ok">形状・配置・接続: 適合</p>}
          <p className="wizard-note">概念設計 / 法規・処理能力・耐震・防爆・3D 干渉は未評価</p>
        </section>}
      </div>}

      <div className="wizard-actions">
        <Button variant="outline" disabled={loading || step === 0} onClick={() => { setStep(step - 1); setError("") }}><ArrowLeft />戻る</Button>
        {step < DESIGN_WIZARD_STEPS.length - 1
          ? <Button disabled={!!inputErrors.length || (current.key === "goal" && !brief.goal.trim())} onClick={() => setStep(step + 1)}>次へ<ArrowRight /></Button>
          : <Button disabled={loading || !result || !!result.issues.length || stale} onClick={() => {
            if (!result) return
            try { onApply(confirmDesignPlan(design, basis, result), result.notes) }
            catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
          }}><Check />変更を比較</Button>}
        <Button variant="ghost" disabled={loading} onClick={onClose}><X />閉じる</Button>
      </div>
    </DialogContent>
  </Dialog>
}

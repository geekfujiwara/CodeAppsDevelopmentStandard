import { Activity, CircleCheck, Clock3, LoaderCircle, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { plantProgressLabel, type PlantAgentProgress as Progress } from "@/lib/plant-agent-progress"
import { waitPlanStep, type PlantWaitPlan } from "@/lib/plant-agent-wait-plan"
import "./plant-agent-progress.css"

export function PlantAgentProgress({ progress, elapsed, loading, workflow, waitPlan, onCancel }: {
  progress?: Progress
  elapsed: number
  loading: boolean
  workflow: boolean
  waitPlan?: PlantWaitPlan
  onCancel: () => void
}) {
  const completed = progress?.status === "succeeded"
  const stepIndex = waitPlan ? waitPlanStep(waitPlan, elapsed) : 0
  const step = waitPlan?.steps[stepIndex]
  return <section className="plant-agent-progress" aria-label="最新の要求の実行状況">
    <div className="plant-progress-heading">
      {completed ? <CircleCheck size={16} aria-hidden="true" /> : <Activity size={16} aria-hidden="true" />}
      <strong role="status">{!loading && !completed ? "待機終了・最後に確認した状態" : workflow ? plantProgressLabel(progress) : "エージェントの応答待ち"}</strong>
      {loading && <Button variant="ghost" size="icon" title="応答待機を取り消す" aria-label="応答待機を取り消す" onClick={onCancel}><Square size={14} /></Button>}
    </div>
    <div className="plant-progress-time"><Clock3 size={13} aria-hidden="true" /><span>今回の待機 {elapsed}秒</span>
      {progress && <span>状態確認 {new Date(progress.checkedAt).toLocaleTimeString("ja-JP", { hour12: false })}</span>}
    </div>
    {loading && !completed && !progress?.needsReconciliation && waitPlan && step && <div className="plant-wait-plan" aria-label="処理の流れ">
      <div className="plant-wait-plan-caption"><strong>処理の流れ · {waitPlan.title}</strong></div>
      <div className="plant-wait-plan-track" aria-hidden="true">{waitPlan.steps.map((item, index) => <span key={item.title} data-highlighted={index === stepIndex} />)}</div>
      <div className="plant-wait-plan-step"><LoaderCircle size={18} aria-hidden="true" /><div key={stepIndex} className="plant-wait-plan-content"><strong>{step.title}</strong><span>{step.service}{step.tool && <> · <code>{step.tool}</code></>}</span></div></div>
    </div>}
    {loading && elapsed >= 90 && <p>回答に時間がかかっています。経過時間は進捗率を示しません。</p>}
    <details>
      <summary>処理状況の詳細</summary>
      {progress && <><p>{plantProgressLabel(progress)}</p><p>受付ID: <code>{progress.requestId}</code></p></>}
      {waitPlan && <>
        <p>処理の流れとツール名は、質問に応じて事前に設定した想定を経過時間に合わせて表示しています。実際の呼び出し・開始・完了を示す実行ログではありません。</p>
        <ol>{waitPlan.steps.map(item => <li key={item.title}><span>{item.title}</span><small> · {item.service}{item.tool && <> · <code>{item.tool}</code></>}</small></li>)}</ol>
      </>}
      <p>MCP・ツール実行履歴: 未取得</p>
      <p>個別ツールの開始・完了は現在の応答APIから取得できていません。</p>
      {progress?.needsReconciliation && <p>サーバーの実行結果に追加確認が必要です。この要求は自動再送しません。</p>}
      {!loading && !completed && <p>表示は最後の確認時点です。サーバー側の処理は継続している場合があります。</p>}
    </details>
  </section>
}
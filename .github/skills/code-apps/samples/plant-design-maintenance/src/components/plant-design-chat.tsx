import { useEffect, useRef, useState } from "react"
import { Box, Check, Clock3, Crosshair, Loader2, RefreshCw, Send, Sparkles, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownText } from "@/components/markdown-text"
import type { PlantDesign } from "@/data/plant-design"
import { DESIGN_STARTERS, DESIGN_REPLY_GROUPS, DESIGN_SELECTION_REPLIES, designChatPrompt, applyDesignChatReply, assertDesignChatScope, type DesignChatSelection, type DesignChatTurn } from "@/lib/plant-design-chat"
import { getPlantAgentContext } from "@/lib/plant-agent-client"
import { PlantConversationTerminalError, submitPlantConversation, waitForPlantConversation, type PlantConversationReceipt, type PlantConversationTransport } from "@/lib/plant-conversation-job"
import { PLANT_CONVERSATION_ENABLED, plantConversationTransport } from "@/lib/plant-conversation-repository"
import "./plant-agent-panel.css"
import "./plant-design-chat.css"

type PendingTurn = { receipt: PlantConversationReceipt; principalKey: string; editVersion: number; selection: DesignChatSelection | null }
export function PlantDesignChat({ design, editVersion, selection = null, onApply, onClose, onManual, blocked, transport = plantConversationTransport,
  enabled = PLANT_CONVERSATION_ENABLED }: {
  design: PlantDesign
  editVersion: number
  selection?: DesignChatSelection | null
  onApply: (next: PlantDesign, basis: string) => void
  onClose: () => void
  onManual: () => void
  blocked?: boolean
  transport?: PlantConversationTransport
  enabled?: boolean
}) {
  const [messages, setMessages] = useState<DesignChatTurn[]>([])
  const [input, setInput] = useState("")
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingTurn | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [category, setCategory] = useState("layout")
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [workingOn, setWorkingOn] = useState({ label: "設計全体", units: 0, connections: 0 })
  const session = useRef({ id: crypto.randomUUID(), version: 0 })
  const current = useRef({ design, editVersion, selection, blocked, onApply })
  current.current = { design, editVersion, selection, blocked, onApply }
  const active = useRef<AbortController | null>(null)
  const submitting = useRef(false)
  const mounted = useRef(true)
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort() } }, [])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [messages, status])
  useEffect(() => {
    if (!busy || startedAt === null) return
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [busy, startedAt])

  const receive = async (turn: PendingTurn) => {
    const controller = new AbortController()
    active.current = controller
    const basis = turn.receipt.scope.basis
    const reply = await waitForPlantConversation(transport, turn.receipt, {
      signal: controller.signal,
      isCurrent: () => mounted.current,
      onStatus: (value) => setStatus({ pending: "受付済み", running: "生成中", succeeded: "検証中", failed: "実行失敗", cancelled: "実行取消済み" }[value]),
    })
    const identity = await getPlantAgentContext()
    controller.signal.throwIfAborted()
    if (!mounted.current || identity.principalKey !== turn.principalKey) throw new Error("利用者が変更されました。")
    setPending(null)
    assertDesignChatScope(turn.receipt.scope.selection, current.current.selection)
    if (current.current.blocked || current.current.editVersion !== turn.editVersion || JSON.stringify(current.current.design) !== basis) {
      throw new Error("要求後に設計が編集されたため、結果は反映しません。")
    }
    if (/```|^\s*\{/.test(reply)) {
      const next = applyDesignChatReply(current.current.design, basis, reply, turn.selection)
      current.current.onApply(next, basis)
      setMessages((previous) => [...previous, { role: "assistant", text: "配置案を作成しました。変更前後を比較して確定してください。" }])
      setStatus("確定待ち")
    } else {
      if (JSON.stringify(current.current.design) !== basis) throw new Error("設計が変更されたため、回答は反映しません。")
      setMessages((previous) => [...previous, { role: "assistant", text: reply }])
      setStatus("回答済み")
    }
  }

  const run = async (text?: string, targeted = category === "selected") => {
    if (submitting.current || !enabled || blocked || uncertain || (text !== undefined && pending)) return
    if (text !== undefined && targeted && !current.current.selection) return
    submitting.current = true
    setBusy(true); setError("")
    let submitted = false
    try {
      if (text === undefined) {
        if (pending) await receive(pending)
        return
      }
      const snapshot = current.current.design
      const snapshotVersion = current.current.editVersion
      const target = targeted ? current.current.selection : null
      setStartedAt(Date.now()); setElapsed(0); setStatus("準備中")
      setWorkingOn({ label: target?.label ?? "設計全体", units: snapshot.units.length, connections: snapshot.connections.length })
      const request = await designChatPrompt(snapshot, text, messages, target)
      const context = await getPlantAgentContext()
      assertDesignChatScope(request.selection, current.current.selection)
      if (!mounted.current || current.current.blocked || current.current.editVersion !== snapshotVersion || JSON.stringify(current.current.design) !== request.basis) throw new Error("設計が変更されました。")
      setMessages((previous) => [...previous, { role: "user", text: target ? `${target.label}\n${text}` : text }]); setInput(""); setStatus("送信中")
      submitted = true
      const receipt = await submitPlantConversation(transport, {
        conversationId: session.current.id, turnId: crypto.randomUUID(), version: ++session.current.version,
        operation: "plant-design", basis: request.basis, selection: request.selection, prompt: request.prompt,
      })
      submitted = false
      if (!mounted.current) return
      const turn = { receipt, principalKey: context.principalKey, editVersion: snapshotVersion, selection: target }
      setPending(turn)
      await receive(turn)
    } catch (caught) {
      if (mounted.current) {
        if (caught instanceof PlantConversationTerminalError) setPending(null)
        if (submitted) setUncertain(true)
        setError(caught instanceof Error ? caught.message : "応答を確認できません。")
        setStatus("未反映")
      }
    } finally {
      submitting.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const locked = !enabled || !!blocked || busy || !!pending || uncertain
  const selectedMode = category === "selected"
  const replies = selectedMode ? DESIGN_SELECTION_REPLIES : DESIGN_REPLY_GROUPS.find((group) => group.id === category)!.replies
  const stage = status === "検証中" ? 3 : status === "生成中" ? 2 : status === "受付済み" ? 1 : 0
  return <section className="agent-panel design-chat" aria-label="設計チャット">
    <header className="agent-panel-header"><Sparkles size={18} /><div className="min-w-0 flex-1"><h3>Plant Design Copilot</h3><p>{design.name}</p></div>
      <Button size="icon" variant="ghost" title="設計チャットを閉じる" aria-label="設計チャットを閉じる" disabled={busy || !!pending || uncertain} onClick={onClose}><X size={16} /></Button>
    </header>
    <div className="agent-panel-messages" role="log" aria-label="設計会話履歴" ref={log} aria-live="polite">
      {!enabled && <p className="agent-panel-empty">Workflow 接続・利用者権限の受入待ち</p>}
      {messages.map((message, index) => <div className={`agent-bubble agent-bubble-${message.role}`} key={index}><MarkdownText text={message.text} /></div>)}
      {!messages.length && <div className="design-chat-starters">{DESIGN_STARTERS.map((starter) => <button key={starter.id} disabled={locked} onClick={() => void run(starter.text, false)}><Sparkles size={16} /><span>{starter.title}</span></button>)}</div>}
    </div>
    {busy && <div className="design-chat-progress" aria-label="設計処理の進捗">
      <div className="design-chat-progress-heading"><Sparkles size={16} /><strong>{workingOn.label}</strong><span className="design-chat-elapsed" aria-live="off"><Clock3 size={13} />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></div>
      <div className="design-chat-progress-facts"><Box size={13} />{workingOn.units} ユニット<span>{workingOn.connections} 接続</span></div>
      <ol className="design-chat-stages">{["送信", "受付", "生成", "検証"].map((label, index) => <li key={label} data-state={index < stage ? "done" : index === stage ? "active" : "waiting"} aria-current={index === stage ? "step" : undefined}>{index < stage ? <Check size={13} /> : index === stage ? <Loader2 className="design-chat-spinner" size={13} /> : <span className="design-chat-stage-number">{index + 1}</span>}{label}</li>)}</ol>
      <div className="design-chat-activity" aria-hidden="true"><span /></div>
      {elapsed >= 60 && <p className="design-chat-long-wait">{elapsed >= 180 ? "応答待ちが続いています。要求は再送していません。" : "生成結果を待っています。下書きはまだ変更していません。"}</p>}
    </div>}
    {status && <div className="design-chat-status" role="status">{busy && <Loader2 className="animate-spin" size={14} />}{status}
      {busy && pending && <Button size="icon" variant="ghost" title="結果の待機を停止" aria-label="結果の待機を停止" onClick={() => active.current?.abort(new Error("待機を停止しました。サーバーの実行は継続する場合があります。"))}><Square size={14} /></Button>}
    </div>}
    {error && <p className="agent-panel-error" role="alert">{error}</p>}
    {pending && !busy && <div className="design-chat-receipt"><span>要求 ID: {pending.receipt.requestId}</span><Button variant="outline" disabled={!!blocked || uncertain} onClick={() => void run()}><RefreshCw size={14} />同じ要求の結果を確認</Button></div>}
    <div className="design-chat-suggestions">
      <div className="design-chat-categories" role="radiogroup" aria-label="クイック返信のカテゴリ">
        {DESIGN_REPLY_GROUPS.map((group) => <button key={group.id} role="radio" aria-checked={category === group.id} onClick={() => setCategory(group.id)}>{group.title}</button>)}
        <button role="radio" aria-checked={selectedMode} disabled={!selection} onClick={() => setCategory("selected")}><Crosshair size={13} />選択対象</button>
      </div>
      <div className="design-chat-target"><Crosshair size={13} /><span>{selectedMode ? selection?.label ?? "対象未選択" : "設計全体"}</span></div>
      <div className="agent-quick-replies">{replies.map((reply) => <button key={reply.title} disabled={locked || (selectedMode && !selection)} title={reply.text} onClick={() => void run(reply.text)}>{reply.title}</button>)}</div>
    </div>
    <form className="agent-panel-input" onSubmit={(event) => { event.preventDefault(); if (!locked) void run(input.trim()) }}>
      <textarea aria-label="設計への依頼" placeholder={selectedMode ? "選択対象への依頼" : "設計全体への依頼"} maxLength={2000} rows={2} value={input} onChange={(event) => setInput(event.target.value)} />
      <Button type="submit" size="icon" disabled={locked || !input.trim() || (selectedMode && !selection)} title="送信" aria-label="設計への依頼を送信"><Send size={16} /></Button>
    </form>
    {!enabled && <Button variant="ghost" onClick={onManual}>手動受け渡し</Button>}
  </section>
}
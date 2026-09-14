import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import type { DrawingOperation, TurnRequest } from "@/conversation/conversation-contract"
import type { Proposal, TurnLogEntry, WorkspaceState } from "@/state/workspace"
import { ConversationContractError, acceptResult, assertNewTurn, describeRejection, nextTurnId, validateRequest } from "@/conversation/conversation-contract"
import { WorkspaceContext, type WorkspaceContextValue } from "@/state/workspace-context"
import { workspaceReducer } from "@/state/workspace"
import { loadWorkspace, saveWorkspace } from "@/state/workspace-storage"
import { hashDrawing, parseDrawing } from "@/drawing/drawing-schema"
import { createConversationTransport } from "@/services/drawing-backend"
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "@/config"

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, loadWorkspace)
  const [busyTurnId, setBusyTurnId] = useState<string | null>(null)

  // 非同期処理からは常に「いまの下書き」を見る（送信時点の値を閉じ込めない）
  const stateRef = useRef<WorkspaceState>(state)
  stateRef.current = state

  const timersRef = useRef(new Map<string, number>())
  const transport = useMemo(() => createConversationTransport(() => stateRef.current.drawing), [])

  useEffect(() => {
    saveWorkspace(state)
  }, [state])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) window.clearInterval(timer)
      timers.clear()
    }
  }, [])

  const stopWaiting = useCallback(
    (turnId: string) => {
      const timer = timersRef.current.get(turnId)
      if (timer !== undefined) {
        window.clearInterval(timer)
        timersRef.current.delete(turnId)
      }
      setBusyTurnId((current) => (current === turnId ? null : current))
      dispatch({
        type: "update-turn",
        turnId,
        patch: { status: "failed", error: "ローカルの待機を打ち切りました（リモート実行は取り消していません）", updatedAt: new Date().toISOString() },
      })
    },
    [dispatch],
  )

  const sendTurn = useCallback(
    async (operation: DrawingOperation, prompt: string) => {
      const current = stateRef.current
      if (busyTurnId) {
        toast.error("未解決の依頼があります。完了を待つか、待機を打ち切ってください。")
        return
      }

      const baseHash = hashDrawing(current.drawing)
      const turnId = nextTurnId(current.conversationId, current.turnCounter + 1)
      const request: TurnRequest = {
        conversationId: current.conversationId,
        turnId,
        version: current.version,
        baseHash,
        operation,
        prompt: prompt.trim(),
        selection: current.selectedAnnotationId,
        createdAt: new Date().toISOString(),
      }

      const issues = validateRequest(request, { version: current.version, baseHash })
      if (issues.length > 0) {
        toast.error(describeRejection(issues[0]))
        return
      }

      try {
        assertNewTurn(current.turns, turnId)
      } catch (error) {
        toast.error((error as ConversationContractError).message)
        return
      }

      const entry: TurnLogEntry = {
        turnId,
        conversationId: request.conversationId,
        operation,
        prompt: request.prompt,
        status: "pending",
        workerKind: transport.kind,
        version: request.version,
        baseHash,
        createdAt: request.createdAt,
        updatedAt: request.createdAt,
        summary: "",
        error: "",
        proposalId: null,
      }
      dispatch({ type: "record-turn", entry })
      setBusyTurnId(turnId)

      try {
        const receipt = await transport.submit(request)
        dispatch({ type: "update-turn", turnId, patch: { status: receipt.status, updatedAt: receipt.updatedAt } })
      } catch (error) {
        dispatch({ type: "update-turn", turnId, patch: { status: "failed", error: (error as Error).message, updatedAt: new Date().toISOString() } })
        setBusyTurnId(null)
        toast.error((error as Error).message)
        return
      }

      const startedAt = Date.now()
      const timer = window.setInterval(() => {
        void (async () => {
          try {
            const { receipt, result } = await transport.poll(request)
            if (!result) {
              dispatch({ type: "update-turn", turnId, patch: { status: receipt.status, updatedAt: receipt.updatedAt } })
              if (Date.now() - startedAt > POLL_TIMEOUT_MS) stopWaiting(turnId)
              return
            }

            window.clearInterval(timer)
            timersRef.current.delete(turnId)
            setBusyTurnId((value) => (value === turnId ? null : value))

            const live = stateRef.current
            const decision = acceptResult(request, result, { version: live.version, baseHash: hashDrawing(live.drawing) })
            if (!decision.accepted) {
              dispatch({ type: "update-turn", turnId, patch: { status: "failed", error: decision.message, updatedAt: result.completedAt } })
              toast.error(decision.message)
              return
            }

            if (result.status === "failed") {
              dispatch({ type: "update-turn", turnId, patch: { status: "failed", error: result.error ?? "ワーカーが失敗しました", updatedAt: result.completedAt } })
              toast.error(result.error ?? "ワーカーが失敗しました")
              return
            }

            let proposalId: string | null = null
            if (result.candidateJson) {
              try {
                parseDrawing(result.candidateJson)
                const proposal: Proposal = {
                  id: `prop-${turnId}`,
                  turnId,
                  conversationId: result.conversationId,
                  createdAt: result.completedAt,
                  summary: result.summary,
                  candidateJson: result.candidateJson,
                  baseHash: result.baseHash,
                  baseVersion: result.version,
                  status: "pending",
                  workerKind: result.workerKind,
                }
                dispatch({ type: "add-proposal", proposal })
                proposalId = proposal.id
              } catch (error) {
                dispatch({ type: "update-turn", turnId, patch: { status: "failed", error: (error as Error).message, updatedAt: result.completedAt } })
                toast.error("候補 JSON が検証に失敗しました。取り込みません。")
                return
              }
            }

            dispatch({ type: "update-turn", turnId, patch: { status: "completed", summary: result.summary, updatedAt: result.completedAt, proposalId } })
            toast.success(proposalId ? "候補が届きました。差分を確認してください。" : "応答が届きました。")
          } catch (error) {
            window.clearInterval(timer)
            timersRef.current.delete(turnId)
            setBusyTurnId((value) => (value === turnId ? null : value))
            dispatch({ type: "update-turn", turnId, patch: { status: "failed", error: (error as Error).message, updatedAt: new Date().toISOString() } })
            toast.error((error as Error).message)
          }
        })()
      }, POLL_INTERVAL_MS)
      timersRef.current.set(turnId, timer)
    },
    [busyTurnId, stopWaiting, transport],
  )

  const value = useMemo<WorkspaceContextValue>(
    () => ({ state, dispatch, transport, sendTurn, stopWaiting, busyTurnId }),
    [state, transport, sendTurn, stopWaiting, busyTurnId],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

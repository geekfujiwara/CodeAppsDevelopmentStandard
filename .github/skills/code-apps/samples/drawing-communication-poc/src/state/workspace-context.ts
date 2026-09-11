import { createContext, useContext, type Dispatch } from "react"
import type { ConversationTransport } from "@/conversation/conversation-transport"
import type { DrawingOperation } from "@/conversation/conversation-contract"
import type { WorkspaceAction, WorkspaceState } from "@/state/workspace"

export type WorkspaceContextValue = {
  state: WorkspaceState
  dispatch: Dispatch<WorkspaceAction>
  /** 会話ワーカー。UI は label / caution をそのまま表示する。 */
  transport: ConversationTransport
  sendTurn: (operation: DrawingOperation, prompt: string) => Promise<void>
  /** ローカルの待機だけを止める。リモート実行の取り消しではない。 */
  stopWaiting: (turnId: string) => void
  /** 未解決のターン。1 件でもあれば次の送信を止める。 */
  busyTurnId: string | null
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("useWorkspace は WorkspaceProvider の内側でのみ使えます")
  return value
}

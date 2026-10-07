import { createContext, useContext, useEffect } from "react"

export type FKeyDef = { key: number; label: string; action: () => void; disabled?: boolean }
export type MessageKind = "info" | "warn" | "error"

export type TerminalContextValue = {
  setFKeys: (defs: FKeyDef[]) => void
  setMessage: (text: string, kind?: MessageKind) => void
  openHelp: () => void
}

export const TerminalContext = createContext<TerminalContextValue | null>(null)

function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("TerminalContext がありません")
  return ctx
}

/** 画面のファンクションキーを登録する（毎回の描画で最新の処理に差し替える） */
export function useFunctionKeys(defs: FKeyDef[]): void {
  const { setFKeys } = useTerminal()
  useEffect(() => {
    setFKeys(defs)
  })
}

export function useMessage(): TerminalContextValue["setMessage"] {
  return useTerminal().setMessage
}

export function useHelp(): () => void {
  return useTerminal().openHelp
}

import { createContext, useContext } from "react"

export type GuideContextValue = {
  /** 使い方カルーセルを開く */
  openGuide: () => void
  /** 画面を実際に操作しながら案内するツアーを開始する */
  startTour: () => void
}

export const GuideContext = createContext<GuideContextValue | null>(null)

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext)
  if (!ctx) throw new Error("useGuide は GuideProvider の内側でのみ使えます")
  return ctx
}

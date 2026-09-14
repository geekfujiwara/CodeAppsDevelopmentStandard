import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { GUIDE_STORAGE_KEY } from "@/guide-config"
import { GuideContext, type GuideContextValue } from "@/components/guide/guide-context"
import { GuideDialog } from "@/components/guide/guide-dialog"
import { GuideTour } from "@/components/guide/guide-tour"

function readSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_STORAGE_KEY) === "1"
  } catch {
    return true // 使えない環境では「見た」扱いにして邪魔しない
  }
}

function writeSeen() {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, "1")
  } catch {
    // プライベートブラウズなどで localStorage が使えなくても機能は落とさない
  }
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const [isDialogOpen, setDialogOpen] = useState(false)
  const [isTourOpen, setTourOpen] = useState(false)

  useEffect(() => {
    if (!readSeen()) setDialogOpen(true)
  }, [])

  const openGuide = useCallback(() => setDialogOpen(true), [])

  const startTour = useCallback(() => {
    writeSeen()
    setDialogOpen(false)
    setTourOpen(true)
  }, [])

  const closeDialog = useCallback((open: boolean) => {
    if (!open) writeSeen()
    setDialogOpen(open)
  }, [])

  const value = useMemo<GuideContextValue>(() => ({ openGuide, startTour }), [openGuide, startTour])

  return (
    <GuideContext.Provider value={value}>
      {children}
      <GuideDialog open={isDialogOpen} onOpenChange={closeDialog} onStartTour={startTour} />
      <GuideTour open={isTourOpen} onClose={() => setTourOpen(false)} />
    </GuideContext.Provider>
  )
}

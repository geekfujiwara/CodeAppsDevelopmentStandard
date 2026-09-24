import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GUIDE_OPEN_EVENT, GUIDE_SLIDES, GUIDE_STORAGE_KEY } from "@/crm/guide"
import { cn } from "@/lib/utils"

export function CrmGuide() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(GUIDE_STORAGE_KEY) !== "1" } catch { return false }
  })
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const show = () => { setIndex(0); setOpen(true) }
    window.addEventListener(GUIDE_OPEN_EVENT, show)
    return () => window.removeEventListener(GUIDE_OPEN_EVENT, show)
  }, [])

  const close = (next: boolean) => {
    setOpen(next)
    if (!next) {
      try { localStorage.setItem(GUIDE_STORAGE_KEY, "1") } catch { /* ストレージ不可の環境では毎回表示 */ }
    }
  }

  const slide = GUIDE_SLIDES[index]
  const last = index === GUIDE_SLIDES.length - 1
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{slide.title}</DialogTitle>
          <DialogDescription className="min-h-20 leading-relaxed">{slide.body}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {GUIDE_SLIDES.map((s, i) => (
              <span key={s.title} className={cn("h-2 w-2 rounded-full", i === index ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              <ChevronLeft className="h-4 w-4" />戻る
            </Button>
            <Button size="sm" onClick={() => (last ? close(false) : setIndex(index + 1))}>
              {last ? "はじめる" : "次へ"}{!last && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

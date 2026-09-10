import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Check, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { GUIDE_SLIDES } from "@/guide-config"
import { cn } from "@/lib/utils"

type GuideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartTour: () => void
}

export function GuideDialog({ open, onOpenChange, onStartTour }: GuideDialogProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  const slide = GUIDE_SLIDES[index]
  const isLast = index === GUIDE_SLIDES.length - 1
  const Icon = slide.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <div className="bg-gradient-to-br from-primary/90 via-primary to-primary/70 px-6 py-7 text-primary-foreground">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-widest opacity-80">
                使い方 {index + 1} / {GUIDE_SLIDES.length}
              </p>
              <DialogTitle className="mt-1 text-xl [overflow-wrap:anywhere]">{slide.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="mt-4 text-sm leading-6 text-primary-foreground/90 [overflow-wrap:anywhere]">
            {slide.lead}
          </DialogDescription>
        </div>

        <div className="px-6 pt-5">
          <ul className="space-y-3">
            {slide.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm leading-6">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                <span className="[overflow-wrap:anywhere]">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2" aria-label="スライド位置">
            {GUIDE_SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`${i + 1} 枚目: ${s.title}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  i === index ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft className="mr-1 h-4 w-4" />戻る
            </Button>
            {isLast ? (
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                閉じる
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIndex((i) => i + 1)}>
                次へ<ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            <Button size="sm" onClick={onStartTour}>
              <PlayCircle className="mr-1 h-4 w-4" />使い方を見る
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

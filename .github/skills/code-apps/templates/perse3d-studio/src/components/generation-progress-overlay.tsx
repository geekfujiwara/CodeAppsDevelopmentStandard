import { useEffect, useState } from "react"
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { generationProgress, useGenerationProgress } from "@/lib/generation-progress"
import { cn } from "@/lib/utils"

/** 3D 生成の進み具合（画面の上に重ねる。タブを切り替えても表示し続ける） */
export function GenerationProgressOverlay() {
  const p = useGenerationProgress()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!p.open) return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [p.open])
  if (!p.open) return null
  const total = p.steps.length || 1
  const done = p.steps.filter(s => s.state === "done").length
  const active = p.steps.some(s => s.state === "active") ? 0.5 : 0
  const percent = Math.min(100, Math.round(((done + active) / total) * 100))
  const seconds = Math.max(0, Math.round((now - p.startedAt) / 100) / 10)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={p.title} data-testid="generation-progress">
      <div className="w-[min(92vw,440px)] space-y-4 rounded-lg border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">{p.title}</p>
          <span className="text-xs tabular-nums text-muted-foreground">{seconds.toFixed(1)} 秒</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full transition-[width] duration-300", p.error ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
        </div>
        <ol className="space-y-2">
          {p.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {s.state === "done" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : s.state === "active" ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : s.state === "error" ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
              )}
              <span className="min-w-0">
                <span className={cn(s.state === "pending" && "text-muted-foreground")}>{s.label}</span>
                {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
        {p.error && (
          <div className="space-y-2">
            <p className="text-xs text-destructive">{p.error}</p>
            <Button size="sm" variant="outline" onClick={() => generationProgress.close()}>閉じる</Button>
          </div>
        )}
      </div>
    </div>
  )
}

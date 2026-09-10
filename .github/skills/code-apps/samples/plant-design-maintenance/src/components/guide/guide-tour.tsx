import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TOUR_STEPS } from "@/guide-config"

const PADDING = 8
const CARD_WIDTH = 360

type Rect = { top: number; left: number; width: number; height: number }

function findTarget(name: string | undefined): HTMLElement | null {
  if (!name) return null
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** 対象要素の位置に合わせてカードを置く。下に入らなければ上、それも無理なら中央寄せ */
function cardStyle(rect: Rect | null): React.CSSProperties {
  const width = Math.min(CARD_WIDTH, window.innerWidth - 32)
  if (!rect) {
    return {
      width,
      top: Math.round(window.innerHeight / 2 - 120),
      left: Math.round((window.innerWidth - width) / 2),
    }
  }
  const below = rect.top + rect.height + PADDING + 16
  const fitsBelow = below + 220 < window.innerHeight
  const top = fitsBelow ? below : Math.max(16, rect.top - PADDING - 236)
  const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16)
  return { width, top: Math.round(top), left: Math.round(left) }
}

export function GuideTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const step = TOUR_STEPS[index]
  const isLast = index === TOUR_STEPS.length - 1

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  // ステップが指定する画面へ移動する
  useEffect(() => {
    if (!open || !step?.path) return
    if (location.pathname !== step.path) navigate(step.path)
  }, [open, step, location.pathname, navigate])

  // 実際の操作を見せる（対象は遅延描画されるので現れるまで待つ）
  useEffect(() => {
    if (!open || !step?.autoClick) return
    let cancelled = false
    let attempts = 0
    const timer = window.setInterval(() => {
      if (cancelled) return
      const el = findTarget(step.autoClick)
      if (el) {
        el.click()
        window.clearInterval(timer)
      } else if (++attempts > 20) {
        window.clearInterval(timer)
      }
    }, 150)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, step])

  // ハイライト位置の追従。ルート遷移・遅延描画・スクロールのいずれでもずれないよう定期的に測る
  useEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    let scrolled = false
    const measure = () => {
      const el = findTarget(step?.target)
      if (!el) {
        setRect((prev) => (prev === null ? prev : null))
        return
      }
      if (!scrolled) {
        scrolled = true
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      const r = el.getBoundingClientRect()
      const next = { top: r.top, left: r.left, width: r.width, height: r.height }
      setRect((prev) => (sameRect(prev, next) ? prev : next))
    }
    measure()
    const timer = window.setInterval(measure, 200)
    window.addEventListener("resize", measure)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("resize", measure)
    }
  }, [open, step])

  const finish = useCallback(() => {
    setIndex(0)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, finish])

  if (!open || !step) return null

  return createPortal(
    <div className="fixed inset-0 z-[500]" role="dialog" aria-modal="true" aria-label="使い方ガイド">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary transition-all duration-300"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/60" />
      )}

      <div
        className="absolute rounded-xl border bg-background p-5 shadow-2xl transition-all duration-300"
        style={cardStyle(rect)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              STEP {index + 1} / {TOUR_STEPS.length}
            </p>
            <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{step.title}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={finish} aria-label="ガイドを終了">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            終了
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft className="mr-1 h-4 w-4" />戻る
            </Button>
            <Button size="sm" onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}>
              {isLast ? "完了" : "次へ"}
              {!isLast && <ArrowRight className="ml-1 h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

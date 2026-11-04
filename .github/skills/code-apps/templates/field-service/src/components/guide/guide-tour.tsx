import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TOUR_STEPS } from "@/guide-config"

const PADDING = 6
const CARD_WIDTH = 360
const FIXED_HEADER_SELECTOR = "[data-tour-fixed-header]"
const MAX_SCROLL_ADJUSTMENTS = 3

type Rect = { top: number; left: number; width: number; height: number }

function findTarget(name: string | undefined): HTMLElement | null {
  if (!name) return null
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

function fixedHeaderBottom(): number {
  return document.querySelector<HTMLElement>(FIXED_HEADER_SELECTOR)?.getBoundingClientRect().bottom ?? 0
}

function visibleRect(element: HTMLElement, includeHeader: boolean): Rect | null {
  const bounds = element.getBoundingClientRect()
  const top = Math.max(bounds.top, includeHeader ? fixedHeaderBottom() : 0, 0)
  const left = Math.max(bounds.left, 0)
  const right = Math.min(bounds.right, window.innerWidth)
  const bottom = Math.min(bounds.bottom, window.innerHeight)
  if (right <= left || bottom <= top) return null
  return { top, left, width: right - left, height: bottom - top }
}

function cardStyle(rect: Rect | null): CSSProperties {
  const width = Math.min(CARD_WIDTH, window.innerWidth - 32)
  const maxHeight = window.innerHeight - 32
  if (!rect) {
    return {
      width,
      maxHeight,
      top: Math.max(16, Math.round((window.innerHeight - maxHeight) / 2)),
      left: Math.round((window.innerWidth - width) / 2),
    }
  }
  const rightSpace = window.innerWidth - rect.left - rect.width - PADDING * 2
  if (rect.left < window.innerWidth / 2 && rightSpace >= width + 16) {
    return {
      width,
      maxHeight,
      top: Math.max(16, Math.min(rect.top, window.innerHeight - maxHeight - 16)),
      left: rect.left + rect.width + PADDING * 2,
    }
  }
  const below = rect.top + rect.height + PADDING + 16
  const fitsBelow = below + 220 < window.innerHeight
  const top = fitsBelow ? below : Math.max(16, rect.top - PADDING - 236)
  const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16)
  return { width, maxHeight, top: Math.round(top), left: Math.round(left) }
}

export function GuideTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)
  const returnPath = useRef<string | null>(null)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [targetUnavailable, setTargetUnavailable] = useState(false)

  const step = TOUR_STEPS[index]
  const isLast = index === TOUR_STEPS.length - 1
  const isHeaderTarget = step?.target === "guide-button"

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  useEffect(() => {
    if (!open) {
      returnPath.current = null
    } else if (returnPath.current === null) {
      returnPath.current = location.pathname
    }
  }, [open, location.pathname])

  useEffect(() => {
    if (open && step?.path && location.pathname !== step.path) navigate(step.path)
  }, [open, step, location.pathname, navigate])

  useEffect(() => {
    if (!open || !step) {
      setRect(null)
      setTargetUnavailable(false)
      return
    }
    if (step.path && location.pathname !== step.path) return

    let frame = 0
    let attemptsWithoutTarget = 0
    let scrollAdjustments = 0
    let currentTarget: HTMLElement | null = null
    let cancelled = false

    const measure = () => {
      if (cancelled) return
      const element = findTarget(step.target)
      if (!element) {
        attemptsWithoutTarget += 1
        setRect(null)
        setTargetUnavailable(attemptsWithoutTarget >= 20)
        return
      }

      if (element !== currentTarget) {
        currentTarget = element
        scrollAdjustments = 0
      }

      const headerBottom = isHeaderTarget ? 0 : fixedHeaderBottom()
      const bounds = element.getBoundingClientRect()
      const isOutsideViewport = bounds.top < headerBottom + 8 || bounds.bottom > window.innerHeight
      if (isOutsideViewport && scrollAdjustments < MAX_SCROLL_ADJUSTMENTS) {
        scrollAdjustments += 1
        const previousScrollMargin = element.style.scrollMarginTop
        element.style.scrollMarginTop = isHeaderTarget ? previousScrollMargin : `${headerBottom + 8}px`
        element.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" })
        element.style.scrollMarginTop = previousScrollMargin
      }

      const next = visibleRect(element, !isHeaderTarget)
      if (!next) {
        attemptsWithoutTarget += 1
        setRect(null)
        setTargetUnavailable(attemptsWithoutTarget >= 20)
        return
      }
      attemptsWithoutTarget = 0
      setTargetUnavailable(false)
      setRect(previous => (sameRect(previous, next) ? previous : next))
    }

    const scheduleMeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    scheduleMeasure()
    const timer = window.setInterval(scheduleMeasure, 180)
    window.addEventListener("scroll", scheduleMeasure, true)
    window.addEventListener("resize", scheduleMeasure)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.clearInterval(timer)
      window.removeEventListener("scroll", scheduleMeasure, true)
      window.removeEventListener("resize", scheduleMeasure)
    }
  }, [open, step, location.pathname, isHeaderTarget])

  const finish = useCallback(() => {
    const path = returnPath.current
    if (path && path !== location.pathname) navigate(path)
    returnPath.current = null
    setIndex(0)
    onClose()
  }, [location.pathname, navigate, onClose])

  if (!step) return null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={nextOpen => { if (!nextOpen) finish() }}>
      {open && createPortal(
        <>
          <div
            aria-hidden="true"
            className="pointer-events-auto fixed inset-0 z-[300]"
            style={{ backgroundColor: rect ? "transparent" : "rgba(2, 6, 23, 0.62)" }}
          />
          {rect && (
            <div
              aria-hidden="true"
              data-tutorial-spotlight
              className="pointer-events-none fixed z-[350] rounded-lg outline-2 outline-primary"
              style={{
                top: Math.max(0, rect.top - PADDING),
                left: Math.max(0, rect.left - PADDING),
                width: Math.min(rect.width + PADDING * 2, window.innerWidth - Math.max(0, rect.left - PADDING)),
                height: Math.min(rect.height + PADDING * 2, window.innerHeight - Math.max(0, rect.top - PADDING)),
                boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)",
              }}
            />
          )}

          <DialogPrimitive.Content
            ref={contentRef}
            tabIndex={-1}
            onOpenAutoFocus={event => {
              event.preventDefault()
              contentRef.current?.focus({ preventScroll: true })
            }}
            onCloseAutoFocus={event => {
              event.preventDefault()
              document.querySelector<HTMLElement>('[data-tour="guide-button"]')?.focus()
            }}
            className="fixed z-[400] overflow-y-auto rounded-xl border bg-background p-5 shadow-2xl outline-none"
            style={cardStyle(rect)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  STEP {index + 1} / {TOUR_STEPS.length}
                </p>
                <DialogPrimitive.Title className="mt-1 font-semibold [overflow-wrap:anywhere]">
                  {step.title}
                </DialogPrimitive.Title>
              </div>
              <Button variant="ghost" size="icon" onClick={finish} aria-label="ガイドを終了">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {targetUnavailable
                ? "画面内の案内対象が見つかりません。読み込みが完了しているか確認し、次のステップへ進むかガイドを終了してください。"
                : step.body}
            </DialogPrimitive.Description>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={finish}>
                終了
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  戻る
                </Button>
                <Button size="sm" onClick={() => (isLast ? finish() : setIndex(value => value + 1))}>
                  {isLast ? "完了" : "次へ"}
                  {!isLast && <ArrowRight className="ml-1 h-4 w-4" />}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </>,
        document.body,
      )}
    </DialogPrimitive.Root>
  )
}

import { useEffect, useRef, type RefObject } from "react"
import type { Card } from "@/lib/agm/engine"
import { qColor } from "./colors"

/** カードと回答案の見出しの高さ（線をつなぐ位置） */
const ANCHOR_Y = 18

type Refs = RefObject<Map<string, HTMLElement>>

/**
 * ② 質問カードと ③ 回答案を線で結ぶ。両方の列は別々にスクロールし、カードはアニメーションで動くため、
 * 毎フレーム位置を読み、React の再描画を介さずに SVG の属性だけを書き換える。
 * 片方が見えない位置にあるときは、見えている列の端までの点線にする。
 */
export function CardAnswerLinks({
  containerRef,
  cardRefs,
  answerRefs,
  cardScroll,
  answerScroll,
  cards,
  selectedId,
}: {
  containerRef: RefObject<HTMLElement | null>
  cardRefs: Refs
  answerRefs: Refs
  cardScroll: RefObject<HTMLElement | null>
  answerScroll: RefObject<HTMLElement | null>
  cards: Card[]
  selectedId?: string
}) {
  const paths = useRef(new Map<string, SVGPathElement>())
  const dots = useRef(new Map<string, [SVGCircleElement, SVGCircleElement]>())

  useEffect(() => {
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const box = containerRef.current?.getBoundingClientRect()
      const ls = cardScroll.current?.getBoundingClientRect()
      const rs = answerScroll.current?.getBoundingClientRect()
      if (!box || !ls || !rs) return
      for (const card of cards) {
        const path = paths.current.get(card.id)
        const [d1, d2] = dots.current.get(card.id) ?? []
        const l = cardRefs.current?.get(card.id)?.getBoundingClientRect()
        const r = answerRefs.current?.get(card.id)?.getBoundingClientRect()
        if (!path || !d1 || !d2 || !l || !r) continue
        const clamp = (y: number, area: DOMRect) => Math.min(area.bottom - 4, Math.max(area.top + 4, y))
        const ly = l.top + ANCHOR_Y
        const ry = r.top + ANCHOR_Y
        const visible = ly >= ls.top && ly <= ls.bottom && ry >= rs.top && ry <= rs.bottom
        const x1 = l.right - box.left
        const y1 = clamp(ly, ls) - box.top
        const x2 = r.left - box.left
        const y2 = clamp(ry, rs) - box.top
        const dx = Math.max(16, (x2 - x1) / 2)
        path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`)
        path.setAttribute("stroke-dasharray", visible ? "" : "4 4")
        path.style.opacity = visible ? (card.id === selectedId || !selectedId ? "0.95" : "0.45") : "0.25"
        d1.setAttribute("cx", String(x1))
        d1.setAttribute("cy", String(y1))
        d2.setAttribute("cx", String(x2))
        d2.setAttribute("cy", String(y2))
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [cards, selectedId, containerRef, cardRefs, answerRefs, cardScroll, answerScroll])

  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" aria-hidden data-testid="card-links">
      {cards.map((card, index) => {
        const color = qColor(index)
        const selected = card.id === selectedId
        return (
          <g key={card.id}>
            <path
              ref={(el) => {
                if (el) paths.current.set(card.id, el)
                else paths.current.delete(card.id)
              }}
              fill="none"
              stroke={color}
              strokeWidth={selected ? 3 : 1.75}
              strokeLinecap="round"
            />
            <circle
              ref={(el) => {
                const pair = dots.current.get(card.id) ?? ([null, null] as unknown as [SVGCircleElement, SVGCircleElement])
                pair[0] = el as SVGCircleElement
                if (el) dots.current.set(card.id, pair)
              }}
              r={selected ? 4 : 3}
              fill={color}
            />
            <circle
              ref={(el) => {
                const pair = dots.current.get(card.id) ?? ([null, null] as unknown as [SVGCircleElement, SVGCircleElement])
                pair[1] = el as SVGCircleElement
                if (el) dots.current.set(card.id, pair)
              }}
              r={selected ? 4 : 3}
              fill={color}
            />
          </g>
        )
      })}
    </svg>
  )
}

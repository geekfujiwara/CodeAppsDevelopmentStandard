import { useMemo, useRef, type MouseEvent } from "react"
import type { Drawing } from "@/drawing/drawing-schema"
import type { Primitive } from "@/drawing/drawing-scene"
import { buildScene } from "@/drawing/drawing-renderer"
import { LAYER_STYLE } from "@/drawing/drawing-scene"
import { cn } from "@/lib/utils"

type DrawingCanvasProps = {
  drawing: Drawing
  selectedAnnotationId: string | null
  onSelectAnnotation: (id: string | null) => void
  /** 用紙座標 (mm) を受け取る。null なら図面クリックで何もしない。 */
  onPickPoint: ((point: { x: number; y: number }) => void) | null
}

function renderPrimitive(primitive: Primitive, index: number, selectedAnnotationId: string | null) {
  const style = LAYER_STYLE[primitive.layer]
  const selected = primitive.ref !== undefined && primitive.ref === selectedAnnotationId
  const common = {
    stroke: selected ? "#0f172a" : style.stroke,
    strokeWidth: selected ? style.width * 2 : style.width,
    strokeDasharray: style.dash,
    vectorEffect: "non-scaling-stroke" as const,
  }

  switch (primitive.kind) {
    case "line":
      return <line key={index} x1={primitive.a.x} y1={primitive.a.y} x2={primitive.b.x} y2={primitive.b.y} {...common} />
    case "rect":
      return (
        <rect key={index} x={primitive.x} y={primitive.y} width={primitive.w} height={primitive.h} rx={primitive.rx} fill={primitive.fill ?? "none"} {...common} />
      )
    case "circle":
      return <circle key={index} cx={primitive.c.x} cy={primitive.c.y} r={primitive.r} fill={primitive.fill ?? "none"} {...common} />
    case "polyline": {
      const points = primitive.points.map((point) => `${point.x},${point.y}`).join(" ")
      return primitive.close ? (
        <polygon key={index} points={points} fill={primitive.fill ?? "none"} {...common} />
      ) : (
        <polyline key={index} points={points} fill={primitive.fill ?? "none"} {...common} />
      )
    }
    case "text":
      return (
        <text
          key={index}
          x={primitive.at.x}
          y={primitive.at.y}
          fontSize={primitive.size ?? 3.2}
          textAnchor={primitive.anchor ?? "start"}
          fontWeight={primitive.bold ? 600 : 400}
          fill={style.stroke}
          stroke="none"
          style={{ fontFamily: '"Yu Gothic UI", "Hiragino Sans", Meiryo, sans-serif', userSelect: "none" }}
        >
          {primitive.text}
        </text>
      )
  }
}

/** A3 用紙 (420 x 297 mm) をそのまま viewBox にした SVG。クリック座標は mm に換算する。 */
export function DrawingCanvas({ drawing, selectedAnnotationId, onSelectAnnotation, onPickPoint }: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const scene = useMemo(() => buildScene(drawing), [drawing])

  const toSheetPoint = (event: MouseEvent<SVGSVGElement>): { x: number; y: number } | null => {
    const element = svgRef.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    // preserveAspectRatio="xMidYMid meet" と同じ換算を行う
    const scale = Math.min(rect.width / scene.widthMm, rect.height / scene.heightMm)
    const offsetX = (rect.width - scene.widthMm * scale) / 2
    const offsetY = (rect.height - scene.heightMm * scale) / 2
    const x = (event.clientX - rect.left - offsetX) / scale
    const y = (event.clientY - rect.top - offsetY) / scale
    if (x < 0 || y < 0 || x > scene.widthMm || y > scene.heightMm) return null
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
  }

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!onPickPoint) return
    const point = toSheetPoint(event)
    if (point) onPickPoint(point)
  }

  return (
    <div className="min-w-0 rounded-md border border-border bg-white p-2 shadow-sm" data-tour="drawing-canvas">
      <svg
        ref={svgRef}
        role="img"
        aria-label={`${drawing.titleBlock.drawingNumber} ${drawing.titleBlock.title}`}
        viewBox={`0 0 ${scene.widthMm} ${scene.heightMm}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("h-auto w-full", onPickPoint ? "cursor-crosshair" : "cursor-default")}
        onClick={handleClick}
      >
        <rect x={0} y={0} width={scene.widthMm} height={scene.heightMm} fill="#ffffff" />
        {scene.primitives.map((primitive, index) => renderPrimitive(primitive, index, selectedAnnotationId))}
        {drawing.annotations.map((annotation) => (
          <circle
            key={`hit-${annotation.id}`}
            cx={annotation.at.x}
            cy={annotation.at.y}
            r={4.2}
            fill="transparent"
            className="cursor-pointer"
            onClick={(event) => {
              event.stopPropagation()
              onSelectAnnotation(annotation.id === selectedAnnotationId ? null : annotation.id)
            }}
          >
            <title>{annotation.title}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

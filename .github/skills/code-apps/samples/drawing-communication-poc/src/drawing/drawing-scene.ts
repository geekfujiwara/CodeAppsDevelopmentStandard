/**
 * 図面プリミティブ（用紙座標 mm・左上原点）と SVG 出力。
 * React にもブラウザにも依存しないため、Node のテストからそのまま呼べる。
 */

export const LAYERS = ["frame", "outline", "hidden", "center", "dimension", "annotation", "note"] as const
export type Layer = (typeof LAYERS)[number]

export type Point = { x: number; y: number }

export type Primitive =
  | { kind: "line"; layer: Layer; a: Point; b: Point; ref?: string }
  | { kind: "polyline"; layer: Layer; points: Point[]; close?: boolean; fill?: string; ref?: string }
  | { kind: "rect"; layer: Layer; x: number; y: number; w: number; h: number; rx?: number; fill?: string; ref?: string }
  | { kind: "circle"; layer: Layer; c: Point; r: number; fill?: string; ref?: string }
  | {
      kind: "text"
      layer: Layer
      at: Point
      text: string
      size?: number
      anchor?: "start" | "middle" | "end"
      bold?: boolean
      ref?: string
    }

export type DrawingScene = {
  widthMm: number
  heightMm: number
  primitives: Primitive[]
}

export type LayerStyle = { stroke: string; width: number; dash?: string }

/** 製図の線種。モノトーンで濃淡と線種だけで区別する。 */
export const LAYER_STYLE: Record<Layer, LayerStyle> = {
  frame: { stroke: "#0f172a", width: 0.6 },
  outline: { stroke: "#0f172a", width: 0.45 },
  hidden: { stroke: "#64748b", width: 0.25, dash: "2.4 1.4" },
  center: { stroke: "#94a3b8", width: 0.2, dash: "6 1.6 1 1.6" },
  dimension: { stroke: "#475569", width: 0.18 },
  annotation: { stroke: "#b91c1c", width: 0.35 },
  note: { stroke: "#475569", width: 0.2 },
}

export function line(layer: Layer, a: Point, b: Point): Primitive {
  return { kind: "line", layer, a, b }
}

export function rect(layer: Layer, x: number, y: number, w: number, h: number, options: { rx?: number; fill?: string } = {}): Primitive {
  return { kind: "rect", layer, x, y, w, h, rx: options.rx, fill: options.fill }
}

export function circle(layer: Layer, cx: number, cy: number, r: number, fill?: string): Primitive {
  return { kind: "circle", layer, c: { x: cx, y: cy }, r, fill }
}

export function polyline(layer: Layer, points: Point[], options: { close?: boolean; fill?: string } = {}): Primitive {
  return { kind: "polyline", layer, points, close: options.close, fill: options.fill }
}

export function text(
  layer: Layer,
  x: number,
  y: number,
  value: string,
  options: { size?: number; anchor?: "start" | "middle" | "end"; bold?: boolean } = {},
): Primitive {
  return { kind: "text", layer, at: { x, y }, text: value, size: options.size, anchor: options.anchor, bold: options.bold }
}

export function centerLineH(y: number, x1: number, x2: number): Primitive {
  return line("center", { x: x1, y }, { x: x2, y })
}

export function centerLineV(x: number, y1: number, y2: number): Primitive {
  return line("center", { x, y: y1 }, { x, y: y2 })
}

function arrow(at: Point, direction: -1 | 1, horizontal: boolean): Primitive {
  const length = 2.2
  const half = 0.8
  const tip = at
  const base = horizontal ? { x: at.x + direction * length, y: at.y } : { x: at.x, y: at.y + direction * length }
  const wing1 = horizontal ? { x: base.x, y: base.y - half } : { x: base.x - half, y: base.y }
  const wing2 = horizontal ? { x: base.x, y: base.y + half } : { x: base.x + half, y: base.y }
  return polyline("dimension", [tip, wing1, wing2], { close: true, fill: LAYER_STYLE.dimension.stroke })
}

/** 水平寸法。x1..x2 を測り、baseY に寸法線を引く。extendFrom は寸法補助線の起点。 */
export function dimensionH(x1: number, x2: number, baseY: number, label: string, extendFrom: number): Primitive[] {
  const [left, right] = x1 <= x2 ? [x1, x2] : [x2, x1]
  const towards = baseY >= extendFrom ? 1 : -1
  return [
    line("dimension", { x: left, y: extendFrom + towards * 1.2 }, { x: left, y: baseY + towards * 1.6 }),
    line("dimension", { x: right, y: extendFrom + towards * 1.2 }, { x: right, y: baseY + towards * 1.6 }),
    line("dimension", { x: left, y: baseY }, { x: right, y: baseY }),
    arrow({ x: left, y: baseY }, 1, true),
    arrow({ x: right, y: baseY }, -1, true),
    text("dimension", (left + right) / 2, baseY - 1.2, label, { size: 3, anchor: "middle" }),
  ]
}

/** 垂直寸法。y1..y2 を測り、baseX に寸法線を引く。 */
export function dimensionV(y1: number, y2: number, baseX: number, label: string, extendFrom: number): Primitive[] {
  const [top, bottom] = y1 <= y2 ? [y1, y2] : [y2, y1]
  const towards = baseX >= extendFrom ? 1 : -1
  return [
    line("dimension", { x: extendFrom + towards * 1.2, y: top }, { x: baseX + towards * 1.6, y: top }),
    line("dimension", { x: extendFrom + towards * 1.2, y: bottom }, { x: baseX + towards * 1.6, y: bottom }),
    line("dimension", { x: baseX, y: top }, { x: baseX, y: bottom }),
    arrow({ x: baseX, y: top }, 1, false),
    arrow({ x: baseX, y: bottom }, -1, false),
    text("dimension", baseX - 1.2, (top + bottom) / 2, label, { size: 3, anchor: "middle" }),
  ]
}

/** 引き出し線つきの部品符号。 */
export function balloon(at: Point, to: Point, label: string): Primitive[] {
  return [
    line("note", at, to),
    circle("note", at.x, at.y, 3, "#ffffff"),
    text("note", at.x, at.y + 1.1, label, { size: 2.8, anchor: "middle" }),
  ]
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] ?? char)
}

function styleAttributes(primitive: Primitive): string {
  const style = LAYER_STYLE[primitive.layer]
  const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : ""
  return ` stroke="${style.stroke}" stroke-width="${style.width}"${dash}`
}

function primitiveToSvg(primitive: Primitive): string {
  switch (primitive.kind) {
    case "line":
      return `<line x1="${round(primitive.a.x)}" y1="${round(primitive.a.y)}" x2="${round(primitive.b.x)}" y2="${round(primitive.b.y)}"${styleAttributes(primitive)} />`
    case "rect":
      return `<rect x="${round(primitive.x)}" y="${round(primitive.y)}" width="${round(primitive.w)}" height="${round(primitive.h)}"${
        primitive.rx ? ` rx="${round(primitive.rx)}"` : ""
      } fill="${primitive.fill ?? "none"}"${styleAttributes(primitive)} />`
    case "circle":
      return `<circle cx="${round(primitive.c.x)}" cy="${round(primitive.c.y)}" r="${round(primitive.r)}" fill="${primitive.fill ?? "none"}"${styleAttributes(primitive)} />`
    case "polyline": {
      const points = primitive.points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ")
      const tag = primitive.close ? "polygon" : "polyline"
      return `<${tag} points="${points}" fill="${primitive.fill ?? "none"}"${styleAttributes(primitive)} />`
    }
    case "text":
      return `<text x="${round(primitive.at.x)}" y="${round(primitive.at.y)}" font-size="${round(primitive.size ?? 3.2)}" text-anchor="${
        primitive.anchor ?? "start"
      }" font-family="Yu Gothic UI, Hiragino Sans, Meiryo, sans-serif"${primitive.bold ? ' font-weight="600"' : ""} fill="${
        LAYER_STYLE[primitive.layer].stroke
      }">${escapeXml(primitive.text)}</text>`
  }
}

/** 単体で開ける SVG 文字列。フォントは端末依存のため、共有時は PDF 併用を前提にする。 */
export function sceneToSvg(scene: DrawingScene): string {
  const body = scene.primitives.map(primitiveToSvg).join("\n  ")
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.widthMm}mm" height="${scene.heightMm}mm" viewBox="0 0 ${scene.widthMm} ${scene.heightMm}">`,
    `  <rect x="0" y="0" width="${scene.widthMm}" height="${scene.heightMm}" fill="#ffffff" />`,
    `  ${body}`,
    `</svg>`,
    "",
  ].join("\n")
}

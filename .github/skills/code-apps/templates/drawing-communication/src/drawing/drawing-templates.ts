/**
 * 図面テンプレート定義。
 *
 * 図形は JSON に保存せず、寸法パラメーターから毎回生成する。
 * これにより「寸法を直す → 図が変わる → 差分が寸法の値として読める」という
 * レビュー可能な形になる。
 */
import type { Point, Primitive } from "./drawing-scene.ts"
import { balloon, centerLineH, centerLineV, circle, dimensionH, dimensionV, line, polyline, rect, text } from "./drawing-scene.ts"

export const TEMPLATE_IDS = ["surface-laptop-exterior", "horizontal-pump-assembly", "generic-equipment-layout"] as const

export type ParameterUnit = "mm" | "deg" | "個"

export type ParameterDef = {
  key: string
  label: string
  unit: ParameterUnit
  min: number
  max: number
  step: number
  default: number
  group: string
  /** 整数のみ受け付けるか（台数など） */
  integer?: boolean
}

/** テンプレートが描画に使える領域（表題欄の上）。 */
export type DrawingRegion = { x: number; y: number; w: number; h: number }

export type DrawingTemplate = {
  id: (typeof TEMPLATE_IDS)[number]
  name: string
  summary: string
  /** 表題欄の初期値に使う既定の図番接頭辞 */
  numberPrefix: string
  parameters: ParameterDef[]
  build: (parameters: Record<string, number>, region: DrawingRegion) => Primitive[]
}

function fit(modelWidth: number, modelHeight: number, boxWidth: number, boxHeight: number): number {
  return Math.min(boxWidth / Math.max(modelWidth, 1), boxHeight / Math.max(modelHeight, 1))
}

function mm(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}

function viewTitle(x: number, y: number, label: string): Primitive[] {
  return [text("note", x, y, label, { size: 4, bold: true }), line("note", { x, y: y + 1.4 }, { x: x + label.length * 4.2, y: y + 1.4 })]
}

// ---------------------------------------------------------------------------
// 1. ノート PC 外観図（三面図）
// ---------------------------------------------------------------------------

const LAPTOP_PARAMETERS: ParameterDef[] = [
  { key: "bodyWidth", label: "本体幅", unit: "mm", min: 200, max: 400, step: 1, default: 287, group: "外形" },
  { key: "bodyDepth", label: "本体奥行", unit: "mm", min: 150, max: 320, step: 1, default: 223, group: "外形" },
  { key: "closedHeight", label: "閉時厚さ", unit: "mm", min: 8, max: 30, step: 0.1, default: 14.5, group: "外形" },
  { key: "displayBezel", label: "額縁幅", unit: "mm", min: 2, max: 20, step: 0.5, default: 8, group: "ディスプレイ" },
  { key: "lidAngle", label: "開き角", unit: "deg", min: 90, max: 140, step: 1, default: 118, group: "ディスプレイ" },
  { key: "keyboardWidth", label: "キーボード幅", unit: "mm", min: 150, max: 360, step: 1, default: 252, group: "入力部" },
  { key: "keyboardDepth", label: "キーボード奥行", unit: "mm", min: 60, max: 180, step: 1, default: 106, group: "入力部" },
  { key: "touchpadWidth", label: "タッチパッド幅", unit: "mm", min: 60, max: 180, step: 1, default: 115, group: "入力部" },
  { key: "touchpadDepth", label: "タッチパッド奥行", unit: "mm", min: 40, max: 120, step: 1, default: 76, group: "入力部" },
  { key: "portCount", label: "側面ポート数", unit: "個", min: 1, max: 6, step: 1, default: 3, group: "入力部", integer: true },
]

function buildLaptop(parameters: Record<string, number>, region: DrawingRegion): Primitive[] {
  const width = parameters.bodyWidth
  const depth = parameters.bodyDepth
  const height = parameters.closedHeight
  const scale = fit(width, depth, region.w * 0.42, region.h * 0.44)
  const primitives: Primitive[] = []

  // 平面図（上面）
  const planCx = region.x + region.w * 0.26
  const planCy = region.y + region.h * 0.32
  const pw = width * scale
  const pd = depth * scale
  primitives.push(...viewTitle(planCx - pw / 2, region.y + 6, "平面図"))
  primitives.push(rect("outline", planCx - pw / 2, planCy - pd / 2, pw, pd, { rx: 2.5 }))
  const kw = parameters.keyboardWidth * scale
  const kd = parameters.keyboardDepth * scale
  primitives.push(rect("outline", planCx - kw / 2, planCy - pd / 2 + pd * 0.16, kw, kd, { rx: 1.2 }))
  const keyRows = 5
  for (let index = 1; index < keyRows; index += 1) {
    const y = planCy - pd / 2 + pd * 0.16 + (kd / keyRows) * index
    primitives.push(line("hidden", { x: planCx - kw / 2, y }, { x: planCx + kw / 2, y }))
  }
  const tw = parameters.touchpadWidth * scale
  const td = parameters.touchpadDepth * scale
  primitives.push(rect("outline", planCx - tw / 2, planCy + pd / 2 - td - pd * 0.06, tw, td, { rx: 1 }))
  primitives.push(centerLineV(planCx, planCy - pd / 2 - 5, planCy + pd / 2 + 5))
  primitives.push(...dimensionH(planCx - pw / 2, planCx + pw / 2, planCy + pd / 2 + 12, `${mm(width)}`, planCy + pd / 2))
  primitives.push(...dimensionV(planCy - pd / 2, planCy + pd / 2, planCx - pw / 2 - 12, `${mm(depth)}`, planCx - pw / 2))
  primitives.push(...dimensionH(planCx - tw / 2, planCx + tw / 2, planCy + pd / 2 + 24, `TP ${mm(parameters.touchpadWidth)}`, planCy + pd / 2 - td))

  // 正面図（閉時）
  const frontCy = region.y + region.h * 0.74
  const fh = Math.max(height * scale, 1.5)
  primitives.push(...viewTitle(planCx - pw / 2, frontCy - fh / 2 - 10, "正面図（閉時）"))
  primitives.push(rect("outline", planCx - pw / 2, frontCy - fh / 2, pw, fh, { rx: 1 }))
  const ports = Math.max(1, Math.round(parameters.portCount))
  for (let index = 0; index < ports; index += 1) {
    const x = planCx - pw / 2 + (pw / (ports + 1)) * (index + 1)
    primitives.push(rect("hidden", x - 3, frontCy - fh / 4, 6, Math.max(fh / 2, 1)))
  }
  primitives.push(...dimensionV(frontCy - fh / 2, frontCy + fh / 2, planCx + pw / 2 + 12, `${mm(height)}`, planCx + pw / 2))

  // 側面図（開時）
  const sideCx = region.x + region.w * 0.74
  const sideCy = region.y + region.h * 0.55
  const sd = depth * scale
  const sh = Math.max(height * scale, 1.5)
  primitives.push(...viewTitle(sideCx - sd / 2, region.y + 6, `側面図（開き ${mm(parameters.lidAngle)}°）`))
  primitives.push(rect("outline", sideCx - sd / 2, sideCy, sd, sh, { rx: 0.8 }))
  const hingeX = sideCx - sd / 2
  const hingeY = sideCy
  const lidLength = sd
  const angle = (parameters.lidAngle * Math.PI) / 180
  const lidThickness = Math.max(sh * 0.55, 1.2)
  // 用紙座標は Y が下向きなので、開き角度の sin を反転させて上方へ開かせる
  const dirX = Math.cos(angle)
  const dirY = -Math.sin(angle)
  const tipX = hingeX + dirX * lidLength
  const tipY = hingeY + dirY * lidLength
  const normalX = -dirY
  const normalY = dirX
  const lidPoints: Point[] = [
    { x: hingeX, y: hingeY },
    { x: tipX, y: tipY },
    { x: tipX + normalX * lidThickness, y: tipY + normalY * lidThickness },
    { x: hingeX + normalX * lidThickness, y: hingeY + normalY * lidThickness },
  ]
  primitives.push(polyline("outline", lidPoints, { close: true }))
  const bezel = parameters.displayBezel * scale
  primitives.push(
    polyline(
      "hidden",
      [
        { x: hingeX + dirX * bezel + normalX * bezel * 0.3, y: hingeY + dirY * bezel + normalY * bezel * 0.3 },
        { x: tipX - dirX * bezel + normalX * bezel * 0.3, y: tipY - dirY * bezel + normalY * bezel * 0.3 },
      ],
      {},
    ),
  )
  primitives.push(circle("center", hingeX, hingeY, 1.6))
  primitives.push(...balloon({ x: sideCx + sd * 0.1, y: sideCy + sh + 14 }, { x: sideCx, y: sideCy + sh }, "1"))
  primitives.push(text("note", sideCx + sd * 0.1 + 6, sideCy + sh + 15, "本体（キーボード部）", { size: 3 }))
  primitives.push(...balloon({ x: sideCx + sd * 0.1, y: sideCy + sh + 24 }, { x: tipX, y: tipY }, "2"))
  primitives.push(text("note", sideCx + sd * 0.1 + 6, sideCy + sh + 25, "ディスプレイ部", { size: 3 }))
  return primitives
}

// ---------------------------------------------------------------------------
// 2. 横形ポンプ総組立図
// ---------------------------------------------------------------------------

const PUMP_PARAMETERS: ParameterDef[] = [
  { key: "baseLength", label: "ベース長さ", unit: "mm", min: 600, max: 2500, step: 10, default: 1400, group: "ベース" },
  { key: "baseWidth", label: "ベース幅", unit: "mm", min: 300, max: 1200, step: 10, default: 560, group: "ベース" },
  { key: "baseHeight", label: "ベース高さ", unit: "mm", min: 80, max: 400, step: 5, default: 150, group: "ベース" },
  { key: "shaftCenterHeight", label: "軸心高さ", unit: "mm", min: 120, max: 600, step: 5, default: 280, group: "ポンプ" },
  { key: "casingDiameter", label: "ケーシング外径", unit: "mm", min: 150, max: 800, step: 10, default: 380, group: "ポンプ" },
  { key: "suctionDN", label: "吸込口径", unit: "mm", min: 50, max: 400, step: 5, default: 150, group: "ポンプ" },
  { key: "dischargeDN", label: "吐出口径", unit: "mm", min: 40, max: 300, step: 5, default: 100, group: "ポンプ" },
  { key: "couplingGap", label: "カップリング間隔", unit: "mm", min: 40, max: 300, step: 5, default: 120, group: "駆動" },
  { key: "motorLength", label: "モーター長さ", unit: "mm", min: 200, max: 1200, step: 10, default: 520, group: "駆動" },
  { key: "motorDiameter", label: "モーター外径", unit: "mm", min: 150, max: 700, step: 10, default: 320, group: "駆動" },
]

function buildPump(parameters: Record<string, number>, region: DrawingRegion): Primitive[] {
  const baseLength = parameters.baseLength
  const casingRadius = parameters.casingDiameter / 2
  const totalHeight = parameters.baseHeight + parameters.shaftCenterHeight + casingRadius + parameters.dischargeDN * 1.6
  const scale = fit(baseLength * 1.1, totalHeight * 1.2, region.w * 0.62, region.h * 0.5)
  const primitives: Primitive[] = []

  const originX = region.x + region.w * 0.06
  const groundY = region.y + region.h * 0.52
  const toX = (value: number) => originX + value * scale
  const toY = (value: number) => groundY - value * scale

  primitives.push(...viewTitle(originX, region.y + 6, "側面図（総組立）"))
  // ベースプレートと基礎
  primitives.push(rect("outline", toX(0), toY(parameters.baseHeight), baseLength * scale, parameters.baseHeight * scale))
  primitives.push(line("outline", { x: toX(-40), y: groundY }, { x: toX(baseLength + 40), y: groundY }))
  for (let index = 0; index < 4; index += 1) {
    const x = toX(baseLength * (0.08 + 0.28 * index))
    primitives.push(line("hidden", { x, y: toY(parameters.baseHeight) }, { x, y: groundY + 3 }))
  }

  const shaftY = toY(parameters.baseHeight + parameters.shaftCenterHeight)
  const casingX = toX(baseLength * 0.24)
  primitives.push(centerLineH(shaftY, toX(-30), toX(baseLength + 30)))

  // ケーシングと吸込・吐出ノズル
  primitives.push(circle("outline", casingX, shaftY, casingRadius * scale))
  primitives.push(circle("hidden", casingX, shaftY, casingRadius * scale * 0.62))
  const suctionHalf = (parameters.suctionDN / 2) * scale
  const suctionLength = casingRadius * scale * 1.1
  primitives.push(rect("outline", casingX - casingRadius * scale - suctionLength, shaftY - suctionHalf, suctionLength, suctionHalf * 2))
  primitives.push(rect("outline", casingX - casingRadius * scale - suctionLength - 3, shaftY - suctionHalf * 1.35, 3, suctionHalf * 2.7))
  const dischargeHalf = (parameters.dischargeDN / 2) * scale
  const dischargeHeight = casingRadius * scale * 1.2
  primitives.push(rect("outline", casingX - dischargeHalf, shaftY - casingRadius * scale - dischargeHeight, dischargeHalf * 2, dischargeHeight))
  primitives.push(rect("outline", casingX - dischargeHalf * 1.35, shaftY - casingRadius * scale - dischargeHeight - 3, dischargeHalf * 2.7, 3))

  // 軸受箱・カップリング・モーター
  const bearingStart = casingX + casingRadius * scale * 0.7
  const bearingWidth = baseLength * scale * 0.18
  primitives.push(rect("outline", bearingStart, shaftY - casingRadius * scale * 0.42, bearingWidth, casingRadius * scale * 0.84))
  const couplingStart = bearingStart + bearingWidth
  const gap = parameters.couplingGap * scale
  const couplingHeight = casingRadius * scale * 0.6
  primitives.push(rect("outline", couplingStart, shaftY - couplingHeight / 2, gap * 0.35, couplingHeight))
  primitives.push(rect("outline", couplingStart + gap * 0.65, shaftY - couplingHeight / 2, gap * 0.35, couplingHeight))
  primitives.push(line("hidden", { x: couplingStart + gap * 0.35, y: shaftY }, { x: couplingStart + gap * 0.65, y: shaftY }))
  const motorStart = couplingStart + gap
  const motorHalf = (parameters.motorDiameter / 2) * scale
  primitives.push(rect("outline", motorStart, shaftY - motorHalf, parameters.motorLength * scale, motorHalf * 2, { rx: 1.5 }))
  primitives.push(rect("hidden", motorStart + parameters.motorLength * scale * 0.15, shaftY - motorHalf * 0.6, parameters.motorLength * scale * 0.7, motorHalf * 1.2))

  // 寸法
  primitives.push(...dimensionH(toX(0), toX(baseLength), groundY + 16, `${mm(baseLength)}`, groundY))
  primitives.push(...dimensionV(shaftY, groundY, toX(0) - 14, `${mm(parameters.shaftCenterHeight + parameters.baseHeight)}`, toX(0)))
  primitives.push(...dimensionH(couplingStart + gap * 0.35, couplingStart + gap * 0.65, shaftY - couplingHeight - 8, `${mm(parameters.couplingGap)}`, shaftY - couplingHeight))
  primitives.push(text("dimension", casingX - casingRadius * scale - suctionLength - 6, shaftY - suctionHalf - 3, `吸込 DN${mm(parameters.suctionDN)}`, { size: 3 }))
  primitives.push(text("dimension", casingX + dischargeHalf + 3, shaftY - casingRadius * scale - dischargeHeight - 6, `吐出 DN${mm(parameters.dischargeDN)}`, { size: 3 }))

  // 部品符号
  primitives.push(...balloon({ x: casingX, y: region.y + 22 }, { x: casingX, y: shaftY - casingRadius * scale }, "1"))
  primitives.push(...balloon({ x: couplingStart + gap / 2, y: region.y + 22 }, { x: couplingStart + gap / 2, y: shaftY - couplingHeight / 2 }, "2"))
  primitives.push(...balloon({ x: motorStart + parameters.motorLength * scale * 0.5, y: region.y + 22 }, { x: motorStart + parameters.motorLength * scale * 0.5, y: shaftY - motorHalf }, "3"))
  primitives.push(...balloon({ x: toX(baseLength * 0.62), y: groundY + 28 }, { x: toX(baseLength * 0.62), y: toY(parameters.baseHeight / 2) }, "4"))

  // 平面図
  const planTop = region.y + region.h * 0.68
  const planHalf = (parameters.baseWidth / 2) * scale
  primitives.push(...viewTitle(originX, planTop - 8, "平面図"))
  primitives.push(rect("outline", toX(0), planTop, baseLength * scale, planHalf * 2))
  const planCenterY = planTop + planHalf
  primitives.push(centerLineH(planCenterY, toX(-30), toX(baseLength + 30)))
  primitives.push(circle("outline", casingX, planCenterY, casingRadius * scale * 0.8))
  primitives.push(rect("outline", motorStart, planCenterY - motorHalf, parameters.motorLength * scale, motorHalf * 2, { rx: 1.5 }))
  primitives.push(...dimensionV(planTop, planTop + planHalf * 2, toX(0) - 14, `${mm(parameters.baseWidth)}`, toX(0)))
  return primitives
}

// ---------------------------------------------------------------------------
// 3. 汎用機器配置図
// ---------------------------------------------------------------------------

const LAYOUT_PARAMETERS: ParameterDef[] = [
  { key: "roomWidth", label: "室内幅", unit: "mm", min: 3000, max: 40000, step: 100, default: 16000, group: "建屋" },
  { key: "roomDepth", label: "室内奥行", unit: "mm", min: 3000, max: 30000, step: 100, default: 9000, group: "建屋" },
  { key: "gridPitch", label: "通り芯ピッチ", unit: "mm", min: 1000, max: 6000, step: 100, default: 3000, group: "建屋" },
  { key: "columns", label: "列数", unit: "個", min: 1, max: 10, step: 1, default: 4, group: "機器", integer: true },
  { key: "rows", label: "行数", unit: "個", min: 1, max: 6, step: 1, default: 2, group: "機器", integer: true },
  { key: "machineWidth", label: "機器幅", unit: "mm", min: 400, max: 6000, step: 50, default: 2200, group: "機器" },
  { key: "machineDepth", label: "機器奥行", unit: "mm", min: 400, max: 6000, step: 50, default: 1400, group: "機器" },
  { key: "aisleWidth", label: "通路幅", unit: "mm", min: 600, max: 6000, step: 50, default: 1500, group: "動線" },
  { key: "clearance", label: "保守スペース", unit: "mm", min: 300, max: 3000, step: 50, default: 700, group: "動線" },
]

function buildLayout(parameters: Record<string, number>, region: DrawingRegion): Primitive[] {
  const roomWidth = parameters.roomWidth
  const roomDepth = parameters.roomDepth
  const scale = fit(roomWidth * 1.08, roomDepth * 1.25, region.w * 0.82, region.h * 0.72)
  const primitives: Primitive[] = []

  const originX = region.x + region.w * 0.08
  const originY = region.y + region.h * 0.16
  const toX = (value: number) => originX + value * scale
  const toY = (value: number) => originY + value * scale

  primitives.push(...viewTitle(originX, region.y + 6, "平面配置図"))
  primitives.push(rect("outline", toX(0), toY(0), roomWidth * scale, roomDepth * scale))
  primitives.push(rect("hidden", toX(0) - 1.2, toY(0) - 1.2, roomWidth * scale + 2.4, roomDepth * scale + 2.4))

  const pitch = parameters.gridPitch
  for (let x = pitch; x < roomWidth; x += pitch) {
    primitives.push(centerLineV(toX(x), toY(0) - 4, toY(roomDepth) + 4))
  }
  for (let y = pitch; y < roomDepth; y += pitch) {
    primitives.push(centerLineH(toY(y), toX(0) - 4, toX(roomWidth) + 4))
  }

  const columns = Math.max(1, Math.round(parameters.columns))
  const rows = Math.max(1, Math.round(parameters.rows))
  const blockWidth = columns * parameters.machineWidth + (columns - 1) * parameters.aisleWidth
  const blockDepth = rows * parameters.machineDepth + (rows - 1) * parameters.aisleWidth
  const startX = (roomWidth - blockWidth) / 2
  const startY = (roomDepth - blockDepth) / 2

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = startX + column * (parameters.machineWidth + parameters.aisleWidth)
      const y = startY + row * (parameters.machineDepth + parameters.aisleWidth)
      const label = `M-${String(row * columns + column + 1).padStart(2, "0")}`
      primitives.push(
        rect("hidden", toX(x - parameters.clearance), toY(y - parameters.clearance), (parameters.machineWidth + parameters.clearance * 2) * scale, (parameters.machineDepth + parameters.clearance * 2) * scale),
      )
      primitives.push(rect("outline", toX(x), toY(y), parameters.machineWidth * scale, parameters.machineDepth * scale))
      primitives.push(line("outline", { x: toX(x), y: toY(y) }, { x: toX(x + parameters.machineWidth), y: toY(y + parameters.machineDepth) }))
      primitives.push(
        text("note", toX(x + parameters.machineWidth / 2), toY(y + parameters.machineDepth / 2) + 1.2, label, { size: 3.2, anchor: "middle" }),
      )
    }
  }

  primitives.push(...dimensionH(toX(0), toX(roomWidth), toY(roomDepth) + 16, `${mm(roomWidth)}`, toY(roomDepth)))
  primitives.push(...dimensionV(toY(0), toY(roomDepth), toX(0) - 14, `${mm(roomDepth)}`, toX(0)))
  if (columns > 1) {
    const gapStart = startX + parameters.machineWidth
    primitives.push(...dimensionH(toX(gapStart), toX(gapStart + parameters.aisleWidth), toY(startY) - 10, `通路 ${mm(parameters.aisleWidth)}`, toY(startY)))
  }
  primitives.push(
    text("note", toX(0), toY(roomDepth) + 26, `機器 ${columns * rows} 台 / 保守スペース ${mm(parameters.clearance)} mm（破線）`, { size: 3 }),
  )
  return primitives
}

export const DRAWING_TEMPLATES: Record<(typeof TEMPLATE_IDS)[number], DrawingTemplate> = {
  "surface-laptop-exterior": {
    id: "surface-laptop-exterior",
    name: "ノート PC 外観図（三面図）",
    summary: "筐体の外形・キーボード部・ヒンジ開き角を三面図で示す外観図。意匠と機構のレビュー用。",
    numberPrefix: "EX",
    parameters: LAPTOP_PARAMETERS,
    build: buildLaptop,
  },
  "horizontal-pump-assembly": {
    id: "horizontal-pump-assembly",
    name: "横形ポンプ総組立図",
    summary: "ベース・ケーシング・カップリング・モーターを side/plan で示す総組立図。据付寸法の確認用。",
    numberPrefix: "GA",
    parameters: PUMP_PARAMETERS,
    build: buildPump,
  },
  "generic-equipment-layout": {
    id: "generic-equipment-layout",
    name: "汎用機器配置図",
    summary: "建屋内の機器配置・通路幅・保守スペースを平面で示す配置図。レイアウト検討用。",
    numberPrefix: "LY",
    parameters: LAYOUT_PARAMETERS,
    build: buildLayout,
  },
}

export const TEMPLATE_LIST: DrawingTemplate[] = TEMPLATE_IDS.map((id) => DRAWING_TEMPLATES[id])

export function defaultParameters(templateId: (typeof TEMPLATE_IDS)[number]): Record<string, number> {
  const entries = DRAWING_TEMPLATES[templateId].parameters.map((def) => [def.key, def.default] as const)
  return Object.fromEntries(entries)
}

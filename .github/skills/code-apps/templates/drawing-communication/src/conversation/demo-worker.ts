/**
 * DEMO ワーカー（ローカル規則ベース）。
 *
 * Dataverse の要求 / 結果ワーカーが未構成のときに、非同期 UI と相関検査を実際に動かすための実装。
 * 生成しているのは **決め打ちの寸法規則の結果** であり、AI の応答ではない。
 * UI ではこの label / caution を必ず表示し、エージェント応答と誤認させないこと。
 */
import type { Annotation, AnnotationSeverity, Drawing } from "../drawing/drawing-schema.ts"
import type { ConversationTransport, TransportPoll } from "./conversation-transport.ts"
import type { TurnReceipt, TurnRequest, TurnResult, TurnScope } from "./conversation-contract.ts"
import { assertDrawing, hashDrawing } from "../drawing/drawing-schema.ts"
import { createAnnotation, nextAnnotationId } from "../drawing/drawing-factory.ts"
import { ConversationContractError } from "./conversation-contract.ts"

export const DEMO_LABEL = "DEMO ワーカー（ローカル規則ベース）"
export const DEMO_CAUTION = "Dataverse 未接続のため、決め打ちの寸法規則で候補を生成しています。AI エージェントの応答ではありません。"

export type DemoFinding = {
  title: string
  body: string
  severity: AnnotationSeverity
  at: { x: number; y: number }
  fix?: { key: string; value: number; label: string }
}

const ANCHORS = [
  { x: 96, y: 70 },
  { x: 250, y: 84 },
  { x: 130, y: 168 },
  { x: 286, y: 178 },
  { x: 190, y: 120 },
]

function anchor(index: number): { x: number; y: number } {
  return ANCHORS[index % ANCHORS.length]
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step
}

/** テンプレートごとの寸法規則。CAD 検証ではなく、レビュー観点の目安。 */
export function reviewDrawing(drawing: Drawing): DemoFinding[] {
  const p = drawing.parameters
  const findings: DemoFinding[] = []

  if (drawing.templateId === "surface-laptop-exterior") {
    if (p.keyboardWidth > p.bodyWidth - 24) {
      findings.push({
        title: "キーボード幅が本体幅に対して大きい",
        body: `本体幅 ${p.bodyWidth} mm に対しキーボード幅 ${p.keyboardWidth} mm です。側面剛性の確保に左右 12 mm 以上を残してください。`,
        severity: "major",
        at: anchor(findings.length),
        fix: { key: "keyboardWidth", value: round(p.bodyWidth - 30, 1), label: "キーボード幅" },
      })
    }
    if (p.touchpadDepth > p.bodyDepth * 0.45) {
      findings.push({
        title: "タッチパッド奥行がパームレストを圧迫",
        body: `本体奥行 ${p.bodyDepth} mm の 45% を超えています。誤操作とヒンジ側の強度を確認してください。`,
        severity: "minor",
        at: anchor(findings.length),
        fix: { key: "touchpadDepth", value: round(p.bodyDepth * 0.4, 1), label: "タッチパッド奥行" },
      })
    }
    if (p.closedHeight < 11) {
      findings.push({
        title: "閉時厚さが薄い",
        body: `閉時厚さ ${p.closedHeight} mm です。放熱経路と天面のたわみを確認してください。`,
        severity: "minor",
        at: anchor(findings.length),
      })
    }
  }

  if (drawing.templateId === "horizontal-pump-assembly") {
    const minShaft = p.casingDiameter / 2 + 40
    if (p.shaftCenterHeight < minShaft) {
      findings.push({
        title: "軸心高さが低くケーシングがベースに干渉",
        body: `ケーシング外径 ${p.casingDiameter} mm に対し軸心高さ ${p.shaftCenterHeight} mm です。${Math.ceil(minShaft)} mm 以上を確保してください。`,
        severity: "major",
        at: anchor(findings.length),
        fix: { key: "shaftCenterHeight", value: round(p.casingDiameter / 2 + 60, 5), label: "軸心高さ" },
      })
    }
    const requiredLength = p.motorLength + p.couplingGap + p.casingDiameter * 1.6
    if (p.baseLength < requiredLength) {
      findings.push({
        title: "ベース長さが不足",
        body: `ポンプ・カップリング・モーターの合計 ${Math.ceil(requiredLength)} mm に対しベース長さ ${p.baseLength} mm です。`,
        severity: "major",
        at: anchor(findings.length),
        fix: { key: "baseLength", value: Math.min(2500, round(requiredLength + 120, 10)), label: "ベース長さ" },
      })
    }
    if (p.dischargeDN >= p.suctionDN) {
      findings.push({
        title: "吐出口径が吸込口径以上",
        body: `吸込 DN${p.suctionDN} / 吐出 DN${p.dischargeDN} です。一般的な横形ポンプでは吸込側を大きくします。`,
        severity: "minor",
        at: anchor(findings.length),
        fix: { key: "dischargeDN", value: Math.max(40, round(p.suctionDN * 0.7, 5)), label: "吐出口径" },
      })
    }
  }

  if (drawing.templateId === "generic-equipment-layout") {
    const columns = Math.round(p.columns)
    const rows = Math.round(p.rows)
    const blockWidth = columns * p.machineWidth + (columns - 1) * p.aisleWidth
    const blockDepth = rows * p.machineDepth + (rows - 1) * p.aisleWidth
    if (blockWidth > p.roomWidth - p.clearance * 2) {
      findings.push({
        title: "機器列が室内幅に収まらない",
        body: `機器列 ${Math.ceil(blockWidth)} mm に対し室内幅 ${p.roomWidth} mm（保守スペース込みで ${Math.ceil(blockWidth + p.clearance * 2)} mm 必要）です。`,
        severity: "major",
        at: anchor(findings.length),
        fix: { key: "roomWidth", value: Math.min(40000, round(blockWidth + p.clearance * 2 + 500, 100)), label: "室内幅" },
      })
    }
    if (blockDepth > p.roomDepth - p.clearance * 2) {
      findings.push({
        title: "機器行が室内奥行に収まらない",
        body: `機器行 ${Math.ceil(blockDepth)} mm に対し室内奥行 ${p.roomDepth} mm です。`,
        severity: "major",
        at: anchor(findings.length),
        fix: { key: "roomDepth", value: Math.min(30000, round(blockDepth + p.clearance * 2 + 500, 100)), label: "室内奥行" },
      })
    }
    if (p.aisleWidth < 1200) {
      findings.push({
        title: "通路幅が搬送動線に対して狭い",
        body: `通路幅 ${p.aisleWidth} mm です。台車搬送を想定する場合 1200 mm 以上を推奨します。`,
        severity: "minor",
        at: anchor(findings.length),
        fix: { key: "aisleWidth", value: 1200, label: "通路幅" },
      })
    }
  }

  if (findings.length === 0) {
    findings.push({
      title: "寸法規則に抵触なし",
      body: "DEMO の寸法規則では指摘はありません。materials・公差・法規は判定対象外です。",
      severity: "info",
      at: anchor(0),
    })
  }
  return findings.slice(0, 3)
}

function withAnnotations(drawing: Drawing, findings: DemoFinding[], createdAt: string): Drawing {
  const annotations: Annotation[] = [...drawing.annotations]
  for (const finding of findings) {
    annotations.push(
      createAnnotation({
        id: nextAnnotationId(annotations),
        source: "ai",
        severity: finding.severity,
        title: finding.title,
        body: finding.body,
        at: finding.at,
        createdAt,
      }),
    )
  }
  return { ...drawing, annotations }
}

type DemoEntry = {
  request: TurnRequest
  drawing: Drawing
  acceptedAt: number
  stopped: boolean
}

export type DemoTransportOptions = {
  /** 送信時点の図面を取り出す。ハッシュが一致しない要求は受け付けない。 */
  resolveDrawing: (scope: TurnScope) => Drawing | null
  now?: () => number
  pendingMs?: number
  runningMs?: number
}

export function createDemoTransport(options: DemoTransportOptions): ConversationTransport {
  const entries = new Map<string, DemoEntry>()
  const now = options.now ?? (() => Date.now())
  const pendingMs = options.pendingMs ?? 700
  const runningMs = options.runningMs ?? 2200

  function statusOf(entry: DemoEntry): "pending" | "running" | "completed" {
    const elapsed = now() - entry.acceptedAt
    if (elapsed < pendingMs) return "pending"
    if (elapsed < runningMs) return "running"
    return "completed"
  }

  function buildResult(entry: DemoEntry): TurnResult {
    const completedAt = new Date(now()).toISOString()
    const base = {
      conversationId: entry.request.conversationId,
      turnId: entry.request.turnId,
      version: entry.request.version,
      baseHash: entry.request.baseHash,
      workerKind: "demo" as const,
      completedAt,
    }

    if (entry.request.operation === "explain-drawing") {
      const lines = Object.entries(entry.drawing.parameters)
        .slice(0, 6)
        .map(([key, value]) => `${key}=${value}`)
        .join(" / ")
      return {
        ...base,
        status: "completed",
        summary: `【DEMO】${entry.drawing.titleBlock.title} は ${entry.drawing.annotations.length} 件の注釈を持ちます。主要寸法: ${lines}。図面の解釈は設計者が確認してください。`,
        candidateJson: null,
        error: null,
      }
    }

    const findings = reviewDrawing(entry.drawing)
    let candidate = withAnnotations(entry.drawing, findings, completedAt)

    if (entry.request.operation === "propose-dimension-change") {
      const fix = findings.find((finding) => finding.fix)?.fix
      if (!fix) {
        return {
          ...base,
          status: "completed",
          summary: "【DEMO】寸法規則に抵触がないため、変更候補はありません。",
          candidateJson: null,
          error: null,
        }
      }
      candidate = { ...candidate, parameters: { ...candidate.parameters, [fix.key]: fix.value } }
    }

    try {
      assertDrawing(candidate)
    } catch (error) {
      return { ...base, status: "failed", summary: "候補 JSON が検証に失敗しました。", candidateJson: null, error: (error as Error).message }
    }

    return {
      ...base,
      status: "completed",
      summary: `【DEMO】指摘 ${findings.length} 件（${findings.map((finding) => finding.title).join(" / ")}）`,
      candidateJson: JSON.stringify(candidate),
      error: null,
    }
  }

  return {
    kind: "demo",
    label: DEMO_LABEL,
    caution: DEMO_CAUTION,

    async submit(request: TurnRequest): Promise<TurnReceipt> {
      if (entries.has(request.turnId)) throw new ConversationContractError("duplicate-turn")
      const drawing = options.resolveDrawing(request)
      if (!drawing) throw new ConversationContractError("unknown-turn")
      if (hashDrawing(drawing) !== request.baseHash) throw new ConversationContractError("base-changed")
      const acceptedAt = now()
      entries.set(request.turnId, { request, drawing, acceptedAt, stopped: false })
      return {
        conversationId: request.conversationId,
        turnId: request.turnId,
        version: request.version,
        baseHash: request.baseHash,
        status: "pending",
        workerKind: "demo",
        acceptedAt: new Date(acceptedAt).toISOString(),
        updatedAt: new Date(acceptedAt).toISOString(),
      }
    },

    async poll(scope: TurnScope): Promise<TransportPoll> {
      const entry = entries.get(scope.turnId)
      if (!entry) throw new ConversationContractError("unknown-turn")
      const status = statusOf(entry)
      const receipt: TurnReceipt = {
        conversationId: entry.request.conversationId,
        turnId: entry.request.turnId,
        version: entry.request.version,
        baseHash: entry.request.baseHash,
        status,
        workerKind: "demo",
        acceptedAt: new Date(entry.acceptedAt).toISOString(),
        updatedAt: new Date(now()).toISOString(),
      }
      return { receipt, result: status === "completed" ? buildResult(entry) : null }
    },

    stopLocalWait(scope: TurnScope): void {
      const entry = entries.get(scope.turnId)
      if (entry) entry.stopped = true
    },
  }
}

import { PLANT_SAMPLES, plantParts } from "./plant-catalog.ts"

export type FailureRecord = {
  id: string
  modelId: string
  nodeId: string
  occurredOn: string
  location: string
  partId?: string
  title: string
  symptom: string
  cause: string | null
  status: "open" | "investigating" | "resolved"
}

export type RepairRecord = {
  id: string
  failureId: string
  performedOn: string
  action: string
  result: string
  status: "completed" | "planned"
}

export type MaintenanceHistory = {
  modelId: string
  nodeId: string
  source: "sample" | "unmapped"
  failures: FailureRecord[]
  repairs: RepairRecord[]
}

const MODEL = "demo-process-plant-r1"

const failures: FailureRecord[] = [
  { id: "DEMO-F-101", modelId: MODEL, nodeId: "p101", occurredOn: "2026-03-12", location: "駆動側軸受", title: "軸受振動の増加", symptom: "定期測定で振動速度 6.2 mm/s を記録。", cause: "分解点検で軸受外輪の摩耗を確認。", status: "resolved" },
  { id: "DEMO-F-102", modelId: MODEL, nodeId: "p101", occurredOn: "2026-06-18", location: "メカニカルシール", title: "軸封部の漏れ", symptom: "軸封部からの滴下を点検時に確認。", cause: "シール摺動面の損傷を確認。損傷の発生原因は未確定。", status: "resolved" },
  { id: "DEMO-F-103", modelId: MODEL, nodeId: "p101", occurredOn: "2026-09-02", location: "駆動側軸受", title: "振動の再上昇", symptom: "同一測定点で振動速度 4.8 mm/s を記録。", cause: null, status: "investigating" },
  { id: "DEMO-F-104", modelId: MODEL, nodeId: "p102", occurredOn: "2026-07-03", location: "カップリング", title: "試運転時の異音", symptom: "予備機の試運転で周期的な異音を確認。", cause: "点検でカップリングの芯ずれを確認。", status: "resolved" },
  { id: "DEMO-F-105", modelId: MODEL, nodeId: "hx101", occurredOn: "2026-04-22", location: "伝熱管", title: "熱交換性能の低下", symptom: "同一流量条件で出口温度が以前より低下。", cause: "開放点検で伝熱管内の付着物を確認。", status: "resolved" },
  { id: "DEMO-F-106", modelId: MODEL, nodeId: "v101", occurredOn: "2026-08-20", location: "グランド部", title: "弁軸周辺のにじみ", symptom: "グランド部周辺に液のにじみを確認。", cause: null, status: "open" },
  { id: "DEMO-F-107", modelId: MODEL, nodeId: "tk101", occurredOn: "2026-02-05", location: "液位計取付部", title: "液位表示の不安定", symptom: "液位表示に断続的な変動が発生。", cause: "取付部の点検で端子接触不良を確認。", status: "resolved" },
]

const repairs: RepairRecord[] = [
  { id: "DEMO-R-101", failureId: "DEMO-F-101", performedOn: "2026-03-14", action: "駆動側軸受を交換し、芯出しを実施。", result: "試運転で振動速度 1.6 mm/s を記録。", status: "completed" },
  { id: "DEMO-R-102", failureId: "DEMO-F-102", performedOn: "2026-06-19", action: "メカニカルシールを交換。", result: "試運転時に目視で漏れがないことを確認。", status: "completed" },
  { id: "DEMO-R-103", failureId: "DEMO-F-103", performedOn: "2026-09-10", action: "振動測定点の再確認および軸受部の点検を予定。", result: "未実施。再発原因・処置は未確定。", status: "planned" },
  { id: "DEMO-R-104", failureId: "DEMO-F-104", performedOn: "2026-07-04", action: "カップリングの芯出しを実施。", result: "試運転で異音の解消を確認。", status: "completed" },
  { id: "DEMO-R-105", failureId: "DEMO-F-105", performedOn: "2026-04-25", action: "伝熱管の洗浄および点検を実施。", result: "同一流量条件で出口温度の回復を確認。", status: "completed" },
  { id: "DEMO-R-106", failureId: "DEMO-F-106", performedOn: "2026-09-11", action: "グランド部の状態確認と処置判断を予定。", result: "未実施。", status: "planned" },
  { id: "DEMO-R-107", failureId: "DEMO-F-107", performedOn: "2026-02-06", action: "液位計端子の接続を修正。", result: "点検時に表示の安定を確認。", status: "completed" },
]

for (const record of failures) {
  const node = PLANT_SAMPLES[0].nodes.find((candidate) => candidate.id === record.nodeId)
  record.partId = node ? plantParts(node).find((part) => part.name === record.location)?.id : undefined
}

for (const [sampleIndex, sample] of PLANT_SAMPLES.entries()) {
  if (sampleIndex === 0) continue
  for (const [nodeIndex, node] of sample.nodes.entries()) {
    const parts = plantParts(node)
    const count = (nodeIndex * 3 + sampleIndex * 2) % 7
    for (let occurrence = 0; occurrence < count; occurrence++) {
      const part = parts[occurrence % parts.length]
      const id = `${sample.code}-F-${node.id}-${occurrence + 1}`
      const resolved = occurrence < count - 1
      failures.push({ id, modelId: sample.id, nodeId: node.id, partId: part.id, location: part.name,
        occurredOn: `2026-${String(occurrence + 2).padStart(2, "0")}-10`, title: `${part.name}の状態異常`,
        symptom: `${part.name}の定期点検で前回記録と異なる状態を確認（サンプル記録 ${occurrence + 1}）。`,
        cause: resolved ? "点検記録で部品の摩耗を確認。" : null, status: resolved ? "resolved" : "investigating" })
      repairs.push({ id: `${sample.code}-R-${node.id}-${occurrence + 1}`, failureId: id,
        performedOn: resolved ? `2026-${String(occurrence + 2).padStart(2, "0")}-12` : "2026-09-12",
        action: resolved ? `${part.name}の対象部品を交換し確認点検を実施。` : `${part.name}の詳細点検を予定。`,
        result: resolved ? "点検時に異常の解消を確認（サンプル）。" : "未実施。原因と処置は未確定。", status: resolved ? "completed" : "planned" })
    }
  }
}

export type PlantInquiry = { id: string; modelId: string; nodeId: string; failureId: string; partId?: string; drawingId: string; title: string; openedOn: string; status: string; question: string; answer: string | null }
export const PLANT_INQUIRIES: PlantInquiry[] = failures.map((record) => ({
  id: `INQ-${record.id}`, modelId: record.modelId, nodeId: record.nodeId, failureId: record.id,
  partId: record.partId, drawingId: `${record.modelId}:${record.nodeId}:drawing`, title: `${record.title}の確認依頼`,
  openedOn: record.occurredOn, status: record.status === "resolved" ? "完了" : "対応中",
  question: `${record.symptom} 原因と対応結果の確認を依頼します。`,
  answer: record.status === "resolved" ? `原因: ${record.cause} 対応結果は紐づく修理記録を参照。` : null,
}))

export function inquiriesForEquipment(modelId: string, nodeId: string) {
  return PLANT_INQUIRIES.filter((record) => record.modelId === modelId && record.nodeId === nodeId)
}

export type HeatFilter = { from: string; to: string; unresolvedOnly: boolean }
export type EquipmentHeat = { nodeId: string; total: number; parts: Record<string, number>; unlocated: number }
export const HEAT_BANDS = [
  { minimum: 0, label: "0 件", color: "#a3adb5" },
  { minimum: 1, label: "1 件", color: "#f3cf54" },
  { minimum: 2, label: "2–3 件", color: "#ee8736" },
  { minimum: 4, label: "4 件以上", color: "#cc343d" },
] as const

export function heatColor(count: number) {
  return [...HEAT_BANDS].reverse().find((band) => count >= band.minimum)!.color
}

export function plantHeat(modelId: string, filter: HeatFilter): EquipmentHeat[] {
  const sample = PLANT_SAMPLES.find((candidate) => candidate.id === modelId)
  if (!sample) return []
  return sample.nodes.map((node) => {
    const records = failures.filter((record) => record.modelId === modelId && record.nodeId === node.id
      && (!filter.from || record.occurredOn >= filter.from) && (!filter.to || record.occurredOn <= filter.to)
      && (!filter.unresolvedOnly || record.status !== "resolved"))
    const parts: Record<string, number> = {}
    let unlocated = 0
    for (const record of records) {
      if (record.partId) parts[record.partId] = (parts[record.partId] ?? 0) + 1
      else unlocated++
    }
    return { nodeId: node.id, total: records.length, parts, unlocated }
  })
}

export function getPlantMaintenance(modelId: string, nodeId: string, partId?: string): MaintenanceHistory {
  const selectedFailures = failures.filter((record) => record.modelId === modelId && record.nodeId === nodeId && (!partId || record.partId === partId))
    .sort((first, second) => second.occurredOn.localeCompare(first.occurredOn))
  const ids = new Set(selectedFailures.map((record) => record.id))
  return {
    modelId, nodeId, source: PLANT_SAMPLES.some((sample) => sample.id === modelId) ? "sample" : "unmapped",
    failures: selectedFailures,
    repairs: repairs.filter((record) => ids.has(record.failureId)).sort((first, second) => second.performedOn.localeCompare(first.performedOn)),
  }
}

/** 未解決（対応中・未着手）の故障だけを新しい順で返す。modelId 未指定なら全プラント横断。 */
export function unresolvedFailures(modelId?: string): FailureRecord[] {
  return failures
    .filter((record) => record.status !== "resolved" && (!modelId || record.modelId === modelId))
    .sort((first, second) => second.occurredOn.localeCompare(first.occurredOn))
}

export function findFailure(failureId: string): FailureRecord | null {
  return failures.find((record) => record.id === failureId) ?? null
}

export function repairsForFailure(failureId: string): RepairRecord[] {
  return repairs
    .filter((record) => record.failureId === failureId)
    .sort((first, second) => second.performedOn.localeCompare(first.performedOn))
}

export function inquiriesForFailure(failureId: string): PlantInquiry[] {
  return PLANT_INQUIRIES.filter((record) => record.failureId === failureId)
}

export function maintenanceCounts(history: MaintenanceHistory) {
  return {
    failures: history.failures.length,
    unresolved: history.failures.filter((record) => record.status !== "resolved").length,
    completed: history.repairs.filter((record) => record.status === "completed").length,
    planned: history.repairs.filter((record) => record.status === "planned").length,
  }
}

export function maintenanceInput(history: MaintenanceHistory) {
  if (!history.failures.length) throw new Error("要約対象の故障履歴がありません。")
  if (history.failures.some((record) => record.nodeId !== history.nodeId || record.modelId !== history.modelId)) throw new Error("別設備の履歴が含まれています。")
  const ids = new Set(history.failures.map((record) => record.id))
  if (history.repairs.some((record) => !ids.has(record.failureId))) throw new Error("修理履歴の参照先が一致しません。")
  const input = JSON.stringify(history)
  if (input.length > 40000) throw new Error("履歴が多すぎます。要約対象期間を絞り込んでください。")
  return input
}

export type MaintenanceSummary = {
  overview: string
  findings: { text: string; sourceIds: string[] }[]
  unresolved: { text: string; sourceIds: string[] }[]
}

export function parseMaintenanceSummary(value: unknown, history: MaintenanceHistory): MaintenanceSummary {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value
  if (!parsed || typeof parsed !== "object") throw new Error("AI 要約の形式が不正です。")
  const data = parsed as Record<string, unknown>
  const ids = new Set([...history.failures, ...history.repairs].map((record) => record.id))
  const validateItems = (items: unknown) => {
    if (!Array.isArray(items) || items.length > 20) throw new Error("AI 要約の項目が不正です。")
    return items.map((item: unknown) => {
      if (!item || typeof item !== "object") throw new Error("AI 要約の項目が不正です。")
      const entry = item as Record<string, unknown>
      if (typeof entry.text !== "string" || !entry.text.trim() || entry.text.length > 2000 || !Array.isArray(entry.sourceIds) || !entry.sourceIds.length || !entry.sourceIds.every((id): id is string => typeof id === "string" && ids.has(id))) throw new Error("AI 要約に参照できない出典が含まれています。")
      return { text: entry.text, sourceIds: entry.sourceIds as string[] }
    })
  }
  if (typeof data.overview !== "string" || !data.overview.trim() || data.overview.length > 2000) throw new Error("AI 要約の概要が不正です。")
  const findings = validateItems(data.findings)
  if (!findings.length) throw new Error("AI 要約に根拠がありません。")
  return { overview: data.overview, findings, unresolved: validateItems(data.unresolved) }
}
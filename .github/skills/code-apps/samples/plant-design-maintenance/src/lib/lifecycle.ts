import type { IncidentRecord, KnowledgeRecord } from "@/data/kb-repository"

export type LifecycleKind = "incident" | "knowledge"

export type LifecycleStageId =
  | "intake"
  | "triage"
  | "resolved"
  | "draft"
  | "review"
  | "approved"
  | "published"

export type LifecycleTone = "sky" | "blue" | "indigo" | "amber" | "violet" | "emerald" | "teal"

export type LifecycleStage = {
  id: LifecycleStageId
  label: string
  kind: LifecycleKind
  /** 矢羽の下に出す一行説明 */
  caption: string
  tone: LifecycleTone
  matchIncident?: (incident: IncidentRecord) => boolean
  matchKnowledge?: (knowledge: KnowledgeRecord) => boolean
}

/**
 * 問い合わせ 3 段階 → ナレッジ 4 段階の一本道。
 * ナレッジ側の 4 段階は互いに排他なので、件数の合計がナレッジ総数と一致する。
 */
export const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    id: "intake",
    label: "受付",
    kind: "incident",
    caption: "起票されたが未着手",
    tone: "sky",
    matchIncident: (i) => i.status === "未対応",
  },
  {
    id: "triage",
    label: "対応中",
    kind: "incident",
    caption: "担当者が調査・回答中",
    tone: "blue",
    matchIncident: (i) => i.status === "対応中",
  },
  {
    id: "resolved",
    label: "解決済み",
    kind: "incident",
    caption: "クローズ済み。ナレッジ化の母集団",
    tone: "indigo",
    matchIncident: (i) => i.status === "完了",
  },
  {
    id: "draft",
    label: "ナレッジ草案",
    kind: "knowledge",
    caption: "AI が生成し、承認待ち",
    tone: "amber",
    matchKnowledge: (k) => k.status === "未承認",
  },
  {
    id: "review",
    label: "要確認",
    kind: "knowledge",
    caption: "専門家が差し戻した状態",
    tone: "violet",
    matchKnowledge: (k) => k.status === "要確認",
  },
  {
    id: "approved",
    label: "承認済み",
    kind: "knowledge",
    caption: "社内限定で利用可能",
    tone: "emerald",
    matchKnowledge: (k) => k.status === "承認済み" && k.visibility !== "公開可",
  },
  {
    id: "published",
    label: "公開",
    kind: "knowledge",
    caption: "社外提示まで許可済み",
    tone: "teal",
    matchKnowledge: (k) => k.status === "承認済み" && k.visibility === "公開可",
  },
]

export function stageIncidents(stage: LifecycleStage, incidents: IncidentRecord[]): IncidentRecord[] {
  return stage.matchIncident ? incidents.filter(stage.matchIncident) : []
}

export function stageKnowledge(stage: LifecycleStage, knowledge: KnowledgeRecord[]): KnowledgeRecord[] {
  return stage.matchKnowledge ? knowledge.filter(stage.matchKnowledge) : []
}

export function stageCount(
  stage: LifecycleStage,
  incidents: IncidentRecord[],
  knowledge: KnowledgeRecord[],
): number {
  return stage.kind === "incident"
    ? stageIncidents(stage, incidents).length
    : stageKnowledge(stage, knowledge).length
}

export function getStage(id: LifecycleStageId): LifecycleStage {
  return LIFECYCLE_STAGES.find((s) => s.id === id) ?? LIFECYCLE_STAGES[0]
}

export type LifecycleSummary = {
  incidentTotal: number
  knowledgeTotal: number
  /** 解決済み問い合わせのうちナレッジ化されたものの割合 */
  conversionRate: number | null
  publishedRate: number | null
}

export function summarizeLifecycle(
  incidents: IncidentRecord[],
  knowledge: KnowledgeRecord[],
): LifecycleSummary {
  const closed = incidents.filter((i) => i.status === "完了")
  const converted = closed.filter((i) => i.knowledgeGenerated)
  const published = knowledge.filter((k) => k.status === "承認済み" && k.visibility === "公開可")

  return {
    incidentTotal: incidents.length,
    knowledgeTotal: knowledge.length,
    conversionRate: closed.length > 0 ? (converted.length / closed.length) * 100 : null,
    publishedRate: knowledge.length > 0 ? (published.length / knowledge.length) * 100 : null,
  }
}

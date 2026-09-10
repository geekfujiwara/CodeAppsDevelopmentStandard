import { plantAgentQuickReplies } from "./plant-agent-quick-replies.ts"
import type { PlantAgentSelection } from "./plant-agent-contract.ts"

export type PlantWaitStep = { title: string; service: string; tool: string }
export type PlantWaitPlan = { title: string; steps: readonly PlantWaitStep[] }

const index: PlantWaitStep = { title: "設備・資料の対応確認", service: "Dataverse MCP", tool: "read_query" }
const drawing: PlantWaitStep = { title: "図面ページの確認", service: "図面 MCP", tool: "get_drawing_page" }
const document: PlantWaitStep = { title: "設計文書の確認", service: "図面 MCP", tool: "get_document_text" }
const failure: PlantWaitStep = { title: "故障履歴の検索", service: "故障 MCP", tool: "search_failure_records" }
const countermeasure: PlantWaitStep = { title: "故障・対策の詳細確認", service: "故障 MCP", tool: "get_failure_record" }
const answer: PlantWaitStep = { title: "根拠と回答の整理", service: "AI エージェント", tool: "" }
const plans: Record<string, PlantWaitPlan> = {
  image: { title: "図面画像", steps: [
    { title: "設備・資料の対応確認", service: "Dataverse", tool: "ListRecordsWithOrganization" },
    { title: "PDFの指定ページを画像化", service: "Azure Files / Functions", tool: "GetIndexedDrawingPageImage" },
    { title: "図面番号・改訂・ページの確認", service: "画像ビューアー", tool: "" },
  ] },
  overview: { title: "設備の調査", steps: [index, drawing, document, answer] },
  drawings: { title: "図面・設計資料", steps: [index, drawing, document, answer] },
  failures: { title: "故障の調査", steps: [index, failure, countermeasure, answer] },
  maintenance: { title: "保守の調査", steps: [index, document, failure, countermeasure, answer] },
  evidence: { title: "根拠の比較", steps: [index, drawing, document, failure, answer] },
  general: { title: "回答の準備", steps: [
    { title: "質問と対象の確認", service: "AI エージェント", tool: "" },
    { title: "必要な情報の検討", service: "AI エージェント", tool: "" }, answer,
  ] },
}

export function plantWaitPlan(selection: PlantAgentSelection, question: string, design = false): PlantWaitPlan {
  if (!design) {
    for (const group of plantAgentQuickReplies(selection).groups) {
      const reply = group.replies.find(candidate => candidate.text === question.trim())
      if (reply) return plans[reply.title === "図面画像" ? "image" : group.id]
    }
  }
  return plans.general
}

export function waitPlanStep(plan: PlantWaitPlan, elapsed: number): number {
  const seconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
  return Math.min(Math.floor(seconds / 14), plan.steps.length - 1)
}
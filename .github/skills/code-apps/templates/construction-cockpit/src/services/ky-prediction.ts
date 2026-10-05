import { DataverseService } from "@/lib/dataverse-client"
import { ConstructionService, type Knowledge, type WorkType } from "@/services/construction-service"
import {
  KY_PREDICTION_STATUS,
  rankKnowledge,
  requestKyPrediction,
  type KyAiOptions,
  type KyPredictionPort,
  type PredictionResult,
  type RiskPrediction,
} from "@/lib/ky-ai"

export type { PredictionResult, RiskPrediction, KyPredictionStage } from "@/lib/ky-ai"

const WEATHER: Record<string, string> = { "100000000": "晴れ", "100000001": "曇り", "100000002": "雨", "100000003": "雪", "100000004": "強風" }
/** VITE_KY_AI=off で AI を使わず、過去事例の検索だけで表示する（クレジットを使わない） */
const AI_ENABLED = (import.meta.env.VITE_KY_AI ?? "agent") !== "off"

const text = (row: Record<string, unknown>, key: string) => String(row[key] ?? "")

const dataversePort: KyPredictionPort = {
  async create({ requestKey, input, prompt, name, projectId, workTypeId }) {
    await DataverseService.create("${PUBLISHER_PREFIX}_kyprediction", {
      ${PUBLISHER_PREFIX}_name: name, ${PUBLISHER_PREFIX}_requestkey: requestKey, ${PUBLISHER_PREFIX}_input: input, ${PUBLISHER_PREFIX}_prompt: prompt,
      ${PUBLISHER_PREFIX}_predictionstatus: KY_PREDICTION_STATUS.pending,
      ...(projectId ? { "${PUBLISHER_PREFIX}_project@odata.bind": `/${PUBLISHER_PREFIX}_projects(${projectId})` } : {}),
      ...(workTypeId ? { "${PUBLISHER_PREFIX}_worktype@odata.bind": `/${PUBLISHER_PREFIX}_worktypes(${workTypeId})` } : {}),
    })
    // 作成応答から ID を取れない場合に備え、要求キー（UUID）で読み戻す
    const rows = await DataverseService.list("${PUBLISHER_PREFIX}_kyprediction", ["${PUBLISHER_PREFIX}_kypredictionid"], `${PUBLISHER_PREFIX}_requestkey eq '${requestKey}'`)
    if (rows.length !== 1) throw new Error("作成した予測要求を特定できません。")
    return text(rows[0], "${PUBLISHER_PREFIX}_kypredictionid")
  },
  async read(id) {
    const rows = await DataverseService.list("${PUBLISHER_PREFIX}_kyprediction", ["${PUBLISHER_PREFIX}_predictionstatus", "${PUBLISHER_PREFIX}_result", "${PUBLISHER_PREFIX}_error"], `${PUBLISHER_PREFIX}_kypredictionid eq ${id}`)
    const row = rows[0]
    return row ? { id, status: Number(row.${PUBLISHER_PREFIX}_predictionstatus ?? 0), result: text(row, "${PUBLISHER_PREFIX}_result"), error: text(row, "${PUBLISHER_PREFIX}_error") } : undefined
  },
}

/** 過去事例（同じ工種のナレッジ）から危険を挙げる。AI が使えないときの代替表示（クレジットを使わない） */
function fallback(related: Knowledge[], workTypeName: string, reason?: string): PredictionResult {
  const risks = related.slice(0, 3).map((item, index): RiskPrediction => ({
    title: item.name,
    description: item.event,
    countermeasure: item.lesson,
    level: index === 0 ? "高" : "中",
    sourceKnowledgeTitles: [item.name],
  }))
  return {
    source: "fallback",
    reason,
    risks: risks.length ? risks : [{
      title: `${workTypeName}の一般的な安全確認`,
      description: "関連する過去事例が見つかりませんでした。作業範囲と周囲の安全を確認してください。",
      countermeasure: "作業前ミーティングと指差し確認を実施してください。",
      level: "中",
      sourceKnowledgeTitles: [],
    }],
  }
}

export async function predictKyRisks(input: {
  workTypeId: string
  workDetail: string
  weather: string
  equipment: string
  projectId?: string
}, workTypes: WorkType[], knowledge?: Knowledge[], options: KyAiOptions & { useAi?: boolean } = {}): Promise<PredictionResult> {
  const rows = knowledge ?? await ConstructionService.knowledge()
  const workTypeName = workTypes.find((item) => item.id === input.workTypeId)?.name ?? "選択した工種"
  const weather = WEATHER[input.weather] ?? input.weather
  const query = `${input.workDetail} ${weather} ${input.equipment}`
  const sameWorkType = rows.filter((item) => item.workTypeId === input.workTypeId)
  const ranked = rankKnowledge(sameWorkType, input.workTypeId, query)
  const related = [...ranked, ...sameWorkType.filter((item) => !ranked.includes(item))]
  if (!AI_ENABLED || options.useAi === false) return fallback(related, workTypeName, AI_ENABLED ? undefined : "AI 連携が無効に設定されています。")

  // AI には同じ工種に加えて、他工種でも語が一致する事例を渡す（工種をまたいだ教訓を活かす）
  const context = rankKnowledge(rows, input.workTypeId, `${query} ${workTypeName}`)
  const result = await requestKyPrediction(dataversePort, {
    workType: workTypeName, workDetail: input.workDetail, weather, equipment: input.equipment,
    knowledge: context.map((item) => ({ title: item.name, event: item.event, lesson: item.lesson })),
  }, {
    requestKey: crypto.randomUUID(),
    name: `KY 予測 ${new Date().toLocaleDateString("ja-JP")} ${workTypeName}`.slice(0, 200),
    projectId: input.projectId, workTypeId: input.workTypeId || undefined,
  }, options)
  if (result.ok) return { source: "ai", risks: result.risks, droppedSources: result.droppedSources }
  return fallback(related, workTypeName, result.reason)
}

import { ConstructionService, type Knowledge, type WorkType } from "@/services/construction-service"

export type RiskPrediction = {
  title: string
  description: string
  countermeasure: string
  level: "高" | "中" | "低"
  sourceKnowledgeTitles: string[]
}

export type PredictionResult = { risks: RiskPrediction[]; source: "ai" | "fallback" }

const normalize = (value: string) => value.toLocaleLowerCase("ja")

export async function predictKyRisks(input: {
  workTypeId: string
  workDetail: string
  weather: string
  equipment: string
}, workTypes: WorkType[], knowledge?: Knowledge[]): Promise<PredictionResult> {
  const rows = knowledge ?? await ConstructionService.knowledge()
  const terms = normalize(`${input.workDetail} ${input.weather} ${input.equipment}`).split(/[\s、,]+/).filter(Boolean)
  const matches = rows
    .filter((item) => item.workTypeId === input.workTypeId)
    .map((item) => ({
      item,
      score: terms.reduce((score, term) => score + (normalize(`${item.name} ${item.event} ${item.keywords}`).includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const workType = workTypes.find((item) => item.id === input.workTypeId)?.name ?? "選択した工種"
  return {
    source: "fallback",
    risks: matches.map(({ item }, index): RiskPrediction => ({
      title: item.name,
      description: item.event,
      countermeasure: item.lesson,
      level: index === 0 ? "高" : "中",
      sourceKnowledgeTitles: [item.name],
    })).concat(matches.length ? [] : [{
      title: `${workType}の一般的な安全確認`,
      description: "関連する過去事例が見つかりませんでした。作業範囲と周囲の安全を確認してください。",
      countermeasure: "作業前ミーティングと指差し確認を実施してください。",
      level: "中" as const,
      sourceKnowledgeTitles: [],
    }]).slice(0, 3),
  }
}

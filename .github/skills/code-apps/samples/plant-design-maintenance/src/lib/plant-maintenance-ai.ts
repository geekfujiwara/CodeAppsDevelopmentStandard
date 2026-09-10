import { MicrosoftDataverseService } from "@/integrations/connectors"
import { maintenanceInput, parseMaintenanceSummary, type MaintenanceHistory } from "@/data/plant-maintenance"

const organization = import.meta.env.VITE_DATAVERSE_URL?.trim() ?? ""
const modelId = import.meta.env.VITE_PLANT_MAINTENANCE_PROMPT_ID?.trim() ?? ""

export function maintenanceAiConfigured() {
  return !!organization && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modelId)
}

export async function summarizePlantMaintenance(history: MaintenanceHistory) {
  if (!maintenanceAiConfigured()) throw new Error("AI 要約の接続が未設定です。")
  const input = maintenanceInput(history)
  const result = await MicrosoftDataverseService.PerformBoundActionWithOrganization(
    organization, "msdyn_aimodels", "Microsoft.Dynamics.CRM.Predict", modelId,
    { version: "2.0", source: "PowerApps", requestv2: { "@odata.type": "Microsoft.Dynamics.CRM.expando", history_json: input } },
  )
  if (!result.success) throw new Error("AI 要約を取得できませんでした。接続・プロンプトの権限・AI 容量を確認してください。")
  const data = result.data
  const response = data?.responsev2
  if (!response || typeof response !== "object") throw new Error("AI 応答に結果がありません。")
  const prediction = (response as Record<string, unknown>).predictionOutput
  if (!prediction || typeof prediction !== "object") throw new Error("AI 応答に要約がありません。")
  return parseMaintenanceSummary((prediction as Record<string, unknown>).text, history)
}
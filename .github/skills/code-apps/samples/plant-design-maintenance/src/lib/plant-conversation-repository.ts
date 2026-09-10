import { MicrosoftDataverseService } from "@/integrations/connectors"
import { getContext } from "@microsoft/power-apps/app"
import { listAll, str } from "@/data/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import type { PlantConversationRequest, PlantConversationResult, PlantConversationTransport } from "./plant-conversation-job"

export const PLANT_CONVERSATION_ENABLED = import.meta.env.VITE_PLANT_CONVERSATION_ENABLED === "true"
export const PLANT_KNOWLEDGE_CONVERSATION_ENABLED = PLANT_CONVERSATION_ENABLED
  && import.meta.env.VITE_PLANT_KNOWLEDGE_CONVERSATION_ENABLED === "true"
const organization = import.meta.env.VITE_DATAVERSE_URL?.trim() ?? ""
const field = (name: string) => `${PUBLISHER_PREFIX}_${name}`
const requests = field("kbplantrequest")
const results = field("kbplantresult")

async function available() {
  if (!PLANT_CONVERSATION_ENABLED || !organization) throw new Error("新しい会話の Workflow 接続は未有効化です。")
  const allowed = import.meta.env.VITE_PLANT_CONVERSATION_ALLOWED_OBJECT_ID?.trim().toLowerCase()
  const context = await getContext()
  if (!allowed || context.user.objectId?.toLowerCase() !== allowed) {
    throw new Error("設計チャットは指定された管理者アカウント専用です。")
  }
}

export const plantConversationTransport: PlantConversationTransport = {
  async submit(request) {
    await available()
    if (request.operation === "plant-knowledge" && !PLANT_KNOWLEDGE_CONVERSATION_ENABLED) {
      throw new Error("利用者権限付きの資料取得は未有効化です。")
    }
    const created = await MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json",
      organization, requests + "s", {
        [field("name")]: request.turnId,
        [field("turnid")]: request.turnId,
        [field("requestjson")]: JSON.stringify(request),
      })
    if (!created.success) throw new Error("要求の受付を確認できません。再送せず実行履歴を確認してください。")
    const rows = await listAll(requests + "s", { filter: `${field("turnid")} eq '${request.turnId}'`,
      select: [requests + "id", field("requestjson")], top: 2 })
    if (rows.length !== 1 || str(rows[0], field("requestjson")) !== JSON.stringify(request)) {
      throw new Error("受付済み要求の照合に失敗しました。再送せず実行履歴を確認してください。")
    }
    return { requestId: str(rows[0], requests + "id") ?? "" }
  },
  async read(requestId) {
    await available()
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("要求IDが不正です。")
    const rows = await listAll(results + "s", { filter: `_${field("requestid")}_value eq ${requestId}`,
      select: [field("resultjson")], top: 2 })
    if (rows.length > 1) throw new Error("結果が重複しています。")
    if (rows.length === 1) return JSON.parse(str(rows[0], field("resultjson")) ?? "null") as PlantConversationResult
    const accepted = await listAll(requests + "s", { filter: `${requests}id eq ${requestId}`, select: [field("requestjson")], top: 2 })
    if (accepted.length !== 1) throw new Error("要求を参照できません。")
    const request = JSON.parse(str(accepted[0], field("requestjson")) ?? "null") as PlantConversationRequest
    return { ...request, requestId, status: "pending" }
  },
}
import { getContext } from "@microsoft/power-apps/app"
import { MicrosoftCopilotStudioService } from "@/integrations/connectors"
import { parseAgentMessages, parseAgentReply, parseStartedConversationId } from "./plant-agent-contract"
import { PLANT_AGENT_SCHEMA } from "./plant-agent-config"
import { createPlantAgentWorkflowClient } from "./plant-agent-workflow"
import { PLANT_KNOWLEDGE_CONVERSATION_ENABLED, plantConversationTransport } from "./plant-conversation-repository"
import { detectPlantAuthentication, PlantAuthenticationRequiredError } from "./plant-agent-auth"
import type { PlantAgentProgress } from "./plant-agent-progress"

const workflowAgent = createPlantAgentWorkflowClient(plantConversationTransport, getPlantAgentContext)

export async function getPlantAgentContext() {
  if (import.meta.env.VITE_FEATURE_LIVE !== "true") throw new Error("サンプルの外部接続は無効です。")
  const context = await getContext()
  if (!context.user.objectId || !context.user.tenantId || !context.app.environmentId) {
    throw new Error("Power Apps の利用者を確認できません。")
  }
  return {
    principalKey: JSON.stringify([context.user.tenantId, context.user.objectId, context.app.environmentId]),
    environmentId: context.app.environmentId,
  }
}

async function executePlantAgent(message: string, environmentId: string, conversationId?: string) {
  const activeConversationId = conversationId ?? parseStartedConversationId(await MicrosoftCopilotStudioService.ExecuteCopilot(
    PLANT_AGENT_SCHEMA,
    { message, locale: "ja-JP" },
    undefined,
    environmentId,
  ))
  return MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
    PLANT_AGENT_SCHEMA,
    { message, locale: "ja-JP", notificationUrl: "https://notificationurlplaceholder" },
    activeConversationId,
    environmentId,
  )
}

// 会話開始トピックの発話を拾うため、質問を送る前に会話だけを開始する。
export async function startPlantAgentConversation(environmentId: string) {
  if (PLANT_KNOWLEDGE_CONVERSATION_ENABLED) {
    const context = await getPlantAgentContext()
    if (context.environmentId !== environmentId) throw new Error("利用者の環境が一致しません。")
    return { conversationId: crypto.randomUUID(), greeting: "" }
  }
  const started = await MicrosoftCopilotStudioService.ExecuteCopilot(
    PLANT_AGENT_SCHEMA,
    { message: "", locale: "ja-JP" },
    undefined,
    environmentId,
  )
  const conversationId = parseStartedConversationId(started)
  try {
    return { conversationId, greeting: parseAgentMessages(started).messages.join("\n\n") }
  } catch (error) {
    if (error instanceof PlantAuthenticationRequiredError) throw error
    return { conversationId, greeting: "" }
  }
}

export async function requestPlantAgent(message: string, environmentId: string, conversationId?: string, options?: {
  selection: string
  signal: AbortSignal
  isCurrent: () => boolean
  onProgress?: (progress: PlantAgentProgress) => void
}) {
  if (PLANT_KNOWLEDGE_CONVERSATION_ENABLED) {
    if (!conversationId || !options) throw new Error("新しい会話には会話IDと選択対象の照合が必要です。")
    return workflowAgent(message, environmentId, conversationId, { ...options, operation: "plant-knowledge" })
  }
  try {
    return parseAgentReply(await executePlantAgent(message, environmentId, conversationId))
  } catch (error) {
    throw detectPlantAuthentication(error) ?? error
  }
}

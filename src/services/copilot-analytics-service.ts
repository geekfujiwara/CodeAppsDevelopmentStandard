import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
import type { ConversationSummary, BotInfo, BotComponent } from "@/types/copilot-analytics";

function client() {
  return getClient(dataSourcesInfo);
}

export async function getConversationSummaries(): Promise<ConversationSummary[]> {
  const result = await client().retrieveMultipleRecordsAsync<ConversationSummary>(
    "geek_conversationsummaries",
    {
      select: [
        "geek_conversationsummaryid",
        "geek_name",
        "geek_transcriptid",
        "geek_botname",
        "geek_botid",
        "geek_starttime",
        "geek_outcome",
        "geek_channel",
        "geek_usermsgcount",
        "geek_botmsgcount",
        "geek_tooleventcount",
        "geek_durationsec",
        "geek_toolservers",
        "geek_firstusertext",
        "createdon",
      ],
      orderBy: ["geek_starttime desc"],
    },
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}

export async function getBots(): Promise<BotInfo[]> {
  const result = await client().retrieveMultipleRecordsAsync<BotInfo>(
    "bots",
    {
      select: ["botid", "name", "schemaname", "statecode", "publishedon", "createdon", "modifiedon"],
      orderBy: ["modifiedon desc"],
    },
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}

export async function getBotComponents(): Promise<BotComponent[]> {
  const result = await client().retrieveMultipleRecordsAsync<BotComponent>(
    "botcomponents",
    {
      select: [
        "botcomponentid",
        "name",
        "componenttype",
        "schemaname",
        "category",
        "description",
        "statecode",
        "_parentbotid_value",
        "_parentbotcomponentid_value",
        "createdon",
        "modifiedon",
      ],
      filter: "_parentbotcomponentid_value eq null",
      orderBy: ["componenttype asc", "name asc"],
    },
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}

export async function triggerSummaryRefresh(): Promise<{ status: string; message: string }> {
  const result = await client().executeAsync<
    Record<string, never>,
    { status?: string; message?: string }
  >({
    connectorOperation: {
      tableName: "RefreshSummaries",
      operationName: "Run",
      parameters: {},
    },
  });
  if (!result.success) throw result.error;
  return {
    status: result.data?.status ?? "unknown",
    message: result.data?.message ?? "同期リクエストを送信しました",
  };
}

export async function getTranscriptContent(transcriptId: string): Promise<string> {
  const result = await client().retrieveMultipleRecordsAsync<{ content: string }>(
    "conversationtranscripts",
    {
      select: ["content"],
      filter: `conversationtranscriptid eq '${transcriptId}'`,
      top: 1,
    },
  );
  if (!result.success) throw result.error;
  return result.data?.[0]?.content ?? "";
}

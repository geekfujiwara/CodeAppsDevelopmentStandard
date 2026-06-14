import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
import { PUBLISHER_PREFIX } from "@/config";
import type { ConversationSummary, BotInfo } from "@/types/copilot-analytics";

// テーブル名・フィールド名はパブリッシャープレフィックスから動的に構築する
const P = PUBLISHER_PREFIX;

function client() {
  return getClient(dataSourcesInfo);
}

export async function getConversationSummaries(): Promise<ConversationSummary[]> {
  const result = await client().retrieveMultipleRecordsAsync(
    `${P}_conversationsummaries`,
    {
      select: [
        `${P}_conversationsummaryid`,
        `${P}_name`,
        `${P}_transcriptid`,
        `${P}_botname`,
        `${P}_botid`,
        `${P}_starttime`,
        `${P}_outcome`,
        `${P}_channel`,
        `${P}_usermsgcount`,
        `${P}_botmsgcount`,
        `${P}_tooleventcount`,
        `${P}_durationsec`,
        `${P}_toolservers`,
        `${P}_firstusertext`,
        "createdon",
      ],
      orderBy: [`${P}_starttime desc`],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as ConversationSummary[];
}

export async function getBots(): Promise<BotInfo[]> {
  // bots は Dataverse システムテーブル — プレフィックス不要
  const result = await client().retrieveMultipleRecordsAsync(
    "bots",
    {
      select: ["botid", "name", "schemaname", "statecode", "publishedon", "createdon", "modifiedon"],
      orderBy: ["modifiedon desc"],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as BotInfo[];
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
  // conversationtranscripts は Dataverse システムテーブル — プレフィックス不要
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

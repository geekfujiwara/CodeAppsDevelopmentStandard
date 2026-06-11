/** Copilot Studio 会話サマリーの型定義 */

export interface ConversationSummary {
  geek_conversationsummaryid: string;
  geek_name: string;
  geek_transcriptid: string;
  geek_botname: string;
  geek_botid: string;
  geek_starttime: string;
  geek_outcome: number; // 100000000=Resolved, 100000001=Abandoned, 100000002=Escalated, 100000003=None
  geek_channel: string;
  geek_usermsgcount: number;
  geek_botmsgcount: number;
  geek_tooleventcount: number;
  geek_durationsec: number;
  geek_toolservers: string;
  geek_firstusertext: string;
  createdon: string;
}

export interface BotInfo {
  botid: string;
  name: string;
  schemaname: string;
  statecode: number;
  publishedon: string | null;
  createdon: string;
  modifiedon: string;
}

export interface BotComponent {
  botcomponentid: string;
  name: string;
  componenttype: number; // 9=Topic, 10=Topic localization, 15=GPT
  schemaname: string;
  category: string | null;
  description: string | null;
  statecode: number;
  _parentbotid_value: string;
  _parentbotcomponentid_value: string | null;
  createdon: string;
  modifiedon: string;
}

export const COMPONENT_TYPE_LABELS: Record<number, string> = {
  0: "Skill",
  1: "Dialog",
  2: "Trigger",
  3: "Language understanding",
  4: "Language generation",
  5: "Dialog schema",
  9: "トピック",
  10: "トピック多言語",
  15: "GPT プロンプト",
};

export const OUTCOME_LABELS: Record<number, string> = {
  100000000: "解決",
  100000001: "放棄",
  100000002: "エスカレーション",
  100000003: "なし",
};

export const OUTCOME_COLORS: Record<number, string> = {
  100000000: "hsl(142, 76%, 36%)",   // green
  100000001: "hsl(0, 84%, 60%)",     // red
  100000002: "hsl(38, 92%, 50%)",    // amber
  100000003: "hsl(220, 14%, 60%)",   // gray
};

/** チャット表示用に正規化した1アクティビティ */
export interface ChatActivity {
  id: string;
  kind: "message" | "event";
  role: "user" | "bot" | "tool";
  text: string;
  timestamp: number | null;
  toolName?: string;
}

/** transcript.content(JSON文字列)をチャット表示用の配列に変換 */
export function parseTranscriptActivities(contentJson: string): ChatActivity[] {
  let content: { activities?: unknown[] } = {};
  try {
    content = JSON.parse(contentJson || "{}");
  } catch {
    return [];
  }
  const acts = Array.isArray(content.activities) ? content.activities : [];
  const out: ChatActivity[] = [];

  acts.forEach((raw, i) => {
    const a = raw as Record<string, unknown>;
    const tms = typeof a.timestampMs === "number" ? a.timestampMs : null;
    const type = a.type;

    if (type === "message") {
      const text = typeof a.text === "string" ? a.text : "";
      if (!text.trim()) return;
      const from = a.from as { role?: number } | undefined;
      const role: ChatActivity["role"] = from?.role === 1 ? "user" : "bot";
      out.push({ id: String(a.id ?? `m${i}`), kind: "message", role, text, timestamp: tms });
    } else if (type === "event") {
      const name = typeof a.name === "string" ? a.name : "event";
      const val = (a.value as Record<string, unknown>) ?? {};
      const init = val.initializationResult as { serverInfo?: { name?: string } } | undefined;
      const srv = init?.serverInfo?.name;
      out.push({
        id: String(a.id ?? `e${i}`),
        kind: "event",
        role: "tool",
        text: srv ? `${name} · ${srv}` : name,
        timestamp: tms,
        toolName: srv ?? name,
      });
    }
  });

  return out;
}

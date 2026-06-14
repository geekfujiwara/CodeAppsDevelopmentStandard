/**
 * AI Builder Flow Service
 * Power Automate フロー (AI Builder プロンプト) を Code Apps SDK 経由で呼び出す。
 * executeAsync の connectorOperation は postMessage ベースのため CSP セーフ。
 */
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";

function client() {
  return getClient(dataSourcesInfo);
}

// ── 型定義 ──

interface FlowResult {
  airesult?: string;
}

export interface EmailDraftResult {
  subject: string;
  body: string;
}

export interface AppointmentSuggestion {
  days_from_now: number;
  time: string;
  reason: string;
  agenda: string;
}

export interface AppointmentResult {
  suggestions: AppointmentSuggestion[];
}

export interface NewsInsight {
  headline: string;
  summary: string;
  related_customers: string[];
  action: string;
  impact: "high" | "medium" | "low";
  category: string;
}

export interface TerritoryNewsResult {
  insights: NewsInsight[];
}

// ── JSON パース（AI Builder 出力の堅牢パース） ──

function parseAiJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  let text = raw.trim();
  // ```json ... ``` ストリップ
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    console.warn("[AI Flow] JSON parse failed:", text.slice(0, 100));
    return null;
  }
}

// ── フロー呼び出し ──

export async function generateSalesEmail(
  customerInfo: string,
  opportunityInfo: string,
  purpose: string,
): Promise<EmailDraftResult | null> {
  try {
    const result = await client().executeAsync<
      { text: string; text_1: string; text_2: string },
      FlowResult
    >({
      connectorOperation: {
        tableName: "GenerateSalesEmail",
        operationName: "Run",
        parameters: {
          text: customerInfo,
          text_1: opportunityInfo,
          text_2: purpose,
        },
      },
    });

    if (result.success && result.data?.airesult) {
      const parsed = parseAiJson<EmailDraftResult>(result.data.airesult);
      if (parsed?.subject && parsed?.body) {
        return parsed;
      }
      // フォールバック: テキスト全体を body に
      return { subject: "メール下書き", body: result.data.airesult };
    }
    console.warn("[AI Flow] GenerateSalesEmail failed:", result);
    return null;
  } catch (e) {
    console.error("[AI Flow] GenerateSalesEmail error:", e);
    return null;
  }
}

export async function suggestAppointment(
  customerInfo: string,
  activityHistory: string,
): Promise<AppointmentResult | null> {
  try {
    const result = await client().executeAsync<
      { text: string; text_1: string },
      FlowResult
    >({
      connectorOperation: {
        tableName: "SuggestAppointment",
        operationName: "Run",
        parameters: {
          text: customerInfo,
          text_1: activityHistory,
        },
      },
    });

    if (result.success && result.data?.airesult) {
      const parsed = parseAiJson<AppointmentResult>(result.data.airesult);
      if (parsed?.suggestions?.length) {
        return parsed;
      }
      return null;
    }
    console.warn("[AI Flow] SuggestAppointment failed:", result);
    return null;
  } catch (e) {
    console.error("[AI Flow] SuggestAppointment error:", e);
    return null;
  }
}

// ── Outlook フロー呼び出し ──

interface OutlookResult {
  result?: string;
  eventId?: string;
}

/**
 * Office 365 Outlook 経由でメールを送信する
 */
export async function sendOutlookEmail(
  to: string,
  subject: string,
  body: string,
): Promise<boolean> {
  try {
    const result = await client().executeAsync<
      { text: string; text_1: string; text_2: string },
      OutlookResult
    >({
      connectorOperation: {
        tableName: "SendOutlookEmail",
        operationName: "Run",
        parameters: {
          text: to,
          text_1: subject,
          text_2: body,
        },
      },
    });

    if (result.success) {
      return true;
    }
    console.warn("[Outlook Flow] SendOutlookEmail failed:", result);
    return false;
  } catch (e) {
    console.error("[Outlook Flow] SendOutlookEmail error:", e);
    return false;
  }
}

/**
 * Office 365 Outlook にカレンダーイベントを作成する
 */
export async function createOutlookEvent(
  subject: string,
  start: string,
  end: string,
  body: string,
  location: string,
): Promise<string | null> {
  try {
    const result = await client().executeAsync<
      { text: string; text_1: string; text_2: string; text_3: string; text_4: string },
      OutlookResult
    >({
      connectorOperation: {
        tableName: "CreateOutlookEvent",
        operationName: "Run",
        parameters: {
          text: subject,
          text_1: start,
          text_2: end,
          text_3: body || " ",
          text_4: location || " ",
        },
      },
    });

    if (result.success) {
      return result.data?.eventId ?? "created";
    }
    console.warn("[Outlook Flow] CreateOutlookEvent failed:", result);
    return null;
  } catch (e) {
    console.error("[Outlook Flow] CreateOutlookEvent error:", e);
    return null;
  }
}

// ── テリトリーニュースインサイト ──

// ── Outlook 予定取得 ──

export interface OutlookEvent {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string } };
}

/**
 * Office 365 Outlook から指定期間のカレンダー予定を取得する
 */
export async function getOutlookEvents(
  startDateTime: string,
  endDateTime: string,
): Promise<OutlookEvent[]> {
  try {
    const result = await client().executeAsync<
      { text: string; text_1: string },
      { events_json?: string }
    >({
      connectorOperation: {
        tableName: "GetOutlookEvents",
        operationName: "Run",
        parameters: {
          text: startDateTime,
          text_1: endDateTime,
        },
      },
    });

    if (result.success && result.data?.events_json) {
      try {
        const events = JSON.parse(result.data.events_json);
        return Array.isArray(events) ? events : [];
      } catch {
        console.warn("[Outlook Flow] events_json parse failed");
        return [];
      }
    }
    console.warn("[Outlook Flow] GetOutlookEvents failed:", result);
    return [];
  } catch (e) {
    console.error("[Outlook Flow] GetOutlookEvents error:", e);
    return [];
  }
}

/**
 * テリトリーポートフォリオに基づく業界ニュースインサイトを生成する
 */
export async function generateTerritoryNews(
  portfolioInfo: string,
): Promise<TerritoryNewsResult | null> {
  try {
    const result = await client().executeAsync<
      { text: string },
      FlowResult
    >({
      connectorOperation: {
        tableName: "GenerateTerritoryNews",
        operationName: "Run",
        parameters: {
          text: portfolioInfo,
        },
      },
    });

    if (result.success && result.data?.airesult) {
      const parsed = parseAiJson<TerritoryNewsResult>(result.data.airesult);
      if (parsed?.insights?.length) {
        return parsed;
      }
      return null;
    }
    console.warn("[AI Flow] GenerateTerritoryNews failed:", result);
    return null;
  } catch (e) {
    console.error("[AI Flow] GenerateTerritoryNews error:", e);
    return null;
  }
}

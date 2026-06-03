/**
 * Power Pages Web API (`/_api/`) クライアント
 *
 * 認証: ブラウザのセッション Cookie（same-origin）。Bearer トークン不要。
 * 書き込み (POST/PATCH/DELETE): anti-forgery token が必須。
 */
const BASE = "/_api";

const IS_DEV =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export interface ODataCollection<T> {
  value: T[];
  "@odata.count"?: number;
}

export class ApiAuthError extends Error {
  constructor(public status: number) {
    super(`Authentication required (${status})`);
    this.name = "ApiAuthError";
  }
}

/** anti-forgery token のキャッシュ */
let cachedToken: string | null = null;

async function getRequestVerificationToken(): Promise<string> {
  if (IS_DEV) return "dev-token";
  if (cachedToken) return cachedToken;

  const input = document.querySelector<HTMLInputElement>(
    'input[name="__RequestVerificationToken"]',
  );
  if (input?.value) {
    cachedToken = input.value;
    return cachedToken;
  }

  try {
    const res = await fetch("/_layout/tokenhtml", { credentials: "same-origin" });
    const html = await res.text();
    const match = html.match(/value="([^"]+)"/);
    if (match?.[1]) {
      cachedToken = match[1];
      return cachedToken;
    }
  } catch { /* fall through */ }
  return "";
}

function baseHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Prefer: 'odata.include-annotations="*"',
  };
}

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  // redirect: 'manual' returns opaque redirect (status 0) - means auth required
  if (res.type === "opaqueredirect" || res.status === 0) {
    console.error(`[API] ${path} → opaqueredirect (auth required)`);
    throw new ApiAuthError(302);
  }
  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    console.error(`[API] ${res.status} (${path}):`, body);
    throw new ApiAuthError(res.status);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`[API] ${res.status} (${path}):`, body);
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
  });
  return handleResponse<T>(res, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getRequestVerificationToken();
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      __RequestVerificationToken: token,
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res, path);
}

export async function apiPatch(path: string, body: unknown): Promise<void> {
  const token = await getRequestVerificationToken();
  const res = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      __RequestVerificationToken: token,
    },
    body: JSON.stringify(body),
  });
  await handleResponse<void>(res, path);
}

// ── インシデント型定義（実テーブルカラム名に準拠）──
export interface Incident {
  geek_incidentid: string;
  geek_name: string;
  geek_description?: string;
  geek_status?: number;
  geek_priority?: number;
  geek_category?: number;
  geek_resolution?: string;
  geek_resolvedon?: string;
  geek_ticketnumber?: string;
  createdon?: string;
  modifiedon?: string;
  // 報告者はカスタム列ではなくシステム列 CreatedBy を利用する
  _createdby_value?: string;
  "_createdby_value@OData.Community.Display.V1.FormattedValue"?: string;
  // lookup formatted values (Prefer: odata.include-annotations)
  "_geek_assignedtoid_value@OData.Community.Display.V1.FormattedValue"?: string;
  _geek_assignedtoid_value?: string;
  [key: string]: unknown;
}

export interface IncidentCreate {
  geek_name: string;
  geek_description?: string;
  geek_status?: number;
  geek_priority?: number;
  geek_category?: number;
  // 報告者は送信不要。作成時に CreatedBy がシステム自動設定される
}

// ── CRUD ──
const INCIDENT_SELECT =
  "geek_incidentid,geek_name,geek_description,geek_status,geek_priority,geek_category,geek_ticketnumber,geek_resolution,geek_resolvedon,_createdby_value,_geek_assignedtoid_value,createdon";

export async function getIncidents(): Promise<Incident[]> {
  const data = await apiGet<ODataCollection<Incident>>(
    `geek_incidents?$select=${INCIDENT_SELECT}&$orderby=createdon desc`,
  );
  return data.value;
}

export async function getIncident(id: string): Promise<Incident> {
  return apiGet<Incident>(
    `geek_incidents(${id})?$select=${INCIDENT_SELECT},modifiedon`,
  );
}

export async function createIncident(data: IncidentCreate): Promise<void> {
  await apiPost<void>("geek_incidents", data);
}

// ── ラベル定義 ──
export const statusLabels: Record<number, string> = {
  100000000: "新規",
  100000001: "対応中",
  100000002: "解決済",
  100000003: "クローズ",
};

export const statusStyles: Record<number, string> = {
  100000000: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  100000001: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  100000002: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  100000003: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

export const priorityLabels: Record<number, string> = {
  100000000: "低",
  100000001: "中",
  100000002: "高",
  100000003: "緊急",
};

export const priorityStyles: Record<number, string> = {
  100000000: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  100000001: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  100000002: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  100000003: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export const categoryLabels: Record<number, string> = {
  100000000: "PC",
  100000001: "サーバー",
  100000002: "プリンター",
  100000003: "ネットワーク機器",
  100000004: "モバイルデバイス",
  100000005: "ソフトウェア",
  100000006: "その他",
};

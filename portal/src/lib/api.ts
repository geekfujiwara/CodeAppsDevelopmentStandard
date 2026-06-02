// ── Power Pages Web API クライアント ──
const BASE = "/_api";

const REDIRECT_KEY = "__pp_login_redirect_ts";
function shouldRedirectToLogin(): boolean {
  const last = sessionStorage.getItem(REDIRECT_KEY);
  if (last && Date.now() - Number(last) < 10000) return false;
  sessionStorage.setItem(REDIRECT_KEY, String(Date.now()));
  return true;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE}/${path}`;
  console.log(`[API] ${init?.method ?? "GET"} ${url}`);

  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...init?.headers,
    },
  });

  if (res.type === "opaqueredirect" || res.status === 0) {
    console.warn("[API] Session expired (opaqueredirect)");
    if (shouldRedirectToLogin()) {
      window.location.href = "/Account/Login";
      return new Promise(() => {});
    }
    throw new Error("認証が必要です。ページを再読み込みしてください。");
  }

  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    console.error(`[API] ${res.status}:`, body);
    if (shouldRedirectToLogin()) {
      window.location.href = "/Account/Login";
      return new Promise(() => {});
    }
    throw new Error(`アクセスが拒否されました (${res.status})`);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[API] ${res.status}:`, body);
    throw new Error(`API ${res.status}: ${body}`);
  }

  console.log(`[API] ✓ ${res.status} ${url}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

// ── インシデント型定義 ──
export interface Incident {
  geek_incidentid: string;
  geek_title: string;
  geek_description?: string;
  geek_status?: number;
  geek_priority?: number;
  geek_assettype?: number;
  geek_reportedby?: string;
  geek_assignedto?: string;
  geek_resolvedon?: string;
  geek_resolution?: string;
  createdon?: string;
  modifiedon?: string;
  _createdby_value?: string;
}

export interface IncidentCreate {
  geek_title: string;
  geek_description?: string;
  geek_status?: number;
  geek_priority?: number;
  geek_assettype?: number;
  geek_reportedby?: string;
}

interface ODataResponse<T> {
  value: T[];
}

// ── CRUD ──
export async function getIncidents(): Promise<Incident[]> {
  const data = await apiFetch<ODataResponse<Incident>>(
    "geek_incidents?$select=geek_incidentid,geek_title,geek_description,geek_status,geek_priority,geek_assettype,geek_reportedby,geek_assignedto,geek_resolvedon,geek_resolution,createdon&$orderby=createdon desc",
  );
  return data.value;
}

export async function getIncident(id: string): Promise<Incident> {
  return apiFetch<Incident>(
    `geek_incidents(${id})?$select=geek_incidentid,geek_title,geek_description,geek_status,geek_priority,geek_assettype,geek_reportedby,geek_assignedto,geek_resolvedon,geek_resolution,createdon,modifiedon`,
  );
}

export async function createIncident(data: IncidentCreate): Promise<void> {
  await apiFetch<void>("geek_incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
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

export const assetTypeLabels: Record<number, string> = {
  100000000: "PC",
  100000001: "サーバー",
  100000002: "プリンター",
  100000003: "ネットワーク機器",
  100000004: "モバイルデバイス",
  100000005: "ソフトウェア",
  100000006: "その他",
};

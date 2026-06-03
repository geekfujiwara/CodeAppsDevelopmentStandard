/**
 * Power Pages Web API (`/_api/`) クライアント（デフォルト実装）
 *
 * Power Pages Code Site は静的 SPA として動作するため、Code Apps SDK
 * (`@microsoft/power-apps/data`) は使えない。Dataverse へのアクセスは
 * `/_api/` OData v4 エンドポイント経由で行う。
 *
 * 認証: ブラウザのセッション Cookie（same-origin）。Bearer トークンは不要。
 * 書き込み (POST/PATCH/DELETE): anti-forgery token が必須。
 *   → `/_layout/tokenhtml` から取得して `__RequestVerificationToken` ヘッダーに付与。
 *
 * 詳細: references/dataverse-connection-reference.md / references/web-api-implementation.md
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

/**
 * anti-forgery token を取得する。
 * 1) DOM の hidden input → 2) `/_layout/tokenhtml` エンドポイント
 */
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
    const res = await fetch("/_layout/tokenhtml", {
      credentials: "same-origin",
    });
    const html = await res.text();
    const match = html.match(/value="([^"]+)"/);
    if (match?.[1]) {
      cachedToken = match[1];
      return cachedToken;
    }
  } catch {
    /* fall through */
  }
  return "";
}

function baseHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
}

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  // セッション切れ → ログインページに飛ばされている
  if (res.redirected && res.url.includes("/Account/Login")) {
    throw new ApiAuthError(302);
  }
  if (res.status === 401) {
    throw new ApiAuthError(401);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} (${path}): ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "GET",
    credentials: "same-origin",
    headers: baseHeaders(),
  });
  return handleResponse<T>(res, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getRequestVerificationToken();
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...baseHeaders(),
      "Content-Type": "application/json",
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
    credentials: "same-origin",
    headers: {
      ...baseHeaders(),
      "Content-Type": "application/json",
      __RequestVerificationToken: token,
    },
    body: JSON.stringify(body),
  });
  await handleResponse<void>(res, path);
}

export async function apiDelete(path: string): Promise<void> {
  const token = await getRequestVerificationToken();
  const res = await fetch(`${BASE}/${path}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { ...baseHeaders(), __RequestVerificationToken: token },
  });
  await handleResponse<void>(res, path);
}

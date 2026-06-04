/**
 * Power Pages Web API (`/_api/`) 共有クライアント
 *
 * upstream: microsoft/power-platform-skills `integrate-webapi` スキル準拠
 * 配置: src/shared/powerPagesApi.ts
 *
 * 認証: ブラウザのセッション Cookie（相対 URL なので credentials 省略可）。
 * 書き込み/読み取り: 全リクエストに anti-forgery token を付与。
 * リトライ: 429/5xx を指数バックオフ（最大 3 回）。403/90040107 でトークン再取得。
 */

// ── Anti-Forgery Token ────────────────────────────────────────────────────────

let cachedAntiForgeryToken: string | null = null;

const fetchAntiForgeryToken = async (): Promise<string> => {
  if (cachedAntiForgeryToken) return cachedAntiForgeryToken;
  try {
    const response = await fetch("/_layout/tokenhtml");
    if (response.status !== 200) throw new Error(`Failed to fetch token: ${response.status}`);
    const html = await response.text();
    const valueIndex = html.indexOf('value="');
    if (valueIndex === -1) throw new Error("Token not found in response");
    const token = html.substring(valueIndex + 7, html.indexOf('" />', valueIndex));
    cachedAntiForgeryToken = token || "";
    return cachedAntiForgeryToken;
  } catch (error) {
    console.warn("Failed to fetch anti-forgery token:", error);
    return "";
  }
};

const invalidateAntiForgeryToken = (): void => {
  cachedAntiForgeryToken = null;
};

// ── Header Builder ────────────────────────────────────────────────────────────

export const buildPowerPagesHeaders = async (
  incoming?: HeadersInit,
  options?: { accept?: string | null; contentType?: string | null; prefer?: string | null }
): Promise<Headers> => {
  const antiForgeryToken = await fetchAntiForgeryToken();
  const headers = new Headers({ __RequestVerificationToken: antiForgeryToken });
  if (options?.accept !== null)
    headers.set("Accept", options?.accept ?? "application/json");
  if (options?.contentType !== null)
    headers.set("Content-Type", options?.contentType ?? "application/json");
  if (options?.prefer !== null)
    headers.set(
      "Prefer",
      options?.prefer ??
        'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    );
  if (incoming) {
    const extra = new Headers(incoming);
    extra.forEach((value, key) => headers.set(key, value));
  }
  return headers;
};

// ── Web API Error Codes ───────────────────────────────────────────────────────

export const WebApiErrorCode = {
  ReadPermissionDenied:     "90040120",
  WritePermissionDenied:    "90040102",
  CreatePermissionDenied:   "90040103",
  DeletePermissionDenied:   "90040104",
  AppendPermissionDenied:   "90040105",
  AppendToPermissionDenied: "90040106",
  AntiForgeryTokenInvalid:  "90040107",
  ResourceNotFound:         "9004010c",
  CdsError:                 "9004010d",
} as const;

const extractErrorCode = async (response: Response): Promise<string | undefined> => {
  try {
    const payload = await response.json();
    const code = payload?.error?.code;
    return typeof code === "string" ? code.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};

export const parseErrorCode = (error: unknown): string | undefined => {
  if (error && typeof error === "object" && "message" in error) {
    const match = (error as Error).message.match(/[0-9a-f]{8}/i);
    return match?.[0]?.toLowerCase();
  }
  return undefined;
};

// ── Response Helpers ──────────────────────────────────────────────────────────

export const parseResponseBody = async <T>(response: Response): Promise<T | null> => {
  if (response.status === 204 || response.status === 202) return null;
  const text = await response.text();
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    console.warn("Failed to parse response body as JSON");
    return null;
  }
};

/** POST 後に作成レコードの ID を Location ヘッダーから取得する */
export const extractRecordId = (response: Response): string | null => {
  const location =
    response.headers.get("Location") ?? response.headers.get("OData-EntityId");
  if (!location) return null;
  const match = location.match(/\(([0-9a-fA-F-]{36})\)/);
  return match ? match[1] : null;
};

// ── Retry ─────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const isTransientError = (status: number): boolean =>
  status === 429 || (status >= 500 && status < 600);

// ── Core Fetch Wrapper ────────────────────────────────────────────────────────

export async function powerPagesFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const headers = await buildPowerPagesHeaders(options?.headers);
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401)
      throw new Error("Session expired. Please sign in again.");

    if (response.status === 403 && attempt < MAX_RETRIES) {
      const errorCode = await extractErrorCode(response.clone());
      if (errorCode === WebApiErrorCode.AntiForgeryTokenInvalid) {
        invalidateAntiForgeryToken();
        continue;
      }
    }

    if (isTransientError(response.status) && attempt < MAX_RETRIES) {
      await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      continue;
    }

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.error?.message) message = payload.error.message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    return parseResponseBody<T>(response);
  }
  throw new Error("Max retries exceeded");
}

/** ヘッダーアクセスが必要な場合（POST 後の Location ヘッダー取得等）に使用 */
export async function powerPagesFetchResponse(
  url: string,
  options?: RequestInit
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const headers = await buildPowerPagesHeaders(options?.headers);
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401)
      throw new Error("Session expired. Please sign in again.");

    if (response.status === 403 && attempt < MAX_RETRIES) {
      const errorCode = await extractErrorCode(response.clone());
      if (errorCode === WebApiErrorCode.AntiForgeryTokenInvalid) {
        invalidateAntiForgeryToken();
        continue;
      }
    }

    if (isTransientError(response.status) && attempt < MAX_RETRIES) {
      await sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      continue;
    }

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.error?.message) message = payload.error.message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    return response;
  }
  throw new Error("Max retries exceeded");
}

// ── OData URL Builder ─────────────────────────────────────────────────────────

export const buildODataUrl = (
  entitySet: string,
  query?: Record<string, string | undefined>
): string => {
  if (!query) return `/_api/${entitySet}`;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      const encoded = encodeURIComponent(value).replace(/%2C/g, ",");
      parts.push(`${key}=${encoded}`);
    }
  }
  return parts.length > 0 ? `/_api/${entitySet}?${parts.join("&")}` : `/_api/${entitySet}`;
};

export const escapeODataString = (value: string): string => value.replace(/'/g, "''");

// ── OData Types ───────────────────────────────────────────────────────────────

export interface ODataCollectionResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  nextLink?: string;
}

// ── Formatted Value Helper ────────────────────────────────────────────────────

/** lookup の表示名・選択肢ラベルを取得（Prefer: odata.include-annotations で返る） */
export const getFormattedValue = (
  record: Record<string, unknown>,
  logicalName: string
): string | undefined =>
  record[
    `${logicalName}@OData.Community.Display.V1.FormattedValue`
  ] as string | undefined;

// ── Pagination Helper ─────────────────────────────────────────────────────────

/**
 * 全ページを取得する（ドロップダウン等で全件必要な場合のみ使用）。
 * ⚠️ $skip は Power Pages Web API で非サポート（9004010B）。
 */
export const fetchAllPages = async <T>(initialUrl: string, pageSize = 100): Promise<T[]> => {
  let nextUrl: string | undefined = initialUrl;
  const results: T[] = [];
  let iterations = 0;

  while (nextUrl && ++iterations <= 100) {
    const response = await powerPagesFetch<ODataCollectionResponse<T>>(nextUrl, {
      headers: {
        Prefer: `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`,
      },
    });
    if (!response) break;
    results.push(...(response.value ?? []));
    nextUrl = response["@odata.nextLink"];
  }

  return results;
};

// ── Lookup Binding Helper ─────────────────────────────────────────────────────

/**
 * @odata.bind で lookup を設定または解除する。
 * - id === null  → 解除
 * - id === undefined → スキップ
 * - id が文字列 → 設定
 */
export const bindLookup = (
  body: Record<string, unknown>,
  navigationProperty: string,
  entitySetName: string,
  id?: string | null
): void => {
  if (id === null) {
    body[`${navigationProperty}@odata.bind`] = null;
  } else if (id) {
    body[`${navigationProperty}@odata.bind`] = `/${entitySetName}(${id})`;
  }
};

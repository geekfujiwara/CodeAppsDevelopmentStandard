# Dataverse クライアント実装リファレンス（Power Pages）

Power Pages の SPA（Code Site）から Dataverse Web API（`/_api/`）を読み書きする実装サンプル一式。
`microsoft/power-platform-skills` upstream（`integrate-webapi` スキル）の実装パターンを優先参照する。

> **位置づけ**: SKILL.md「Web API 共有クライアント」の詳細版。まず SKILL.md で接続方式と核心原則を把握してからこのファイルを参照する。
> **認証の実コード**（SSO・サインアウト・ログインボタン・UI フロー）は [認証実装リファレンス](authentication.md) を参照。
> 全体の責務分離は [upstream 優先構成ガイド](upstream-alignment.md) を正本として扱う。

---

## 0.1 microsoft/power-platform-skills との対応（CRUD/権限）

| 項目 | 対応スキル | このリファレンスで扱う範囲 |
|---|---|---|
| 認可前提 | `create-webroles` | 誰に CRUD を許可するかのロール基盤（権限紐付け前提） |
| CRUD 実装本体 | `integrate-webapi` | `powerPagesFetch`/`powerPagesFetchResponse`、OData クエリ、`@odata.bind`、サービスレイヤー |
| 権限監査 | `audit-permissions` | 403/404 の原因切り分け観点（テーブル権限・Web ロール・scope） |
| 認証前提 | `setup-auth` | セッション Cookie 前提の API 呼び出し設計 |

> **upstream 参照**: `microsoft/power-platform-skills` の [`webapi-core-client.md`](https://github.com/microsoft/power-platform-skills/blob/main/plugins/power-pages/references/webapi-core-client.md) と [`webapi-service-patterns.md`](https://github.com/microsoft/power-platform-skills/blob/main/plugins/power-pages/references/webapi-service-patterns.md) を正本として、このリファレンスを構成する。
> 要点: `integrate-webapi` は CRUD コードを作る役割、実際に通すには `setup-auth` と Web ロール/テーブル権限の整合が必須。

---

## 1. 接続モデル（Code Apps との最大の違い）

Power Pages は **クライアントから Web API（`/_api`）を直接 `fetch`** する。
Code Apps の `@microsoft/power-apps/data` SDK のようなクライアントライブラリは無い。

| 項目 | 値 |
|------|----| 
| エンドポイント | `/_api/{entitySetName}`（同一オリジン・相対パス） |
| 認証 | ブラウザのセッション Cookie（相対 URL のため `credentials` 省略可） |
| トークン | **全リクエスト**に anti-forgery トークンを付与（書き込みで必須、自動リトライあり） |
| 認可 | `mspp_entitypermissions`（テーブル権限）+ `mspp_webroles`（Web ロール）の N:N |

> `{entitySetName}` は**複数形の論理コレクション名**（例: `geek_incident` テーブル → `geek_incidents`、`contact` → `contacts`）。
> 実際のエンティティセット名は Dataverse API で確認する: `GET EntityDefinitions(LogicalName='...')?\$select=EntitySetName`

---

## 2. 共有クライアント本体（`src/shared/powerPagesApi.ts`）

**すべての `/_api/` 呼び出しはこの共有クライアントを通す。** upstream `integrate-webapi` スキル ([`webapi-core-client.md`](https://github.com/microsoft/power-platform-skills/blob/main/plugins/power-pages/references/webapi-core-client.md)) の実装に準拠。

```typescript
// src/shared/powerPagesApi.ts
// Power Pages Web API 共有クライアント — トークン管理・リトライ・OData ヘルパー

// ── Anti-Forgery Token ────────────────────────────────────────────────────────
// 全リクエストに __RequestVerificationToken を付与する。
// /_layout/tokenhtml から一度取得してキャッシュし、403/90040107 でのみ再取得する。

let cachedAntiForgeryToken: string | null = null;

const fetchAntiForgeryToken = async (): Promise<string> => {
  if (cachedAntiForgeryToken) return cachedAntiForgeryToken;
  try {
    const response = await fetch("/_layout/tokenhtml");
    if (response.status !== 200) throw new Error(`Failed: ${response.status}`);
    const html = await response.text();
    const valueIndex = html.indexOf('value="');
    if (valueIndex === -1) throw new Error("Token not found");
    const token = html.substring(valueIndex + 7, html.indexOf('" />', valueIndex));
    cachedAntiForgeryToken = token || "";
    return cachedAntiForgeryToken;
  } catch (error) {
    console.warn("Failed to fetch anti-forgery token:", error);
    return "";
  }
};

const invalidateAntiForgeryToken = (): void => { cachedAntiForgeryToken = null; };

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
      options?.prefer ?? 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
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
  } catch { return undefined; }
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
  try { return JSON.parse(text) as T; }
  catch { console.warn("Failed to parse response body"); return null; }
};

/** POST 後に作成レコードの ID を Location ヘッダーから取得する */
export const extractRecordId = (response: Response): string | null => {
  const location = response.headers.get("Location") ?? response.headers.get("OData-EntityId");
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
        continue; // トークンを再取得してリトライ
      }
      // 真の権限エラーはリトライしない
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
      } catch { /* ignore */ }
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
      } catch { /* ignore */ }
      throw new Error(message);
    }

    return response;
  }
  throw new Error("Max retries exceeded");
}

// ── OData URL Builder & Helpers ───────────────────────────────────────────────

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

// ── OData 型定義 ──────────────────────────────────────────────────────────────

export interface ODataCollectionResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  nextLink?: string;  // 次ページの @odata.nextLink カーソル
}

// ── Formatted Value Helper ────────────────────────────────────────────────────

/** lookup の表示名・選択肢ラベルを取得（Prefer: odata.include-annotations で返る） */
export const getFormattedValue = (
  record: Record<string, unknown>,
  logicalName: string
): string | undefined =>
  record[`${logicalName}@OData.Community.Display.V1.FormattedValue`] as string | undefined;

// ── Pagination Helper ─────────────────────────────────────────────────────────

/**
 * 全ページを取得する（ドロップダウン等で全件必要な場合のみ使用）。
 * ⚠️ $skip は Power Pages Web API で非サポート（9004010B: QueryParamNotSupported）。
 * ページング は @odata.nextLink カーソルのみ使用する。
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
 * - id が null → 解除（bind を null に設定）
 * - id が文字列 → 設定
 * - id が undefined → スキップ
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
```

**旧 `src/lib/api.ts` からの主な変更点:**

| 項目 | 旧 `api.ts` | 新 `powerPagesApi.ts` |
|------|-------------|----------------------|
| ファイル位置 | `src/lib/api.ts` | `src/shared/powerPagesApi.ts` |
| トークン付与 | POST/PATCH/DELETE のみ | **全リクエスト**（GET も含む） |
| トークン期限切れ | 再取得なし | 403/90040107 で自動再取得してリトライ |
| リトライ | なし | 429・5xx を指数バックオフでリトライ（最大 3 回） |
| エラーコード | `ApiAuthError` クラス | `WebApiErrorCode` enum で全コード定義 |
| OData ヘルパー | なし | `buildODataUrl`、`escapeODataString`、`getFormattedValue`、`fetchAllPages`、`bindLookup` |

---

## 3. GET の利用例（一覧取得・ページネーション）

> ⚠️ **`$skip` は Power Pages Web API で非サポート**（9004010B: QueryParamNotSupported）。
> ページング は `Prefer: odata.maxpagesize=N` + `@odata.nextLink` カーソルのみ使用する。

```typescript
import {
  powerPagesFetch,
  buildODataUrl,
  type ODataCollectionResponse,
  type PaginatedResult,
} from "@/shared/powerPagesApi";
import { mapIncidentEntity, type Incident, type IncidentEntity } from "@/types/incident";

// $select に必要なカラムを明示する（* は使わない）
const INCIDENT_SELECT = [
  "geek_incidentid",
  "geek_name",
  "geek_status",
  "geek_priority",
  "createdon",
].join(",");

export interface ListParams {
  pageSize?: number;
  nextLink?: string;  // 前のページの @odata.nextLink カーソル
  filter?: string;
  orderBy?: string;
}

export const listIncidents = async (params?: ListParams): Promise<PaginatedResult<Incident>> => {
  const pageSize = params?.pageSize ?? 10;

  // nextLink がある場合はそのまま使う（$skip は不可）
  const url = params?.nextLink ?? buildODataUrl("geek_incidents", {
    "$select": INCIDENT_SELECT,
    "$orderby": params?.orderBy ?? "createdon desc",
    "$count": "true",
    "$filter": params?.filter,
  });

  const response = await powerPagesFetch<ODataCollectionResponse<IncidentEntity>>(url, {
    headers: {
      Prefer: `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`,
    },
  });

  return {
    items: (response?.value ?? []).map(mapIncidentEntity),
    totalCount: response?.["@odata.count"] ?? response?.value?.length ?? 0,
    nextLink: response?.["@odata.nextLink"],  // 次ページのカーソル
  };
};
```

React コンポーネントからの呼び出し例:

```tsx
import { useEffect, useState } from "react";
import { listIncidents, type ListParams } from "@/shared/services/incidentService";
import type { Incident, PaginatedResult } from "@/shared/powerPagesApi";

export default function IncidentListPage() {
  const [result, setResult] = useState<PaginatedResult<Incident> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listIncidents({ pageSize: 20 })
      .then(setResult)
      .finally(() => setLoading(false));
  }, []);

  const loadMore = () => {
    if (!result?.nextLink) return;
    listIncidents({ nextLink: result.nextLink }).then((next) =>
      setResult((prev) => ({
        ...next,
        items: [...(prev?.items ?? []), ...next.items],
      }))
    );
  };

  // ... render result.items
}
```

---

## 4. POST の利用例（作成）

`Prefer: return=representation` を付与してレスポンス本体を要求する。
Power Pages は本体なし（204）を返す場合があるため、`extractRecordId` で Location ヘッダーから ID を取得するフォールバックを用意する。

```typescript
import {
  powerPagesFetchResponse,
  parseResponseBody,
  extractRecordId,
} from "@/shared/powerPagesApi";
import { getIncidentById } from "./incidentService";
import type { IncidentEntity } from "@/types/incident";

export interface CreateIncidentInput {
  name: string;
  description?: string;
  priority: number;
  statusCode?: number;
}

export const createIncident = async (payload: CreateIncidentInput): Promise<Incident> => {
  const body: Record<string, unknown> = {
    geek_name: payload.name,
    geek_description: payload.description ?? "",
    geek_priority: payload.priority,
    geek_status: payload.statusCode ?? 100000000, // 新規
  };

  const response = await powerPagesFetchResponse("/_api/geek_incidents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });

  // レスポンス本体があれば使う
  const entity = await parseResponseBody<IncidentEntity>(response);
  if (entity) return mapIncidentEntity(entity);

  // 本体なし → Location ヘッダーから ID を取得してフェッチ
  const createdId = extractRecordId(response);
  if (createdId) {
    const created = await getIncidentById(createdId);
    if (created) return created;
  }

  throw new Error("Failed to retrieve created record");
};
```

## 4.5 PATCH（更新）と DELETE（削除）

```typescript
import { powerPagesFetch } from "@/shared/powerPagesApi";

// 更新: If-Match: * でコンフリクト検出。変更フィールドのみ送信する。
export const updateIncident = async (
  id: string,
  payload: Partial<CreateIncidentInput>
): Promise<Incident> => {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined)      body.geek_name = payload.name;
  if (payload.description !== undefined) body.geek_description = payload.description;
  if (payload.priority !== undefined)  body.geek_priority = payload.priority;

  await powerPagesFetch(`/_api/geek_incidents(${id})`, {
    method: "PATCH",
    headers: { "If-Match": "*" },
    body: JSON.stringify(body),
  });

  const updated = await getIncidentById(id);
  if (!updated) throw new Error("Failed to fetch updated record");
  return updated;
};

// 削除
export const deleteIncident = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/geek_incidents(${id})`, { method: "DELETE" });
};
```

---

## 5. Lookup（参照列）の読み書き

**Lookup には GET と POST/PATCH で異なるプロパティ名を使う（混同注意）。**

```typescript
import { getFormattedValue, bindLookup } from "@/shared/powerPagesApi";

// 読み取り: $select では `_<nav>_value`（GUID）、表示名は getFormattedValue() で取得
const response = await powerPagesFetch<ODataCollectionResponse<IncidentEntity>>(
  buildODataUrl("geek_incidents", {
    "$select": "geek_name,_geek_inquirerid_value",
  })
);
const incident = response?.value[0];
const inquirerId = incident?._geek_inquirerid_value;                 // GUID
const inquirerName = getFormattedValue(incident!, "_geek_inquirerid_value"); // 表示名

// $expand でルックアップ先のフィールドを展開（ナビゲーションプロパティ名 = case-sensitive）
const withExpand = await powerPagesFetch<ODataCollectionResponse<IncidentEntity>>(
  buildODataUrl("geek_incidents", {
    "$select": "geek_name",
    "$expand": "geek_inquirerid($select=geek_inquirerid,fullname)",
  })
);

// 書き込み: @odata.bind を使う（ナビゲーションプロパティ名を bindLookup に渡す）
const body: Record<string, unknown> = { geek_name: "新規チケット" };
bindLookup(body, "geek_inquirerid", "contacts", contactId);  // 設定
bindLookup(body, "geek_inquirerid", "contacts", null);       // 解除
await powerPagesFetch("/_api/geek_incidents", { method: "POST", body: JSON.stringify(body) });
```

**ナビゲーションプロパティ名の確認方法:**
```
GET EntityDefinitions(LogicalName='geek_incident')/ManyToOneRelationships
  ?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity,ReferencingAttribute
```
`ReferencingEntityNavigationPropertyName` が `@odata.bind` に使うプロパティ名。
`@odata.bind` は `_value` 形式（例: `_geek_inquirerid_value`）ではなく
Navigation Property 名（例: `geek_inquirerid`）を使う点に注意。

| プロパティ種別 | 用途 | 例 |
|---|---|---|
| `_<nav>_value` | GET の $select・$filter で GUID 取得 | `_geek_inquirerid_value` |
| Navigation Property | $expand・$filter で展開 / POST/PATCH の @odata.bind | `geek_inquirerid` |
| `@odata.bind` | POST/PATCH でルックアップを設定 | `"geek_inquirerid@odata.bind": "/contacts(id)"` |

---

## 6. OData クエリのポイント

| パターン | 正しい書式 | 誤り |
|----------|-----------|------|
| Lookup 列の参照 | `_geek_inquirerid_value` | `geek_inquirerid` |
| Lookup の書き込み | `geek_inquirerid@odata.bind` | `_geek_inquirerid_value` |
| Boolean フィルタ | `$filter=geek_approved eq true` | `eq 'true'` |
| 日時フィルタ | `createdon gt 2024-01-01T00:00:00Z` | 引用符付き |
| 文字列フィルタ | `$filter=geek_name eq 'ABC'` | 引用符なし |
| 展開 | `$expand=geek_inquirerid($select=fullname)` | — |
| 件数取得 | `$count=true`（`@odata.count` に返る） | — |
| ページネーション | `Prefer: odata.maxpagesize=N` + `@odata.nextLink` | `$skip`（非サポート: 9004010B） |

> **`$skip` は Power Pages Web API で非サポート。** ページングは `@odata.nextLink` カーソルのみ使用する。

---

## 7. ローカル開発（dev プロキシ）

`localhost` 開発時は `/_api` が存在しないため、Vite プロキシで Dataverse Web API に転送する。

```typescript
// vite.config.ts
export default defineConfig({
  base: "./", // Power Pages のパス構造に対応
  server: {
    port: 5174,
    proxy: {
      "/_api": {
        target: "https://{org}.crm{n}.dynamics.com/api/data/v9.2",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
```

> dev プロキシは Cookie 認証もテーブル権限も再現しない。
> **最終的なテーブル権限・認証の確認は必ずデプロイ後の本番ポータルで行う**（管理者と一般ユーザーの両方）。

---

## 8. サービスレイヤーパターン（upstream 推奨）

upstream `integrate-webapi` スキルでは、テーブルごとに以下のファイル構成でサービスレイヤーを作成する。

```
src/
  shared/
    powerPagesApi.ts        ← 共有クライアント（§2）
    services/
      incidentService.ts    ← テーブルごとの CRUD サービス
  types/
    incident.ts             ← エンティティ型・ドメイン型・マッパー
  hooks/  (React)
    useIncidents.ts         ← React hooks（フレームワーク別）
```

### エンティティ型・ドメイン型・マッパー（`src/types/incident.ts`）

```typescript
import { getFormattedValue } from "@/shared/powerPagesApi";

// Dataverse の OData レスポンス形式（カラム論理名そのまま）
export interface IncidentEntity {
  geek_incidentid: string;
  geek_name?: string;
  geek_status?: number;
  geek_priority?: number;
  createdon?: string;
  modifiedon?: string;
  [key: string]: unknown;  // FormattedValue アノテーション用
}

// UI が使うクリーンなドメイン型
export interface Incident {
  id: string;
  name: string;
  status: number;
  priority: number;
  createdAt: string;
}

// OData エンティティ → ドメイン型の変換
export const mapIncidentEntity = (entity: IncidentEntity): Incident => ({
  id: entity.geek_incidentid,
  name: entity.geek_name ?? "",
  status: entity.geek_status ?? 0,
  priority: entity.geek_priority ?? 0,
  createdAt: entity.createdon ?? new Date().toISOString(),
});
```

---

## 8.5 Code Apps（SDK）との対比

```typescript
// Power Pages（このスキル）
import { powerPagesFetch, buildODataUrl, type ODataCollectionResponse } from "@/shared/powerPagesApi";

const response = await powerPagesFetch<ODataCollectionResponse<CustomerEntity>>(
  buildODataUrl("geek_customers", { "$select": "geek_customerid,geek_name", "$orderby": "geek_name asc" }),
  { headers: { Prefer: "odata.include-annotations="...",odata.maxpagesize=10" } }
);
const customers = (response?.value ?? []).map(mapCustomerEntity);
```

```typescript
// Code Apps（SDK / 参考）
import { getClient } from "@microsoft/power-apps/data";
const result = await getClient(dataSourcesInfo)
  .retrieveMultipleRecordsAsync<Customer>("geek_customers", {
    select: ["geek_customerid", "geek_name"],
    orderBy: ["geek_name asc"],
  });
const customers = result.data ?? [];
```

| 観点 | Power Pages | Code Apps |
|------|-------------|-----------|
| 接続 | `/_api/` を直接 fetch | `@microsoft/power-apps/data` SDK |
| 取得 | `powerPagesFetch` | `client.retrieveMultipleRecordsAsync` |
| クエリ記法 | OData 文字列（`$select=...`） | オプションオブジェクト |
| レスポンス | `{ value: T[] }` + throw ベース | `{ success, data, error }` |
| 認証 | セッション Cookie（自動） | コネクタ + SDK |
| ユーザー実体 | contact（`Portal.User`） | systemuser（`getContext().user`） |
| 書き込み保護 | anti-forgery トークン（自動） | SDK が内部処理 |
| 認可 | テーブル権限 + Web ロール | Dataverse セキュリティロール |

---

## 9. 検証済みの教訓

| # | 教訓 | 詳細 |
|---|------|------|
| 1 | `$skip` は非サポート | Power Pages Web API は `$skip` を返さない（9004010B）。`@odata.nextLink` カーソルのみ使用 |
| 2 | トークンは全リクエストに付与 | `powerPagesFetch` は GET も含む全リクエストに anti-forgery token を付与する |
| 3 | 403/90040107 でトークンを再取得 | `powerPagesFetch` が自動でトークンを無効化してリトライする |
| 4 | テーブル権限不足は UI を壊さない | マスタ参照系は `try/catch` で空配列にフォールバックしてもよい |
| 5 | 管理者 OK / 一般ユーザー 403 | 管理者はテーブル権限をバイパス。**必ず一般ユーザーで検証する** |
| 6 | Lookup の `@odata.bind` はナビゲーションプロパティ名 | `_value` 形式ではなく `ManyToOneRelationships` の `ReferencingEntityNavigationPropertyName` を使う |
| 7 | `$select` は明示する | `*` を使うと不要な列でコネクション帯域を消費。必要な列だけ指定する |

```typescript
// 教訓 4: テーブル権限未設定のマスタは空配列で UI を壊さない
export async function getLocations(): Promise<Location[]> {
  try {
    const response = await powerPagesFetch<ODataCollectionResponse<LocationEntity>>(
      buildODataUrl("geek_locations", { "$select": "geek_locationid,geek_name" })
    );
    return (response?.value ?? []).map(mapLocationEntity);
  } catch {
    return []; // テーブル権限未設定でも画面を壊さない
  }
}
```

---

## 10. データ接続が成立する 3 レイヤー（サーバー側設定）

`/_api/{table}` が動くにはサーバー側で次の 3 つが揃う必要がある。1 つでも欠けると 403 / 404。

```
① Site Settings  : Webapi/{table}/enabled=true, fields=*   → ないと 404
② Table Permission: powerpagecomponent type=18（scope/CRUD）  → ないと 403
③ Web ロール紐付け: Table Permission ↔ Authenticated Users → ないと一般ユーザー 403
```

> この 3 レイヤーの設定手順・自動化スクリプト・EDM 2.0 の N:N バグ回避は
> [Enhanced Data Model テーブル権限](enhanced-data-model-permissions.md) を参照。
> 認証・サイト設定（IdP・Cookie）は [認証実装](authentication.md) を参照。

---

## 11. トラブルシューティング

| 症状 | 原因 | 対策 |
|------|------|------|
| `/_api/{table}` が 404 | `Webapi/{table}/enabled` 未設定 | レイヤー①を設定 |
| `/_api/{table}` が 403（管理者は OK） | Web ロール紐付け欠落 | レイヤー③を確認 |
| 全ユーザー 403 | Table Permission（type=18）未作成 | レイヤー②を確認 |
| PATCH/POST が 401 | anti-forgery token 不足 | §2/§5 のトークン取得を使う |
| 設定したのに反映されない | サイトキャッシュ | PP API で restart（最大 15 分） |

### 検証手順（必須）

```
1. 管理者でログイン → /_api/{table} が 200 + データ
2. 一般ユーザーでログイン → /_api/{table} が 200 + データ   ← ここが本番
3. プロフィール編集ページで PATCH → 204 + 反映確認
```

> ステップ 2 を飛ばすと「管理者では動くのに公開したら 403」という事故になる。

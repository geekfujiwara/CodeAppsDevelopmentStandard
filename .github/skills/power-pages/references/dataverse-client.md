# Dataverse クライアント実装リファレンス（Power Pages）

Power Pages の SPA（Code Site）から Dataverse Web API（`/_api/`）を読み書きする実装サンプル一式。
`geeksupport`（動作実績のある参考サイト）の実装に基づく。

> **位置づけ**: SKILL.md「Web API 共有クライアント」の詳細版。まず SKILL.md で接続方式と核心原則を把握してからこのファイルを参照する。
> **認証の実コード**（SSO・サインアウト・ログインボタン・UI フロー）は [認証実装リファレンス](authentication.md) を参照。

---

## 0.1 microsoft/power-platform-skills との対応（CRUD/権限）

| 項目 | 対応スキル | このリファレンスで扱う範囲 |
|---|---|---|
| CRUD 実装本体 | `integrate-webapi` | `apiGet/apiPost/apiPatch/apiDelete`、OData クエリ、`@odata.bind` |
| 権限監査 | `audit-permissions` | 403/404 の原因切り分け観点（テーブル権限・Web ロール・scope） |
| 認証前提 | `setup-auth` | セッション Cookie 前提の API 呼び出し設計（`credentials: "same-origin"`） |

> 要点: `integrate-webapi` は CRUD コードを作る役割、実際に通すには `setup-auth` と Web ロール/テーブル権限の整合が必須。

---

## 1. 接続モデル（Code Apps との最大の違い）

Power Pages は **クライアントから Web API（`/_api`）を直接 `fetch`** する。
Code Apps の `@microsoft/power-apps/data` SDK のようなクライアントライブラリは無い。

| 項目 | 値 |
|------|----|
| エンドポイント | `/_api/{entitySetName}`（同一オリジン・相対パス） |
| 認証 | ブラウザのセッション Cookie（`credentials: "same-origin"`） |
| トークン | Bearer トークン不要。**書き込み**のみ anti-forgery トークンが必要 |
| 認可 | `mspp_entitypermissions`（テーブル権限）+ `mspp_webroles`（Web ロール）の N:N |

> `{entitySetName}` は**複数形の論理コレクション名**（例: `geek_incident` テーブル → `geek_incidents`、`contact` → `contacts`）。

---

## 2. 共有クライアント本体（`src/lib/api.ts`）

**すべての `/_api/` 呼び出しはこの共有クライアントを通す。** コピーしてそのまま使える完全実装。

```typescript
// src/lib/api.ts
/**
 * Power Pages Web API (`/_api/`) クライアント
 *
 * 認証: ブラウザのセッション Cookie（same-origin）。Bearer トークン不要。
 * 書き込み (POST/PATCH/DELETE): anti-forgery token が必須。
 */
const BASE = "/_api";

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
 * 優先順: ① キャッシュ → ② DOM hidden input → ③ Cookie → ④ meta → ⑤ /_layout/tokenhtml
 * SPA はページ遷移後に DOM の hidden input が消えることがあるため多段フォールバックにする。
 */
async function getRequestVerificationToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  // ② DOM の hidden input（テンプレートが {{ request_verification_token }} を出力している場合）
  const input = document.querySelector<HTMLInputElement>(
    'input[name="__RequestVerificationToken"]',
  );
  if (input?.value) return (cachedToken = input.value);

  // ③ Cookie
  const cookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("__RequestVerificationToken="));
  if (cookie) return (cachedToken = decodeURIComponent(cookie.split("=").slice(1).join("=")));

  // ④ meta タグ
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="__RequestVerificationToken"]',
  );
  if (meta?.content) return (cachedToken = meta.content);

  // ⑤ /_layout/tokenhtml（最終手段。認証済みユーザーのみアクセス可能）
  try {
    const res = await fetch("/_layout/tokenhtml", { credentials: "same-origin" });
    const html = await res.text();
    const match = html.match(/value="([^"]+)"/);
    if (match?.[1]) return (cachedToken = match[1]);
  } catch { /* fall through */ }
  return "";
}

function baseHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Prefer: 'odata.include-annotations="*"', // lookup の FormattedValue を取得
  };
}

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  // 未認証時はログインページへリダイレクトされる
  if (res.redirected && res.url.includes("/Account/Login")) {
    throw new ApiAuthError(302);
  }
  if (res.status === 401 || res.status === 403) {
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
    credentials: "same-origin", // ★ "include" ではなく "same-origin"
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
      __RequestVerificationToken: token, // ★ 書き込みには anti-forgery token
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
    headers: {
      ...baseHeaders(),
      __RequestVerificationToken: token,
    },
  });
  await handleResponse<void>(res, path);
}
```

**ポイント:**

- `credentials: "same-origin"` — Power Pages は same-site なので `include` は不要。
- `Prefer: odata.include-annotations="*"` — lookup の FormattedValue を取得。
- `handleResponse` でリダイレクト検出 + 401/403 を `ApiAuthError` に正規化 + 詳細エラーログ。
- anti-forgery token は DOM → Cookie → meta → `/_layout/tokenhtml` の多段フォールバックでキャッシュ。
- lookup の書き込みには `@odata.bind` を使用（§5）。

> **`redirect: "manual"` は使わない**。`opaqueredirect`（status 0）の扱いがブラウザ間で不安定で、
> URL 正規化などの非認証リダイレクトも含めて認証失敗扱いにするとログインループになる。
> `credentials: "same-origin"` + `res.redirected` 検知のほうが安定する。

---

## 3. GET の利用例（一覧取得）

```typescript
import { apiGet, type ODataCollection } from "@/lib/api";

interface Incident {
  geek_incidentid: string;
  geek_name: string;
  geek_status: number;
  geek_priority: number;
  createdon: string;
}

export async function getIncidents(): Promise<Incident[]> {
  const res = await apiGet<ODataCollection<Incident>>(
    "geek_incidents?" +
      "$select=geek_incidentid,geek_name,geek_status,geek_priority,createdon&" +
      "$orderby=createdon desc",
  );
  return res.value; // ← OData は { value: [...] } 形式
}
```

React コンポーネントからの呼び出し例:

```tsx
import { useEffect, useState } from "react";

export default function IncidentListPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getIncidents()
      .then(setIncidents)
      .finally(() => setLoading(false));
  }, []);

  // ... loading 表示 / incidents をレンダリング
}
```

---

## 4. POST の利用例（作成）

```typescript
import { apiPost } from "@/lib/api";

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    await apiPost("geek_incidents", {
      geek_name: form.title,
      geek_description: form.description,
      geek_priority: form.priority,
      geek_status: 100000000, // 新規（選択肢のオプション値）
    });
    navigate("/incidents");
  } catch (err) {
    console.error(err);
    alert("チケットの作成に失敗しました。");
  }
};
```

---

## 5. Lookup（参照列）の読み書き

```typescript
// 読み取り: アンダースコア + _value 形式 / FormattedValue は注釈で取得
const res = await apiGet<ODataCollection<Incident>>(
  "geek_incidents?$select=geek_name,_geek_inquirerid_value",
);
// res.value[0]["_geek_inquirerid_value"]                                   → GUID
// res.value[0]["_geek_inquirerid_value@OData.Community.Display.V1.FormattedValue"] → 表示名

// 書き込み: ナビゲーションプロパティ名 + @odata.bind
await apiPost("geek_incidents", {
  geek_name: "新規チケット",
  "geek_inquirerid@odata.bind": `/contacts(${contactId})`,
});
```

---

## 6. OData クエリのポイント

| パターン | 正しい書式 | 誤り |
|----------|-----------|------|
| Lookup 列の参照 | `_geek_inquirerid_value` | `geek_inquirerid` |
| Lookup の書き込み | `geek_inquirerid@odata.bind` | `geek_inquirerid` |
| Boolean フィルタ | `$filter=geek_approved eq true` | `eq 'true'` |
| 日時フィルタ | `createdon gt 2024-01-01T00:00:00Z` | 引用符付き |
| 文字列フィルタ | `$filter=geek_name eq 'ABC'` | 引用符なし |
| 展開 | `$expand=geek_inquirerid($select=fullname)` | — |
| 件数取得 | `$count=true`（`@odata.count` に返る） | — |

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

## 8. Code Apps（SDK）との対比

同じ「一覧取得」を両方式で書いた比較。

### Power Pages（このスキル / REST fetch）

```typescript
import { apiGet, type ODataCollection } from "@/lib/api";

const res = await apiGet<ODataCollection<Customer>>(
  "geek_customers?$select=geek_customerid,geek_name&$orderby=geek_name asc",
);
const customers = res.value;
```

### Code Apps（SDK / 参考）

```typescript
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";

const result = await getClient(dataSourcesInfo)
  .retrieveMultipleRecordsAsync<Customer>("geek_customers", {
    select: ["geek_customerid", "geek_name"],
    orderBy: ["geek_name asc"], // ← 配列。Power Pages は OData 文字列
  });
const customers = result.data ?? [];
```

| 観点 | Power Pages | Code Apps |
|------|-------------|-----------|
| 接続 | Web API を直接 `fetch("/_api/...")` | `@microsoft/power-apps/data` SDK |
| 取得関数 | `apiGet`（自前 fetch ラッパー） | `client.retrieveMultipleRecordsAsync` |
| クエリ記法 | OData 文字列（`$select=...&$orderby=...`） | オプションオブジェクト（`select: [...], orderBy: [...]`） |
| レスポンス | `{ value: T[] }` を throw ベースで処理 | `{ success, data, error }` を判定 |
| 認証 | セッション Cookie（`same-origin`、自動） | コネクタ + SDK（クライアント側） |
| ユーザー実体 | contact（`Portal.User`） | systemuser（`getContext().user`） |
| 書き込み保護 | anti-forgery トークンを付与 | SDK が内部処理 |
| 認可モデル | テーブル権限 + Web ロール | Dataverse セキュリティロール |

---

## 9. 検証済みの教訓

| # | 教訓 | 詳細 |
|---|------|------|
| 1 | `redirect: "manual"` を使わない | `opaqueredirect` を一律認証失敗扱いするとログインループ。`res.redirected && url.includes("/Account/Login")` で検知し throw する |
| 2 | 403 は認証エラーではない | 401 のみ `ApiAuthError`。403 はテーブル権限不足なのでリダイレクトしない |
| 3 | テーブル権限不足は UI を壊さない | マスタ参照系は `try/catch` で空配列にフォールバックしてもよい |
| 4 | 書き込みの 401 はトークン不足 | テンプレートに `{{ request_verification_token }}` を含め、JS 側も `/_layout/tokenhtml` フォールバックを持つ |
| 5 | 管理者 OK / 一般ユーザー 403 | 管理者はテーブル権限をバイパス。必ず一般ユーザーで検証する |

```typescript
// 教訓 3: テーブル権限未設定のマスタは空配列で UI を壊さない
export async function getLocations(): Promise<Location[]> {
  try {
    const res = await apiGet<ODataCollection<Location>>("geek_locations?$select=geek_name");
    return res.value;
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

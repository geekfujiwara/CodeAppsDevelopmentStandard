# Power Pages Web API (`/_api/`) — 実装パターンと教訓

> **対象**: Power Pages コードサイト（SPA）から Dataverse データにアクセスする場合。
> Code Apps SDK (`@microsoft/power-apps/data`) は Power Pages では動作しない。

---

## 前提: なぜ `/_api/` か

| 方式 | Code Apps | Power Pages |
|------|-----------|-------------|
| `@microsoft/power-apps/data` SDK | ✅ 動作 | ❌ ランタイムなし |
| `/_api/` OData v4 エンドポイント | N/A | ✅ 推奨 |

Power Pages コードサイトはブラウザ上の静的 SPA として実行される。  
Power Apps ランタイム（`getClient()`, `retrieveMultipleRecordsAsync()` 等）は存在しない。

---

## API クライアント実装 (`src/lib/pp-api.ts`)

```typescript
const BASE = "/_api";

export class ApiAuthError extends Error {
  constructor(status: number) {
    super(`Authentication required (${status})`);
    this.name = "ApiAuthError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.redirected && res.url.includes("/Account/Login")) {
    throw new ApiAuthError(302);
  }
  if (res.status === 401) {
    throw new ApiAuthError(res.status);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Cached anti-forgery token */
let _cachedToken: string | null = null;

/** Fetch token from Power Pages endpoint (last resort) */
async function fetchTokenFromEndpoint(): Promise<string> {
  try {
    const res = await fetch("/_layout/tokenhtml", { credentials: "same-origin" });
    const html = await res.text();
    const match = html.match(/value="([^"]+)"/);
    if (match?.[1]) {
      _cachedToken = match[1];
      return _cachedToken;
    }
  } catch { /* fall through */ }
  return "";
}

/** Synchronous token lookup: cache → DOM hidden input → cookie → meta */
function getRequestVerificationTokenSync(): string {
  if (_cachedToken) return _cachedToken;
  const input = document.querySelector<HTMLInputElement>(
    'input[name="__RequestVerificationToken"]',
  );
  if (input?.value) return input.value;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("__RequestVerificationToken="));
  if (match) return decodeURIComponent(match.split("=").slice(1).join("="));
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="__RequestVerificationToken"]',
  );
  if (meta) return meta.content;
  return "";
}

/** Async token acquisition — tries sync first, then fetches from endpoint */
async function getRequestVerificationToken(): Promise<string> {
  const sync = getRequestVerificationTokenSync();
  if (sync) return sync;
  return fetchTokenFromEndpoint();
}

function getHeaders(method: "GET" | "POST" | "PATCH" | "DELETE"): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    credentials: "same-origin",
    headers: getHeaders("GET"),
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getRequestVerificationToken();
  const headers = getHeaders("POST");
  if (token) (headers as Record<string, string>)["__RequestVerificationToken"] = token;
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}
```

---

## 教訓一覧

### 1. `redirect: 'manual'` を使わない

```typescript
// ❌ リダイレクトループの原因
const res = await fetch(url, { redirect: "manual" });
if (res.type === "opaqueredirect") {
  window.location.href = "/Account/Login"; // ← ログイン済みでもループ
}

// ✅ ブラウザのデフォルト動作に任せる
const res = await fetch(url, { credentials: "same-origin" });
if (res.redirected && res.url.includes("/Account/Login")) {
  throw new ApiAuthError(302); // リダイレクトしない、エラーを投げるだけ
}
```

**理由**: `redirect: 'manual'` は opaqueredirect レスポンスを返す。URL正規化などの非認証リダイレクトも含まれるため、全てを認証失敗として扱うとループする。

### 2. 書き込みには `__RequestVerificationToken` が必須（テンプレート + JS 両面対策）

POST/PATCH/DELETE で 401 になる原因は CSRF トークン不足。**テンプレート側** と **JS 側** の両方で対策が必要:

#### テンプレート側: `{{ request_verification_token }}` を必ず含める

```html
{# Enhanced Data Model の Web テンプレート (type=8) #}
<link rel="stylesheet" href="/assets/index-xxx.css" />
{% if user %}<script>window.__PP_USER__={...};</script>{% endif %}
{{ request_verification_token }}   {# ← これが hidden input を出力する #}
<div id="root"></div>
<script type="module" src="/assets/index-xxx.js"></script>
```

`{{ request_verification_token }}` は以下の HTML を出力する:
```html
<input name="__RequestVerificationToken" type="hidden" value="CfDJ8..." />
```

#### JS 側: 非同期フォールバックで `/_layout/tokenhtml` から取得

SPA ではページ遷移後に DOM の hidden input が消える場合がある。  
**`/_layout/tokenhtml`** エンドポイントから非同期で取得するフォールバックが必要:

```typescript
// ❌ トークンが DOM にないと 401 になる
const token = document.querySelector<HTMLInputElement>(
  'input[name="__RequestVerificationToken"]',
)?.value ?? "";

// ✅ 非同期で /_layout/tokenhtml からフォールバック取得
async function getRequestVerificationToken(): Promise<string> {
  // 1. キャッシュ → 2. DOM hidden input → 3. Cookie → 4. /_layout/tokenhtml
  const sync = getRequestVerificationTokenSync();
  if (sync) return sync;
  return fetchTokenFromEndpoint(); // /_layout/tokenhtml から取得
}
```

**重要**: `/_layout/tokenhtml` は認証済みユーザーのみアクセス可能。匿名ユーザーは login にリダイレクトされる。

### 3. 403 は認証エラーではなくテーブル権限不足

```typescript
// ❌ 403 を auth error にすると不要なリダイレクトが発生
if (res.status === 401 || res.status === 403) {
  throw new ApiAuthError(res.status);
}

// ✅ 401 のみ auth error。403 は通常のエラー
if (res.status === 401) {
  throw new ApiAuthError(res.status);
}
```

### 4. テーブル権限不足は `try/catch` で握りつぶす

```typescript
export async function getLocations(): Promise<Location[]> {
  try {
    const res = await apiGet<ODataCollection<Location>>(`geek_locations?...`);
    return res.value;
  } catch {
    // テーブル権限未設定 → 空配列で UI を壊さない
    return [];
  }
}
```

### 5. `console.error` は API 層に入れない

```typescript
// ❌ try/catch で握りつぶしても console にノイズが残る
if (!res.ok) {
  console.error(`[PP-API] ${res.status}`, body);
  throw new Error(...);
}

// ✅ 呼び出し元が判断する
if (!res.ok) {
  throw new Error(`API ${res.status}: ${body}`);
}
```

### 6. `credentials: 'same-origin'` を明示

デフォルトで same-origin だが、明示することで意図を明確にし、将来の変更に備える。

---

## Enhanced Data Model サイト設定

### Web API 有効化に必要な設定 (type=9)

各テーブルに対して以下 3 つの `powerpagecomponent` (type=9) を作成:

| name | value | 用途 |
|------|-------|------|
| `Webapi/{table}/enabled` | `true` | Web API 有効化 |
| `Webapi/{table}/fields` | `*` | 全フィールド公開 |
| `Webapi/{table}/disableentitypermissions` | `true` | 権限チェックバイパス |

```python
body = {
    "name": f"Webapi/{table}/enabled",
    "powerpagecomponenttype": 9,
    "content": json.dumps({"value": "true", "source": 0}, indent=2),
    "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
}
requests.post(f"{url}/powerpagecomponents", headers=h, json=body)
```

### ⚠️ `disableentitypermissions` が効かない場合 → type=18 の Web ロール紐付け

`disableentitypermissions` サイト設定だけでは 403 が解消しないケースがある。  
**根本原因**: テーブル権限 (type=18) の content JSON に **`adx_entitypermission_webrole`** と **`websiteid`** が必要。

```python
# ❌ 403 になる — Web ロール紐付けなし
content = {
    "entitylogicalname": "geek_location",
    "entityname": "場所 - Global Read",
    "scope": 756150000,
    "read": True, "write": False, "create": False, "delete": False,
    "append": True, "appendto": True,
}

# ✅ 動作する — adx_entitypermission_webrole + websiteid を含める
content = {
    "entitylogicalname": "geek_location",
    "entityname": "場所 - Global Read",
    "scope": 756150000,
    "read": True, "write": False, "create": False, "delete": False,
    "append": True, "appendto": True,
    "websiteid": SITE_ID,                                    # ← 必須
    "adx_entitypermission_webrole": [AUTH_ROLE_ID],          # ← 必須
}
```

**重要**: `mspp_entitypermission_webrole` N:N テーブルを直接操作しても永続化しないが、  
**powerpagecomponent type=18 の content JSON 内で `adx_entitypermission_webrole` を指定すれば API 経由で Web ロール紐付けが可能**。

**修正手順**:
1. type=18 の content を PATCH で更新（`adx_entitypermission_webrole` + `websiteid` 追加）
2. サイトリスタート（必須）
3. 60-90 秒待機後にアクセス確認

### サイトリスタート API

```python
pp_token = get_token(scope="https://api.powerplatform.com/.default")
requests.post(
    f"https://api.powerplatform.com/powerpages/environments/{env_id}/websites/{site_id}/restart?api-version=2022-03-01-preview",
    headers={"Authorization": f"Bearer {pp_token}", "Content-Type": "application/json"},
)
```

---

## デプロイ運用

### `pac pages upload-code-site` はテンプレートを上書きする

毎回のアップロード後に `post_upload_fix.py` で再パッチが必要:

```bash
npm run build:pages
Remove-Item portal/dist/assets/* -Force  # 古いバンドル清掃
Copy-Item dist-pages/* portal/dist/ -Recurse -Force
cd portal; pac pages upload-code-site --rootPath . --compiledPath ./dist
cd ..; py scripts/post_upload_fix.py  # テンプレート再パッチ + リスタート
```

### 古いバンドルの蓄積問題

`portal/dist/assets/` に古い `index-*.js` が残ると、`post_upload_fix.py` が誤ったファイル名を検出する。デプロイ前に必ず清掃。

---

## UI パターン: 未認証モーダル

エラーメッセージではなくログインモーダルを表示:

```typescript
// src/components/require-auth.tsx
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) return <LoadingSpinner />;

  if (!isAuthenticated) {
    return (
      <Dialog open={true}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>ログインが必要です</DialogTitle>
            <DialogDescription>
              この機能を利用するにはログインしてください。
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => login()}>
            <LogIn className="h-4 w-4" /> ログイン
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return <>{children}</>;
}
```

ルーターで保護:
```typescript
const withAuth = (Component) => (
  <Suspense fallback={<PageLoader />}>
    <RequireAuth><Component /></RequireAuth>
  </Suspense>
);

// ホームは認証不要、機能ページは認証必須
{ index: true, element: withSuspense(HomePage) },
{ path: "incidents", element: withAuth(IncidentsPage) },
```

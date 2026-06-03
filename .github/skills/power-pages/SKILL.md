---
name: power-pages
description: "Power Pages Code Site (SPA) の開発・ビルド・デプロイ。pac pages upload-code-site でサイト作成からデプロイまで完結する。"
category: ui
triggers:
  - "Power Pages"
  - "pac pages"
  - "upload-code-site"
  - "コードサイト"
  - "code site"
  - "SPA"
  - "ポータル"
  - "外部サイト"
  - "Power Pages デプロイ"
  - "site settings"
  - "テーブル権限"
  - "table permissions"
  - "Web ロール"
  - "Enhanced Data Model"
  - "powerpagecomponent"
  - "403 Forbidden"
  - "404 Resource not found"
  - "9004010C"
---

# Power Pages Code Site (SPA) 開発・デプロイスキル

> **公式リファレンス**: [Power Pages でシングルページ アプリケーションを作成して展開する | Microsoft Learn](https://learn.microsoft.com/ja-jp/power-pages/configure/create-code-sites)
> **新スキル参照**: [microsoft/power-platform-skills - power-pages](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages)

---

## ★★★ 重要教訓: EDM 2.0 Code Site のテーブル権限とSSO

> **実案件 (IncidentPortal02) のデバッグで確定した知見。geeksupport（動作済み参考サイト）との比較で裏取り済み。**

### 教訓 1: 認証判定で contact テーブルをクエリしてはいけない

```
❌ NG: /_api/contacts?$select=contactid&$top=1 をセッション検証に使う
       → contact の Table Permission がないと 403 EntityPermissionReadIsMissing

✅ OK: window.Microsoft.Dynamic365.Portal.User を信頼する（API 呼び出し不要）
       認証はサーバー側セッション Cookie で完結している
```

**根拠:** geeksupport（動作済み参考サイト）は contact テーブル権限を持たず、`/_api/contacts` を一切呼ばないが正常動作する。認証はポータルランタイムが注入する `window.Microsoft.Dynamic365.Portal.User` だけで判定すべき。

### 教訓 2: EDM 2.0 Code Site では Webapi/* Site Settings は不要

```
❌ NG: Webapi/contact/enabled, Webapi/contact/fields 等を作成
       → EDM 2.0 では不要。Standard Data Model (SDM) の legacy 設定。

✅ OK: mspp_entitypermissions（テーブル権限）+ mspp_webroles（Web ロール）の
       N:N 関連付けだけで /_api/ アクセスが制御される
```

**根拠:** geeksupport は Webapi/* Site Settings が 0 件だが、`/_api/` で全ビジネステーブルに正常アクセスできる。

### 教訓 3: Website ID の取り違え

```
❌ NG: .env の WEBSITE_ID と実際の mspp_websites/powerpagesites の ID が不一致
       → テーブル権限を作っても「別サイトの権限」になり効かない

✅ OK: pac org who で確認した環境の mspp_websites から正確な ID を取得

確認コマンド:
  GET /api/data/v9.2/mspp_websites?$select=mspp_websiteid,mspp_name
  GET /api/data/v9.2/powerpagesites?$select=powerpagesiteid,name
```

**注意:** EDM 2.0 では `mspp_websites` と `powerpagesites` の両方にレコードが存在する。ID は共通。

### 教訓 4: pac CLI の環境接続ミス

```
❌ NG: pac が別環境に接続されたままアップロード → 間違ったサイトに反映
       pac org select は InvalidOperationException で crash することがある

✅ OK: pac auth create --name "xxx" --environment "https://{org}.crm.dynamics.com/"
       で明示的に新規プロファイルを作成してから pac org who で確認
```

### 教訓 5: テーブル権限には append/appendto = true が必要

```
❌ NG: Read/Write/Create だけ true にして append/appendto が false
       → リレーション（Lookup）のあるテーブルで書き込みが 403

✅ OK: 全ビジネステーブルで append=true, appendto=true を設定
```

### 教訓 6: Authenticated Users ロールは「認証済み全ユーザーに自動付与」ロール

```
確認: mspp_authenticatedusersrole = true のロールを使う
      （手動で contact に N:N 関連付けする必要なし）
```

### まとめ: EDM 2.0 Code Site の正しい権限設定パターン

```python
# geeksupport と同じ構成:
# 1. mspp_entitypermissions を作成（Global scope, R/W/C/Append/AppendTo）
# 2. mspp_entitypermission_webrole N:N で「Authenticated Users」にリンク
# 3. Webapi/* Site Settings は作らない
# 4. 認証フックで /_api/contacts をクエリしない

SCOPE_GLOBAL = 756150000

permissions = [
    {"table": "geek_incident", "read": True, "write": True, "create": True,
     "delete": False, "append": True, "appendto": True},
    {"table": "geek_incidentcategory", "read": True, "write": False, "create": False,
     "delete": False, "append": True, "appendto": True},
    {"table": "geek_incidentcomment", "read": True, "write": True, "create": True,
     "delete": False, "append": True, "appendto": True},
]

# contact テーブル権限はプロフィール編集が必要な場合のみ追加
# 認証チェック目的では不要
```

---

## 核心原則

1. **`pac pages upload-code-site` がサイト作成とデプロイの両方を行う** — API でサイトを事前作成する必要はない
2. **初回は Inactive Sites に作成される** → Power Pages ポータル or PP API でアクティブ化
3. **2回目以降は upload-code-site → restart の2ステップだけ**
4. **Post-Upload Fix は不要** — `upload-code-site` が header/footer/page を正しく構成する
5. **`.powerpages-site/` は upload-code-site が自動管理する** — ただし `site-settings/` YAML は手動追加して永続化できる（下記参照）
6. **`adx_website` レコードは絶対に削除しない** — EDM 2.0 でもランタイムが起動時に参照する
7. **環境のクリーンアップ時は PP API のサイト一覧と照合してから削除する** — 誤削除で 500 エラー
8. **`credentials: "same-origin"` を使う** — `"include"` ではない（same-site Cookie 認証）
9. **powerpagecomponent type=18 には `powerpagesitelanguageid` が必須** — 未設定だと 404 になる

## ワークフロー

```
初回:
  npm run build → pac pages upload-code-site → Activate → setup_contact_webapi.py → Restart

2回目以降:
  npm run build → pac pages upload-code-site → Restart
```

## 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| `pac` (Power Platform CLI) | 1.44+ | サイト作成・アップロード |
| `node` + `npm` | 18+ | SPA ビルド |
| Python 3 | 3.10+ | デプロイスクリプト（任意） |

### .env パラメータ

```env
DATAVERSE_URL=https://{org}.crm.dynamics.com/
ENV_ID=                               # Power Platform 環境 ID
```

## プロジェクト構造（公式準拠）

```text
portal/
├── src/
│   ├── App.tsx                   ← ルート (HashRouter + Routes)
│   ├── main.tsx                  ← エントリポイント
│   ├── index.css                 ← Tailwind CSS
│   ├── components/
│   │   ├── site-layout.tsx       ← ヘッダー・ナビ・プロフィールドロップダウン
│   │   ├── require-auth.tsx      ← 認証ガードコンポーネント
│   │   ├── mode-toggle.tsx       ← ダーク/ライト切替
│   │   └── ui/                   ← shadcn/ui コンポーネント
│   ├── hooks/
│   │   └── use-auth.ts           ← SSO 認証フック
│   ├── lib/
│   │   ├── api.ts                ← ★ Web API 共有クライアント (apiGet/apiPost/apiPatch)
│   │   └── utils.ts              ← cn() ユーティリティ
│   └── pages/
│       ├── home.tsx              ← ランディングページ
│       └── profile.tsx           ← プロフィール編集 (★ api.ts を使用)
├── dist-site/                    ← ビルド出力 (compiledPath)
├── .powerpages-site/             ← upload-code-site が管理 + site-settings YAML 手動追加可
│   └── site-settings/            ← Webapi/* 設定を YAML で永続化
├── powerpages.config.json        ← CLI 設定ファイル (必須)
├── package.json
├── vite.config.ts
└── scripts/
    ├── deploy.py                 ← デプロイスクリプト (Build→Upload→Restart)
    └── setup_contact_webapi.py   ← Contact Web API 有効化 (EDM 2.0 対応)
```

---

## ★ Web API 共有クライアント (api.ts)

**すべての `/_api/` 呼び出しはこの共有クライアントを通す。**
microsoft/power-platform-skills の `/integrate-webapi` パターンに準拠。

```typescript
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

async function getRequestVerificationToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  // 1. DOM から取得（ページにトークンが埋め込まれている場合）
  const input = document.querySelector<HTMLInputElement>(
    'input[name="__RequestVerificationToken"]',
  );
  if (input?.value) {
    cachedToken = input.value;
    return cachedToken;
  }

  // 2. /_layout/tokenhtml から取得（SPA フォールバック）
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
    credentials: "same-origin",  // ★ "include" ではなく "same-origin"
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
```

**ポイント:**
- `credentials: "same-origin"` — Power Pages は same-site なので `include` は不要
- `Prefer: odata.include-annotations="*"` — lookup の FormattedValue を取得
- `handleResponse` でリダイレクト検出 + 詳細エラーログ出力
- anti-forgery token は DOM → `/_layout/tokenhtml` フォールバックでキャッシュ
- lookup の書き込みには `@odata.bind` を使用: `"geek_inquirerid@odata.bind": "/contacts(...)"`

---

## ★ SSO + プロフィール編集 (デフォルト実装)

### use-auth.ts（★ contact テーブルを読まない — 教訓 1）

```typescript
import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  contactId: string;
  fullName: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Power Pages 認証フック
 *
 * 認証判定: ポータルが注入する window.Microsoft.Dynamic365.Portal.User を信頼する。
 * /_api/contacts をクエリしてはいけない（Table Permission がなくても認証は有効）。
 * 認証はサーバー側セッション Cookie で完結している。
 */
export function useAuth() {
  const [state, setState] = useState<{
    isAuthenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
  }>({ isAuthenticated: false, user: null, loading: true });

  useEffect(() => {
    const portalUser = (window as any)["Microsoft"]?.Dynamic365?.Portal?.User;
    const contactId = portalUser?.contactId || portalUser?.id || "";

    if (contactId) {
      setState({
        isAuthenticated: true,
        user: {
          contactId,
          fullName: portalUser?.fullName || portalUser?.fullname || "",
          email: portalUser?.emailAddress || portalUser?.emailaddress1 || "",
          firstName: portalUser?.firstName || portalUser?.firstname || "",
          lastName: portalUser?.lastName || portalUser?.lastname || "",
          phone: portalUser?.telephone1 || "",
        },
        loading: false,
      });
    } else {
      setState({ isAuthenticated: false, user: null, loading: false });
    }
  }, []);

  const login = useCallback(async () => {
    // /SignIn から anti-forgery token を取得し、直接 Entra ID に POST（クラシックページ非表示）
    try {
      const res = await fetch("/SignIn?returnUrl=/", { credentials: "same-origin" });
      const html = await res.text();
      const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
      const providerMatch = html.match(/name="provider"[^>]*value="([^"]+)"/);
      if (tokenMatch && providerMatch) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/Account/Login/ExternalLogin";
        form.style.display = "none";
        const fields: Record<string, string> = {
          provider: providerMatch[1],
          returnUrl: "/",
          __RequestVerificationToken: tokenMatch[1],
        };
        for (const [name, value] of Object.entries(fields)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }
    } catch { /* fallback below */ }
    window.location.href = "/SignIn?returnUrl=/";
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
  }, []);

  return { ...state, login, logout };
}
```

### profile.tsx（api.ts を使用）

```tsx
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPatch, ApiAuthError } from "@/lib/api";

interface ContactProfile {
  firstname: string;
  lastname: string;
  emailaddress1: string;
  telephone1: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ContactProfile>({
    firstname: "", lastname: "", emailaddress1: "", telephone1: "",
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!user?.contactId) return;
    fetchProfile();
  }, [user?.contactId]);

  async function fetchProfile() {
    const path = `contacts(${user!.contactId})?$select=firstname,lastname,emailaddress1,telephone1`;
    try {
      const data = await apiGet<ContactProfile>(path);
      setProfile({
        firstname: data.firstname || "",
        lastname: data.lastname || "",
        emailaddress1: data.emailaddress1 || "",
        telephone1: data.telephone1 || "",
      });
    } catch (e) {
      if (e instanceof ApiAuthError) {
        setMessage({ type: "error", text: `認証エラー (${e.status})。再ログインしてください。\nGET /_api/${path}` });
      } else {
        setMessage({ type: "error", text: `取得失敗。\nGET /_api/${path}\n${e instanceof Error ? e.message : String(e)}` });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const path = `contacts(${user!.contactId})`;
    try {
      await apiPatch(path, {
        firstname: profile.firstname,
        lastname: profile.lastname,
        telephone1: profile.telephone1,
      });
      setMessage({ type: "success", text: "プロフィールを更新しました" });
    } catch (e) {
      if (e instanceof ApiAuthError) {
        setMessage({ type: "error", text: `認証エラー (${e.status})。\nPATCH /_api/${path}` });
      } else {
        setMessage({ type: "error", text: `更新失敗。\nPATCH /_api/${path}\n${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }
  // ... UI は省略（詳細はテンプレート参照）
}
```

**旧実装との差分:**
- ❌ 旧: 生 `fetch` + `credentials: "include"` + 手動トークン取得
- ✅ 新: `apiGet`/`apiPatch` + `credentials: "same-origin"` + 自動トークン + 詳細エラー表示

---

## ★ Contact テーブル Web API 有効化 (EDM 2.0)

> ⚠️ **EDM 2.0 では `Webapi/*` Site Settings は不要**（教訓 2 参照）。
> geeksupport（動作済み参考サイト）は Webapi/* 設定なしで全テーブルにアクセス可能。
> 以下の手順は **Standard Data Model (SDM) のレガシーパターン** であり、
> 新規 Code Site では `mspp_entitypermissions` + `mspp_webroles` N:N だけで十分。

### 重大な教訓: 404 "Resource not found for the segment contact"

**エラーコード 9004010C** が発生する場合、以下の **4 つのレイヤーすべて** が正しく設定されている必要がある:

| # | レイヤー | テーブル | 紐付け先 |
|---|---------|---------|---------|
| 1 | `adx_sitesettings` | `Webapi/contact/enabled=true` | `adx_websites` |
| 2 | `adx_sitesettings` | `Webapi/contact/fields=*` | `adx_websites` |
| 3 | `powerpagecomponent` type=18 | テーブル権限 (Self) | `powerpagesites` + **`powerpagesitelanguages`** |
| 4 | `powerpagecomponent_powerpagecomponent` N:N | 権限→Web ロール紐付け | type=11 (Authenticated Users) |

### ⚠️ 致命的な落とし穴: `powerpagesitelanguageid`

```
根本原因: powerpagecomponent type=18 に powerpagesitelanguageid が null だと、
         Power Pages ランタイムがテーブル権限を認識せず 404 を返す。

確認方法:
GET /api/data/v9.2/powerpagecomponents({perm_id})?$select=_powerpagesitelanguageid_value

修正方法:
PATCH /api/data/v9.2/powerpagecomponents({perm_id})
{
  "powerpagesitelanguageid@odata.bind": "/powerpagesitelanguages({lang_id})"
}
```

### powerpagecomponent type=18 の正しい content 形式

```json
{
  "entitylogicalname": "contact",
  "entityname": "contact - Self Read Write",
  "scope": 756150001,
  "read": true,
  "write": true,
  "create": false,
  "delete": false,
  "append": false,
  "appendto": false
}
```

**注意:**
- ❌ `mspp_entityname`, `mspp_scope: "756150001"` (文字列) — 古いフォーマット、動作しない場合がある
- ✅ `entitylogicalname`, `scope: 756150001` (整数), `read: true` (bool) — system format

### scope 値一覧

| 値 | スコープ | 用途 |
|---|---------|------|
| 756150000 | Global | 全レコード読み取り |
| 756150001 | Self (Contact) | 自分の Contact レコードのみ |
| 756150002 | Account | 自分の Account 配下 |
| 756150003 | Parent | 親権限に紐づくレコード |

### setup_contact_webapi.py（正しい実装）

```python
# 1. adx_sitesettings (→ adx_websites にバインド)
create_site_setting("Webapi/contact/enabled", "true", website_id)
create_site_setting("Webapi/contact/fields", "*", website_id)  # system table は * 推奨

# 2. powerpagecomponent type=18 (★ powerpagesitelanguageid 必須)
content = json.dumps({
    "entitylogicalname": "contact",
    "entityname": "contact - Self Read Write",
    "scope": 756150001,
    "read": True, "write": True, "create": False,
    "delete": False, "append": False, "appendto": False,
})
body = {
    "powerpagecomponenttype": 18,
    "name": "contact - Self Read Write",
    "content": content,
    "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({lang_id})",  # ★ 必須！
}

# 3. Authenticated Users (type=11) への N:N リンク
POST /powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref
{"@odata.id": "/api/data/v9.2/powerpagecomponents({role_id})"}
```

> ⚠️ **よくあるミス（修正済み）:**
> - `powerpagesitelanguageid` が null → ランタイムが権限を無視して 404
> - content に `mspp_` プレフィックスの文字列値 → 整数・bool 値が正しい
> - `credentials: "include"` → 正しくは `"same-origin"`
> - `Webapi/<table>/fields` に明示リストのみ → system table は `*` を使う

---

## ★ デバッグ用 Site Settings

### Webapi/error/innererror

開発・デバッグ中は以下を有効にする:

```python
# Dataverse API で直接追加
body = {
    "adx_name": "Webapi/error/innererror",
    "adx_value": "true",
    "adx_websiteid@odata.bind": f"/adx_websites({website_id})",
}
requests.post(f"{DV}/api/data/v9.2/adx_sitesettings", headers=h, json=body)
```

これにより `/_api/` のエラーレスポンスに `innererror` が含まれ、デバッグが容易になる。

> ⚠️ **本番環境では `false` に戻す** — 内部エラー情報が漏洩するリスクがある。

---

## ★ `.powerpages-site/site-settings/` による永続化

`pac pages upload-code-site` は `.powerpages-site/` フォルダの内容を同期する。
`site-settings/` に Webapi 設定の YAML を配置すると、デプロイ時に自動反映される。

### YAML フォーマット

```yaml
# .powerpages-site/site-settings/Webapi-contact-enabled.sitesetting.yml
id: <既存レコードの adx_sitesettingid>
name: Webapi/contact/enabled
source: 0
value: "true"
```

```yaml
# .powerpages-site/site-settings/Webapi-contact-fields.sitesetting.yml
id: <既存レコードの adx_sitesettingid>
name: Webapi/contact/fields
source: 0
value: "*"
```

```yaml
# .powerpages-site/site-settings/Webapi-error-innererror.sitesetting.yml
id: <新規 GUID>
name: Webapi/error/innererror
source: 0
value: "true"
```

**ID の取得方法:** Dataverse から `adx_sitesettings` をクエリして `adx_sitesettingid` を取得。
新規の場合は任意の GUID を生成。

---

## エラーコード早見表

| HTTP | OData Code | メッセージ | 原因 | 対策 |
|------|-----------|---------|------|------|
| 404 | 9004010C | Resource not found for the segment `<table>` | テーブル権限未設定 or `powerpagesitelanguageid` が null | `setup_contact_webapi.py` 実行 |
| 400 | 9004010A | Invalid column name | `$select` に存在しないカラム名 | `EntityDefinitions` でカラム名確認 |
| 403 | — | Forbidden | `Webapi/<table>/fields` にカラムが含まれていない | fields を `*` に設定、または具体カラム追加 |
| 302 | — | Login redirect | 未認証 | SSO ログインさせる |

---

## powerpages.config.json（必須）

```json
{
  "siteName": "MySite",
  "compiledPath": "dist-site",
  "defaultLandingPage": "index.html"
}
```

---

## Step 1: SPA 開発

### Vite 設定（必須制約）

```typescript
// vite.config.ts
export default defineConfig({
  base: "./",                                    // 相対パス（必須）
  build: {
    outDir: "dist-site",                         // powerpages.config.json と一致
    rollupOptions: {
      output: { inlineDynamicImports: true },    // 単一バンドル（推奨）
    },
  },
});
```

| 制約 | 理由 |
|------|------|
| `base: "./"` | Power Pages のパス構造に対応 |
| `inlineDynamicImports: true` | コード分割するとロード順問題が発生 |
| **Hash ルーティング必須** | History API モードは直接 URL アクセスで 404 |
| 静的 SPA のみ | SSR / ISR 非対応 |

### package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "deploy": "npm run build && pac pages upload-code-site --rootPath .",
    "deploy:full": "py scripts/deploy.py"
  }
}
```

---

## Step 2: 初回デプロイ

### 2-A: JavaScript ファイルのアップロード許可

環境で `.js` がブロックされている場合:
1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) → 環境選択
2. 設定 → プライバシー + セキュリティ
3. ブロックされた添付ファイルから `js` を削除

### 2-B: ビルド & アップロード

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath .
```

### 2-C: サイトのアクティブ化

Power Pages ポータルの Inactive sites から **再アクティブ化** をクリック。

### 2-D: Contact Web API 有効化（★初回必須）

```bash
py portal/scripts/setup_contact_webapi.py
```

### 2-E: サイト再起動

```bash
py .github/skills/standard/scripts/_restart.py
```

> アクティブ化後、URL にアクセスできるまで **60〜90秒** かかる。

---

## Step 3: 再デプロイ（2回目以降）

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath .
# → サイト再起動
py ../.github/skills/standard/scripts/_restart.py
```

---

## 既知の無害な警告

Power Pages ホスト (React 17) と SPA (React 19) の共存により以下が発生するが、**機能に影響なし**:

```
Unsatisfied version 16.14.0 from @microsoft/powerpages-host of shared singleton module react-dom (required ^17.0.0)
Some icons were re-registered...
```

SPA は独自の React 19 バンドルで動作するため、ホスト側の React 17 とは干渉しない。

---

## チェックリスト

- [ ] `powerpages.config.json` が存在する
- [ ] `vite.config.ts` で `base: "./"` + `inlineDynamicImports: true`
- [ ] HashRouter を使用している
- [ ] `api.ts` で `credentials: "same-origin"` を使用
- [ ] **use-auth.ts が `/_api/contacts` をクエリしていない**（教訓 1）
- [ ] テーブル権限 (`mspp_entitypermissions`) が正しい `powerpagesiteid` に紐づいている（教訓 3）
- [ ] テーブル権限に `append=true, appendto=true` が設定されている（教訓 5）
- [ ] テーブル権限が `Authenticated Users` ロールに N:N リンクされている
- [ ] `pac org who` で正しい環境に接続されていることを確認（教訓 4）
- [ ] EDM 2.0: `Webapi/*` Site Settings は不要（教訓 2）
- [ ] `Webapi/error/innererror = true` が開発環境で有効
- [ ] `.powerpages-site/site-settings/` に Webapi YAML が配置済み（SDM の場合のみ）

# 認証リファレンス (Authentication Reference)

> Based on [microsoft/power-platform-skills](https://github.com/microsoft/power-platform-skills) `setup-auth` skill.

## Power Pages コードサイトの認証アーキテクチャ

### 重要な原則

1. **Client-side auth は UX only** — 実際のアクセス制御はサーバーサイド table permissions
2. **認証はサーバーサイド（セッション Cookie）** — クライアントにトークン管理なし。fetch は `credentials: 'same-origin'`
3. **書き込みは anti-forgery token 必須** — `/_layout/tokenhtml` から `__RequestVerificationToken` を取得しヘッダーに付与
4. **ユーザー情報は 2 経路** — `window.Microsoft.Dynamic365.Portal.User`（標準注入）または Liquid `window.__PP_USER__`
5. **SSO 自動リダイレクト** — `LoginButtonAuthenticationType` 設定で IdP に直行（ログインページ非表示）

> **検証済みの実装は [`templates/corporate-lp/src/lib/dataverse.ts`](../templates/corporate-lp/src/lib/dataverse.ts) と
> [`templates/corporate-lp/src/hooks/use-auth.ts`](../templates/corporate-lp/src/hooks/use-auth.ts) をそのまま使う。**
>
> ⚠️ **`redirect: 'manual'` は使わない。** 実環境検証の結果、`credentials: 'same-origin'` +
> anti-forgery token のほうが安定する。`redirect: 'manual'` は opaqueredirect (status 0) の扱いが
> ブラウザ間で不安定で、書き込み時の token 付与とも噛み合わない。

### 認証フロー（PRIVATE サイト + LoginButtonAuthenticationType 推奨）

```
1. User accesses site → unauthenticated → 302 to /Account/Login
2. LoginButtonAuthenticationType is set
   → Platform auto-redirects to Azure AD (login page is NEVER shown)
3. User authenticates at Azure AD (or SSO if already signed in)
4. Callback → Power Pages validates token → sets session cookie
5. User redirected back to original URL
6. Web Template renders:
   <script>window.__PP_USER__ = {{ user | json }};</script>
   {{ page.adx_copy }}
7. SPA reads window.Microsoft.Dynamic365.Portal.User (or __PP_USER__) → user is available immediately
8. SPA fetch calls use credentials: 'same-origin':
   - GET: read セッション Cookie で認証
   - POST/PATCH/DELETE: /_layout/tokenhtml から __RequestVerificationToken を取得しヘッダー付与
   - If session expired: res.redirected && url.includes('/Account/Login') → ApiAuthError → login()
```

### Web テンプレートソース（Liquid ユーザー注入）

```liquid
<script>window.__PP_USER__={{ user | json }};</script>
{{ page.adx_copy }}
```

> **重要**: コードサイトでも Web テンプレートの Liquid は動作する。
> `{{ page.adx_copy }}` は mspp_copy のコンテンツ（SPA の HTML）を出力する。
> `{{ user | json }}` は認証済みユーザーの情報を JSON として出力する。

### Identity Provider 設定（手動）

> **CRITICAL**: API からは設定不可。Power Pages admin center で手動設定が必須。

1. https://make.powerpages.microsoft.com/ にアクセス
2. 対象サイトを選択
3. **Security** → **Identity Providers**
4. **Microsoft Entra ID** を有効化
5. デフォルト設定で OK（自動的に B2C/Entra ID が構成される）

### 必須サイト設定（YAML で管理すること）

> **CRITICAL**: `pac pages upload-code-site` は毎回 YAML ファイルの値で Dataverse を上書きする。
> 設定変更は YAML ファイルと Dataverse の両方を更新すること。

| Site Setting | Value | YAML管理 | Purpose |
|---|---|---|---|
| `Authentication/Registration/ProfileRedirectEnabled` | `false` | ✅ | ログイン後プロフィールリダイレクト無効化 |
| `Authentication/Registration/AzureADLoginEnabled` | `false` | ✅ | ビルトインプロバイダー無効化（カスタム使用時） |
| `Authentication/Registration/LocalLoginEnabled` | `false` | ✅ | ローカルログイン無効化 |
| `Authentication/Registration/OpenRegistrationEnabled` | `false` | ✅ | オープン登録無効化 |
| `Authentication/Registration/InvitationEnabled` | `false` | ✅ | 招待無効化 |
| `Authentication/Registration/LoginButtonAuthenticationType` | authority URL | ✅ | 自動リダイレクト（ログインページスキップ） |
| `Authentication/OpenIdConnect/{name}/Nonce` | `false` | ⚠️ | トラッキング防止対策 |

#### YAML ファイル例

```yaml
# .powerpages-site/site-settings/Authentication-Registration-LoginButtonAuthenticationType.sitesetting.yml
id: {guid}
name: Authentication/Registration/LoginButtonAuthenticationType
value: "https://login.microsoftonline.com/{tenant-id}/"
```

### LoginButtonAuthenticationType（自動リダイレクト）

| 項目 | 説明 |
|------|------|
| 目的 | ログインページを表示せず、直接 IdP にリダイレクト |
| 値 | プロバイダーの Authority URL（末尾 `/` 必須） |
| 例 | `https://login.microsoftonline.com/{tenant-id}/` |
| 動作 | /Account/Login アクセス時に platform が内部的に ExternalLogin POST を実行 |
| 前提 | 有効な IdP が1つだけ（AzureADLoginEnabled=false で重複排除） |

> **値は Authority URL を使う**: `https://login.microsoftonline.com/{tenant-id}/`（末尾 `/` 必須）。
> `https://sts.windows.net/{tenant-id}/` ではない。間違えると自動 SSO が効かない。

### ビルトイン vs カスタム OpenIdConnect

| 項目 | ビルトイン (AzureAD) | カスタム OpenIdConnect |
|------|------|------|
| response_type | `code id_token` | `id_token` |
| トラッキング防止耐性 | **強い**（code flow は Cookie に依存しにくい） | **弱い**（nonce Cookie ブロックで失敗） |
| 設定方法 | Power Pages admin center で有効化 | Dataverse site settings で手動設定 |
| LoginButtonAuthenticationType | 不要（単独なら自動リダイレクト） | Authority URL を設定 |
| Nonce 設定 | 不要 | `false` 推奨 |
| 推奨度 | ✅ **推奨** | ⚠️ トラブルが多い |

> **結論**: 特別な理由がない限り、ビルトイン Azure AD プロバイダーを使用する。
> カスタム OpenIdConnect は response_type=id_token のため、
> ブラウザのトラッキング防止機能で callback が失敗しやすい。

### ファイル構成（推奨）

| ファイル | 内容 |
|---|---|
| `src/hooks/use-auth.ts` | `window.Microsoft.Dynamic365.Portal.User` / `__PP_USER__` 読み取り + login()/logout() |
| `src/lib/dataverse.ts` | `credentials: 'same-origin'` + anti-forgery token + ApiAuthError |
| `src/components/require-auth.tsx` | 未認証ガード（ログイン誘導 UI） |
| `src/pages/profile.tsx` | ログインユーザーの Contact プロフィール編集 |

### use-auth.ts 実装パターン

> 完全な実装は [`templates/corporate-lp/src/hooks/use-auth.ts`](../templates/corporate-lp/src/hooks/use-auth.ts)。

```typescript
// Power Pages が注入するグローバル。2 経路を見る。
declare global {
  interface Window {
    Microsoft?: { Dynamic365?: { Portal?: { User?: PortalUser } } };
    __PP_USER__?: { id?: string; fullname?: string; emailaddress1?: string } | null;
  }
}

export function useAuth() {
  const [state, setState] = useState({ isAuthenticated: false, user: null, loading: true });

  useEffect(() => {
    // ① 標準注入: window.Microsoft.Dynamic365.Portal.User
    const portalUser = window.Microsoft?.Dynamic365?.Portal?.User;
    // ② フォールバック: Liquid 注入 window.__PP_USER__
    const ppUser = window.__PP_USER__;
    const id = portalUser?.contactId || ppUser?.id;
    if (id) {
      setState({ isAuthenticated: true, user: normalize(portalUser, ppUser), loading: false });
    } else {
      setState({ isAuthenticated: false, user: null, loading: false });
    }
  }, []);

  const login = () =>
    (window.location.href = `/SignIn?returnUrl=${encodeURIComponent(location.pathname + location.hash)}`);
  const logout = () => (window.location.href = "/Account/Login/LogOff");

  return { ...state, login, logout };
}
```

> **login() は `/SignIn?returnUrl=...`**。`LoginButtonAuthenticationType` が設定されていれば
> ログインページをスキップして Entra ID に直行し、認証後に returnUrl に戻る。

### dataverse.ts fetch パターン（検証済み）

> 完全な実装は [`templates/corporate-lp/src/lib/dataverse.ts`](../templates/corporate-lp/src/lib/dataverse.ts)。

```typescript
const BASE = "/_api";

export class ApiAuthError extends Error {
  constructor(status: number) { super(`Authentication required (${status})`); this.name = "ApiAuthError"; }
}

async function handleResponse<T>(res: Response): Promise<T> {
  // ブラウザがログインページにリダイレクトしたら検知
  if (res.redirected && res.url.includes("/Account/Login")) throw new ApiAuthError(302);
  if (res.status === 401) throw new ApiAuthError(401);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    credentials: "same-origin",  // ← redirect:'manual' ではなく same-origin Cookie 認証
    headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
  });
  return handleResponse<T>(res);
}

// 書き込みは anti-forgery token が必須
export async function apiPatch(path: string, body: unknown): Promise<void> {
  const token = await fetchVerificationToken(); // /_layout/tokenhtml キャッシュ付き
  const res = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0", "OData-Version": "4.0",
      ...(token ? { __RequestVerificationToken: token } : {}),
    },
    body: JSON.stringify(body),
  });
  return handleResponse<void>(res);
}
```

> **anti-forgery token 取得の優先順**: ① DOM hidden input / meta ② Cookie `__RequestVerificationToken`
> ③ `/_layout/tokenhtml` を fetch して `value="..."` を抽出。一度取れたらキャッシュする。
> token がないと POST/PATCH/DELETE は 401 になる。

### Private Site での認証

- Private site → 全ページで認証要求（ページロード = 認証済み）
- Identity Provider が未設定の場合は 401 エラー
- **解決**: admin center で Entra ID を有効化
- LoginButtonAuthenticationType 設定でログインページをスキップ可能

### サイト可視性と認証

| Visibility | 動作 |
|---|---|
| `private` | 全ページ認証必須。開発中はこちら推奨。SPA ロード時点で認証済み |
| `public` | 認証なしでアクセス可。公開前に table permissions を確認 |

### トラッキング防止問題（Tracking Prevention）

| ブラウザ | 影響 |
|---|---|
| Edge (Strict) | 3rd party cookie ブロック → nonce 検証失敗 → "Sign in failed" |
| Safari (ITP) | 同上 |
| Chrome (3PC Phase-out) | 将来的に影響 |

**対策**:
1. `Authentication/OpenIdConnect/{name}/Nonce` = `false`
2. ビルトインプロバイダー (response_type=code id_token) を使用（Cookie 依存が少ない）
3. LoginButtonAuthenticationType で platform 内部のリダイレクト機構を使用

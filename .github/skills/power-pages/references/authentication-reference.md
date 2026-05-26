# 認証リファレンス (Authentication Reference)

> Based on [microsoft/power-platform-skills](https://github.com/microsoft/power-platform-skills) `setup-auth` skill.

## Power Pages コードサイトの認証アーキテクチャ

### 重要な原則

1. **Client-side auth は UX only** — 実際のアクセス制御はサーバーサイド table permissions
2. **認証はサーバーサイド（セッション Cookie）** — クライアントにトークン管理なし
3. **PRIVATE サイトでは全ページ認証必須** — SPA ロード時点でユーザーは認証済み
4. **`window.__PP_USER__`** — Web テンプレートの Liquid で注入されたユーザー情報
5. **`redirect: 'manual'`** — SPA の全 fetch に必須（auth リダイレクト干渉防止）

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
7. SPA reads window.__PP_USER__ → user is available immediately
8. SPA fetch calls use redirect: 'manual':
   - If authenticated: normal response (200/204)
   - If session expired: opaqueredirect (status 0) → redirect to /Account/Login → step 2
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

> **注意**: SPA の fetch が未認証レスポンスを follow すると ExternalLogin に GET → 500。
> 必ず `redirect: 'manual'` を使うこと。

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
| `src/hooks/use-auth.ts` | `window.__PP_USER__` 読み取り + login()/logout() |
| `src/lib/dataverse.ts` | `redirect: 'manual'` + opaqueredirect 検知 |

### use-auth.ts 実装パターン

```typescript
declare global {
  interface Window {
    __PP_USER__?: { id?: string; fullname?: string; emailaddress1?: string } | null;
  }
}

export function useAuth() {
  const [state, setState] = useState({ isAuthenticated: false, user: null, loading: true });

  useEffect(() => {
    const ppUser = window.__PP_USER__;
    if (ppUser && ppUser.id) {
      setState({
        isAuthenticated: true,
        user: { contactId: ppUser.id, fullName: ppUser.fullname || "", email: ppUser.emailaddress1 || "" },
        loading: false,
      });
    } else {
      // PRIVATE site: page loaded = authenticated, but no user details available
      setState({ isAuthenticated: true, user: null, loading: false });
    }
  }, []);

  const login = () => { window.location.href = "/Account/Login"; };
  const logout = () => { window.location.href = "/Account/Login/LogOff"; };

  return { ...state, login, logout };
}
```

### dataverse.ts fetch パターン

```typescript
const API_BASE = "/_api";

async function handleResponse<T>(res: Response): Promise<T> {
  // redirect: 'manual' returns opaque redirect (type="opaqueredirect", status=0)
  if (res.type === "opaqueredirect" || res.status === 0) {
    window.location.href = "/Account/Login";
    return new Promise(() => {}); // never resolve - page will redirect
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      window.location.href = "/Account/Login";
      return new Promise(() => {});
    }
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiGet<T>(entity: string): Promise<T> {
  const res = await fetch(`${API_BASE}/${entity}`, {
    redirect: "manual",  // ← CRITICAL: prevents following auth redirects
    headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
  });
  return handleResponse<T>(res);
}
```

> **なぜ redirect: 'manual' が必要か**:
> - 未認証時、/_api/ は 302 → /Account/Login を返す
> - LoginButtonAuthenticationType が設定されていると、さらに 302 → /Account/Login/ExternalLogin
> - fetch のデフォルト (redirect: 'follow') だと ExternalLogin に GET リクエストが送られる
> - ExternalLogin は POST 専用のため GET → 500 Internal Server Error
> - redirect: 'manual' で最初の 302 をキャッチし、SPA 側でリダイレクト処理する

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

# 認証実装リファレンス（Power Pages）

Power Pages Code Site（SPA）における認証一式の実装サンプル。
**SSO（シングルサインオン）・サインアウト・ログインボタン・認証ガード・UI フロー** を 1 ファイルにまとめて収録する。
`geeksupport`（動作実績のある参考サイト）の実装に基づく。

> **位置づけ**: SKILL.md「SSO + プロフィール編集」の詳細版。
> Dataverse の読み書きクライアントは [Dataverse クライアント実装リファレンス](dataverse-client.md) を参照。
> 全体の責務分離は [upstream 優先構成ガイド](upstream-alignment.md) を参照。

---

## 0.1 microsoft/power-platform-skills との対応（認証・認可）

| 項目 | 対応スキル | このリファレンスで扱う範囲 |
|---|---|---|
| ログイン/ログアウト導線 | `setup-auth` | `useAuth`（`AUTH_PROVIDERS` 配列）、`ExternalLogin` POST、keepalive、認証ガード UI |
| Web ロール準備 | `create-webroles` | YAML ファイルによるロール定義 → [enhanced-data-model-permissions.md](enhanced-data-model-permissions.md) 参照 |
| サーバー側強制力 | `setup-auth` + `create-webroles` + テーブル権限 | クライアント側 role check は UX 制御のみ、実際のアクセス制御はサーバー側 |

> 要点: 認証スキルだけでは CRUD は成立しない。`create-webroles` とテーブル権限設定を組み合わせてはじめて一般ユーザーの認可が成立する。

---

## 0.2 対応 Identity Provider 一覧

Power Pages は以下の認証方式をサポートする。このリファレンスは React (use-auth.ts) の実装に注目するが、認証フロー自体はサーバー側で完結するためフレームワーク非依存。

| プロバイダー種別 | 概要 | ログインエンドポイント | Provider Identifier |
|---|---|---|---|
| **Microsoft Entra ID** | Azure AD / Entra ID（社員向け） | `/Account/Login/ExternalLogin` | `https://login.windows.net/{tenantId}/` |
| **Entra External ID** | 顧客向け CIAM（セルフサービス登録） | `/Account/Login/ExternalLogin` | `Authentication/OpenIdConnect/{name}/AuthenticationType` の値（ciamlogin.com URL） |
| **OpenID Connect (Generic)** | Okta, Auth0, Ping など OIDC 準拠 | `/Account/Login/ExternalLogin` | `Authentication/OpenIdConnect/{name}/AuthenticationType` の値 |
| **SAML2** | ADFS, Shibboleth など | `/Account/Login/ExternalLogin` | `Authentication/SAML2/{name}/AuthenticationType` の値 |
| **WS-Federation** | WS-Fed プロバイダー | `/Account/Login/ExternalLogin` | `Authentication/WsFederation/{name}/AuthenticationType` の値 |
| **ローカル認証** | ユーザー名/パスワード（外部 IdP 不要） | `/SignIn` | N/A（直接 POST） |
| **Microsoft Account** | Microsoft 個人/職場アカウント（ソーシャル） | `/Account/Login/ExternalLogin` | `urn:microsoft:account` |
| **Facebook** | Facebook ソーシャルログイン | `/Account/Login/ExternalLogin` | `Facebook` |
| **Google** | Google ソーシャルログイン | `/Account/Login/ExternalLogin` | `Google` |

> **顧客向けポータルには Entra External ID (CIAM) を推奨**。Entra ID（workforce）は社員向け。`setup-auth` の Smart Inference に従うと、内部ポータル → Entra ID、顧客ポータル → Entra External ID が選択される。

---

## 0. 認証モデル（Code Apps との最大の違い）

| 項目 | Power Pages | Code Apps |
|------|-------------|-----------|
| 認証の場所 | **サーバー側（セッション Cookie）** | クライアント + コネクタ |
| トークン管理 | なし（Cookie をブラウザが自動送信） | SDK が内部管理 |
| ログイン | サーバーへ form POST → Entra ID へリダイレクト | コネクタのサインイン |
| ユーザー情報 | `window.Microsoft.Dynamic365.Portal.User`（ランタイム注入） | `getContext().user` |
| ユーザー実体 | **contact**（ポータルユーザー） | **systemuser**（Dataverse ユーザー） |

> **重要（教訓）**: 認証判定で `/_api/contacts` をクエリしてはいけない。
> contact の Table Permission が無いと 403 になる。認証はサーバー側セッション Cookie で完結しており、
> クライアントはポータルが注入する `window.Microsoft.Dynamic365.Portal.User` を**信頼するだけ**でよい。

---

## 1. AUTH_PROVIDERS 配列パターン（マルチプロバイダー対応）

> **upstream 準拠**: `microsoft/power-platform-skills setup-auth` は `AUTH_PROVIDERS` 配列でマルチプロバイダーを管理する。単一プロバイダーでも同じパターンを使うことで拡張性を保つ。

サイトに設定された IdP を `AUTH_PROVIDERS` 配列として定義する。`providerIdentifier` は `ExternalLogin` POST の `provider` フィールドに送る値（= サイト設定 `AuthenticationType` の値）。

```typescript
// src/services/authService.ts（マルチプロバイダー対応）

/** プロバイダー識別子の解決パターン */
export interface AuthProvider {
  id: string;           // アプリ内 ID（例: 'entra-id', 'entra-external', 'local'）
  type: 'entra-id' | 'oidc' | 'saml2' | 'ws-federation' | 'local' | 'social';
  displayName: string;  // ログインボタンのラベル
  /** ExternalLogin POST の provider 値。entra-id の場合は undefined（runtime 解決）。local は不要。 */
  providerIdentifier?: string;
}

/**
 * サイトに設定された IdP 一覧。
 * entra-id: providerIdentifier を省略 → resolveProviderIdentifier() で Portal.tenant から動的解決。
 * その他: AuthenticationType サイト設定の値を直接指定。
 */
export const AUTH_PROVIDERS: AuthProvider[] = [
  // 内部ポータル（Entra ID）の例:
  {
    id: 'entra-id',
    type: 'entra-id',
    displayName: 'Microsoft アカウントでサインイン',
    // providerIdentifier は省略 → Portal.tenant から自動解決
  },
  // 顧客ポータル（Entra External ID / CIAM）の例（上記の代わりに使用）:
  // {
  //   id: 'entra-external',
  //   type: 'oidc',
  //   displayName: 'サインイン',
  //   providerIdentifier: 'https://{subdomain}.ciamlogin.com/{tenantId}',
  // },
];

/**
 * Entra ID（workforce）用: Portal.tenant から provider identifier を動的解決する。
 * 他のプロバイダーは AUTH_PROVIDERS に直接 providerIdentifier を設定する。
 */
export function resolveProviderIdentifier(provider: AuthProvider): string {
  if (provider.type === 'entra-id') {
    const tenantId = (window as any)["Microsoft"]?.Dynamic365?.Portal?.tenant;
    return `https://login.windows.net/${tenantId}/`;
  }
  return provider.providerIdentifier ?? '';
}
```

> **Entra ID の特殊ケース**: Power Pages は Entra ID（workforce）のサイト設定 `Authentication/OpenIdConnect/AzureAD/AuthenticationType` に `https://login.windows.net/{tenantId}/` を自動設定する（`login.microsoftonline.com` ではない）。この値は `Portal.tenant` から runtime 解決するので SPA にハードコードしない。

---

## 2. 認証フック（`src/hooks/use-auth.ts`）

SSO ログイン・サインアウト・認証状態判定をすべて担う中核。`AUTH_PROVIDERS` 配列のうち最初のプロバイダーでログインする。

```typescript
// src/hooks/use-auth.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { AUTH_PROVIDERS, resolveProviderIdentifier } from "@/services/authService";

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

  // ── 認証状態の判定（API 呼び出しなし）──
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

  // ── Session keepalive（SPA セッション維持）──
  // Ref: microsoft/power-platform-skills setup-auth Session KeepAlive pattern
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    keepAliveRef.current = setInterval(() => {
      fetch("/_layout/tokenhtml", { credentials: "same-origin" }).catch(() => {});
    }, INTERVAL_MS);
    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    };
  }, [state.isAuthenticated]);

  // ── ① 外部 IdP ログイン（ExternalLogin POST）──
  // /_layout/tokenhtml から anti-forgery token を取得し、
  // provider identifier を解決して /Account/Login/ExternalLogin に POST。
  // Ref: microsoft/power-platform-skills setup-auth resolveProviderIdentifier()
  const login = useCallback(async (providerId?: string) => {
    if (window.location.hash) {
      sessionStorage.setItem("pp_return_hash", window.location.hash);
    }

    const provider = providerId
      ? AUTH_PROVIDERS.find((p) => p.id === providerId) ?? AUTH_PROVIDERS[0]
      : AUTH_PROVIDERS[0];

    if (provider.type === 'local') {
      // ローカル認証は別フォームへ（Section 5 参照）
      window.location.href = "/SignIn?returnUrl=/";
      return;
    }

    const providerIdentifier = resolveProviderIdentifier(provider);
    if (!providerIdentifier) {
      window.location.href = "/SignIn?returnUrl=/";
      return;
    }

    try {
      // Lightweight endpoint — no full HTML page parse needed
      const tokenRes = await fetch("/_layout/tokenhtml", { credentials: "same-origin" });
      const tokenHtml = await tokenRes.text();
      const tokenMatch = tokenHtml.match(/value="([^"]+)"/);

      if (tokenMatch) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/Account/Login/ExternalLogin";
        form.style.display = "none";
        const fields: Record<string, string> = {
          provider: providerIdentifier,
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
    // フォールバック: 標準サインインページへ
    window.location.href = "/SignIn?returnUrl=/";
  }, []);

  // ── ② サインアウト（ローカルログアウト）──
  const logout = useCallback(() => {
    sessionStorage.removeItem("pp_return_hash");
    window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
  }, []);

  return { ...state, login, logout };
}
```

### ExternalLogin POST パターン比較

| パターン | 挙動 | 用途 |
|------|------|------|
| **`/_layout/tokenhtml` + `resolveProviderIdentifier()` → form POST**（推奨） | anti-forgery token を軽量エンドポイントから取得、provider を runtime 解決 | 推奨（microsoft/power-platform-skills 準拠） |
| **`/SignIn` HTML パース → form POST** | `/SignIn` ページ HTML をフェッチして token + provider を抽出 | レガシー（重い HTML をパースする） |
| 単純リダイレクト `/SignIn?returnUrl=/` | 標準サインインページを経由 | 複数 IdP 並立時 or フォールバック |

> `provider` 値はサイト設定 `Authentication/OpenIdConnect/{name}/AuthenticationType`（または SAML2/WsFed）と**完全一致**する必要がある。Entra ID のみ `Portal.tenant` から runtime 解決する。

---

## 3. ③ ログイン / サインアウトボタン（ヘッダー UI）

ヘッダーで認証状態に応じてボタンを出し分ける。`useAuth` の `login` / `logout` を呼ぶだけ。

```tsx
// src/components/site-header.tsx
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut } from "lucide-react";

export function SiteHeader() {
  const { isAuthenticated, user, login, logout } = useAuth();

  return (
    <header /* ... */>
      <div className="flex items-center gap-2">
        {isAuthenticated ? (
          <>
            {/* ログイン中: ユーザー名 + サインアウトボタン */}
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {user?.fullName}
            </span>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">ログアウト</span>
            </Button>
          </>
        ) : (
          // 未認証: ログインボタン
          <Button variant="outline" size="sm" onClick={login} className="gap-1.5 font-medium">
            <LogIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">ログイン</span>
          </Button>
        )}
      </div>
    </header>
  );
}
```

---

## 4. 認証ガード（ルート保護の UI フロー）

未認証ユーザーにログイン導線を出す `RequireAuth` コンポーネント。

```tsx
// src/components/require-auth.tsx
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, login } = useAuth();

  // ローディング中はスピナー
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // 未認証ならログイン導線を表示
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">ログインが必要です</h2>
          <p className="text-muted-foreground">
            この機能を利用するにはログインしてください。
          </p>
        </div>
        <Button size="lg" onClick={login}>
          <LogIn className="h-4 w-4" />
          ログイン
        </Button>
      </div>
    );
  }

  // 認証済みなら子要素を表示
  return <>{children}</>;
}
```

---

## 5. ルーティングへの組み込み（UI フロー全体）

`RequireAuth` で保護ルートを包む。公開ページ（ホーム）はガード無し。

```tsx
// src/App.tsx
import { HashRouter, Routes, Route } from "react-router-dom";
import { RequireAuth } from "@/components/require-auth";
import { SiteHeader } from "@/components/site-header";

export default function App() {
  return (
    <HashRouter> {/* ★ Power Pages では Hash ルーティング必須 */}
      <SiteHeader />
      <main>
        <Routes>
          {/* 公開ページ */}
          <Route path="/" element={<HomePage />} />

          {/* 保護ページ: RequireAuth で包む */}
          <Route
            path="/incidents"
            element={
              <RequireAuth>
                <IncidentListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/incidents/new"
            element={
              <RequireAuth>
                <IncidentNewPage />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </HashRouter>
  );
}
```

---

## 6. 認証 UI フロー図

```mermaid
flowchart TD
  A[ユーザーが保護ページにアクセス] --> B{Portal.User あり?}
  B -- なし --> C[RequireAuth: ログイン導線を表示]
  C --> D[ログインボタン click → login]
  D --> E[/SignIn から token+provider を取得/]
  E --> F[/Account/Login/ExternalLogin へ form POST/]
  F --> G[Entra ID で SSO 認証]
  G --> H[ポータルがセッション Cookie を発行]
  H --> I[ランタイムが window...Portal.User を注入]
  I --> J[SPA 再ロード → 認証済み]
  B -- あり --> J
  J --> K[保護ページを表示]
  K --> L[サインアウト click → logout]
  L --> M[/Account/Login/LogOff/]
  M --> A
```

---

## 7. プロフィール編集の例（認証ユーザーで contact を読み書き）

ログインユーザーの contact レコードを `apiGet` / `apiPatch` で読み書きする。
`ApiAuthError` をハンドリングして再ログインを促す。

```tsx
// src/pages/profile.tsx
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!user?.contactId) return;
    const path = `contacts(${user.contactId})?$select=firstname,lastname,emailaddress1,telephone1`;
    apiGet<ContactProfile>(path)
      .then((data) =>
        setProfile({
          firstname: data.firstname || "",
          lastname: data.lastname || "",
          emailaddress1: data.emailaddress1 || "",
          telephone1: data.telephone1 || "",
        }),
      )
      .catch((e) => {
        if (e instanceof ApiAuthError) {
          setMessage({ type: "error", text: `認証エラー (${e.status})。再ログインしてください。` });
        } else {
          setMessage({ type: "error", text: `取得失敗: ${e instanceof Error ? e.message : String(e)}` });
        }
      });
  }, [user?.contactId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiPatch(`contacts(${user!.contactId})`, {
        firstname: profile.firstname,
        lastname: profile.lastname,
        telephone1: profile.telephone1,
      });
      setMessage({ type: "success", text: "プロフィールを更新しました" });
    } catch (e) {
      if (e instanceof ApiAuthError) {
        setMessage({ type: "error", text: `認証エラー (${e.status})。` });
      } else {
        setMessage({ type: "error", text: `更新失敗: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }
  // ... フォーム UI は省略
}
```

---

## 8. 認証まわりの検証済み教訓

| 問題 | 原因 | 解決 |
|------|------|------|
| 認証済みなのに 403 | `/_api/contacts` を認証判定に使用 | `Portal.User` を信頼し、API を呼ばない |
| SPA fetch で 500 | `credentials` / リダイレクト処理の誤り | `credentials: "same-origin"` + `handleResponse` で吸収 |
| ログインボタンが 2 つ表示 | ビルトイン + カスタム OIDC 共存 | 一方のプロバイダーを無効化 |
| "Sign in failed" | トラッキング防止が nonce Cookie をブロック | `Nonce=false` またはビルトインプロバイダー使用 |
| ExternalLogin で 401 | form の `provider` 値が AuthenticationType と不一致 | `/SignIn` HTML から動的抽出する |
| 管理者 OK / 一般ユーザー 403 | 管理者はテーブル権限をバイパス | Web ロール紐付け → 一般ユーザーで再検証 |

> **検証は必ず管理者と一般ユーザーの両方で行う**。管理者はテーブル権限をバイパスするため、
> 管理者で動いても一般ユーザーで 403 になるのは頻出パターン。

---

## 9. サーバー側の認証設定（Power Pages 管理）

クライアントコードだけでは認証は完成しない。サーバー側で IdP とサイト設定を構成する必要がある。

### 9.1 Identity Provider 設定（手動・必須）

> **重要**: IdP は API からは設定できない。Power Pages 管理センターで手動構成する。

```
1. https://make.powerpages.microsoft.com/ にアクセス
2. 対象サイトを選択
3. Security → Identity Providers
4. Microsoft Entra ID を有効化（デフォルト設定で B2C/Entra ID が自動構成される）
```

### 9.2 必須サイト設定（YAML で管理）

> **重要**: `pac pages upload-code-site` は毎回 YAML の値で Dataverse を上書きする。
> 設定変更は YAML ファイルと Dataverse の両方を更新する。

| Site Setting | 値 | 目的 |
|---|---|---|
| `Authentication/Registration/ProfileRedirectEnabled` | `false` | ログイン後のプロフィールリダイレクト無効化 |
| `Authentication/Registration/AzureADLoginEnabled` | `false` | ビルトインプロバイダー無効化（カスタム使用時） |
| `Authentication/Registration/LocalLoginEnabled` | `false` | ローカルログイン無効化 |
| `Authentication/Registration/OpenRegistrationEnabled` | `false` | オープン登録無効化 |
| `Authentication/Registration/LoginButtonAuthenticationType` | authority URL | 自動リダイレクト（ログインページをスキップ） |
| `Authentication/OpenIdConnect/{name}/Nonce` | `false` | トラッキング防止対策 |

```yaml
# .powerpages-site/site-settings/Authentication-Registration-LoginButtonAuthenticationType.sitesetting.yml
id: {guid}
name: Authentication/Registration/LoginButtonAuthenticationType
value: "https://login.microsoftonline.com/{tenant-id}/"
```

### 9.3 LoginButtonAuthenticationType（自動リダイレクト）

| 項目 | 説明 |
|------|------|
| 目的 | ログインページを表示せず直接 IdP にリダイレクト |
| 値 | プロバイダーの Authority URL（末尾 `/` 必須） |
| 例 | `https://login.microsoftonline.com/{tenant-id}/` |
| 前提 | 有効な IdP が 1 つだけ（`AzureADLoginEnabled=false` で重複排除） |

> Authority URL は `https://login.microsoftonline.com/{tenant-id}/`（末尾 `/` 必須）。
> `https://sts.windows.net/{tenant-id}/` ではない。間違えると自動 SSO が効かない。

### 9.4 ビルトイン vs カスタム OpenIdConnect

| 項目 | ビルトイン (AzureAD) | カスタム OpenIdConnect |
|------|------|------|
| response_type | `code id_token` | `id_token` |
| トラッキング防止耐性 | **強い** | **弱い**（nonce Cookie ブロックで失敗） |
| 設定方法 | 管理センターで有効化 | site settings で手動設定 |
| Nonce 設定 | 不要 | `false` 推奨 |
| 推奨度 | ✅ **推奨** | ⚠️ トラブルが多い |

> 特別な理由がない限りビルトイン Azure AD プロバイダーを使う。
> カスタム OpenIdConnect は `response_type=id_token` のためトラッキング防止で callback が失敗しやすい。

### 9.5 サイト可視性

| Visibility | 動作 |
|---|---|
| `private` | 全ページ認証必須。開発中はこちら推奨。SPA ロード時点で認証済み |
| `public` | 認証なしでアクセス可。公開前に Table Permission を確認 |

### 9.6 トラッキング防止（Tracking Prevention）

| ブラウザ | 影響 |
|---|---|
| Edge (Strict) | 3rd party cookie ブロック → nonce 検証失敗 → "Sign in failed" |
| Safari (ITP) | 同上 |
| Chrome (3PC Phase-out) | 将来的に影響 |

**対策**:
1. `Authentication/OpenIdConnect/{name}/Nonce` = `false`
2. ビルトインプロバイダー（`response_type=code id_token`）を使用
3. `LoginButtonAuthenticationType` で platform 内部のリダイレクト機構を使用

> Dataverse 側のテーブル権限・Web ロール（3 レイヤー）の設定は
> [Enhanced Data Model テーブル権限](enhanced-data-model-permissions.md) を参照。

---

## 10. Entra External ID（CIAM）— 顧客向けポータルの設定

顧客向けポータルでは Entra ID（workforce）ではなく **Entra External ID（CIAM）** を使う。

### 10.1 サイト設定 YAML（Entra External ID）

```yaml
# Authentication/OpenIdConnect/{ProviderName}/AuthenticationType
# ProviderName 例: OpenIdConnect_1
name: Authentication/OpenIdConnect/OpenIdConnect_1/AuthenticationType
value: "https://{subdomain}.ciamlogin.com/{tenantId}"

name: Authentication/OpenIdConnect/OpenIdConnect_1/Authority
value: "https://{subdomain}.ciamlogin.com/{tenantId}"

name: Authentication/OpenIdConnect/OpenIdConnect_1/MetadataAddress
value: "https://{subdomain}.ciamlogin.com/{tenantId}/v2.0/.well-known/openid-configuration"

name: Authentication/OpenIdConnect/OpenIdConnect_1/ClientId
value: "{clientId}"

name: Authentication/OpenIdConnect/OpenIdConnect_1/RedirectUri
value: "https://{site-url}/signin-openidconnect_1"

name: Authentication/OpenIdConnect/OpenIdConnect_1/Caption
value: "サインイン"

name: Authentication/Registration/OpenRegistrationEnabled
value: "true"  # セルフサービス登録を許可する場合

name: Authentication/Registration/ProfileRedirectEnabled
value: "false"
```

### 10.2 AUTH_PROVIDERS 設定例（Entra External ID）

```typescript
export const AUTH_PROVIDERS: AuthProvider[] = [
  {
    id: 'entra-external',
    type: 'oidc',
    displayName: 'サインイン',
    // AuthenticationType と一致させる（Authority URL）
    providerIdentifier: 'https://{subdomain}.ciamlogin.com/{tenantId}',
  },
];
```

> **Entra External ID の URL 形式**: `https://{subdomain}.ciamlogin.com/{tenantId}` — 末尾の `/v2.0/` は不要。Entra ID（workforce）の `login.windows.net` や `login.microsoftonline.com` と混同しないこと。

### 10.3 クレームマッピング（RegistrationClaimsMapping / LoginClaimsMapping）

外部 IdP のクレームを Dataverse contact フィールドにマッピングする。

| サイト設定 | 値（例） | タイミング |
|---|---|---|
| `Authentication/OpenIdConnect/{name}/RegistrationClaimsMapping` | `firstname=given_name,lastname=family_name,emailaddress1=email` | 初回サインイン時のみ（**推奨**） |
| `Authentication/OpenIdConnect/{name}/LoginClaimsMapping` | 同上 | 毎回ログイン時（IdP が唯一の正源の場合） |

> **推奨**: `RegistrationClaimsMapping` のみ設定し `LoginClaimsMapping` は設定しない。SPA でプロフィール編集を提供する場合、`LoginClaimsMapping` があると毎回ユーザーの編集内容が IdP 値で上書きされる。

```yaml
# .powerpages-site/site-settings/
name: Authentication/OpenIdConnect/OpenIdConnect_1/RegistrationClaimsMapping
value: "firstname=given_name,lastname=family_name,emailaddress1=email"
```

---

## 11. ローカル認証（Username/Password）

> **注意**: ローカル認証はデフォルトでは設定しない。外部 IdP が利用できない特別な理由がある場合のみ使用する。

### 11.1 ローカルログインのフォームフィールド

ローカル認証フォームは `/Account/Login/Login` ではなく **`/SignIn`** に POST する。パスワードフィールド名は `PasswordValue`（`Password` ではない）。

```typescript
// ローカルログイン（use-auth.ts 内のローカル認証分岐）
async function localLogin(email: string, password: string): Promise<void> {
  const tokenRes = await fetch("/_layout/tokenhtml", { credentials: "same-origin" });
  const tokenHtml = await tokenRes.text();
  const tokenMatch = tokenHtml.match(/value="([^"]+)"/);
  if (!tokenMatch) throw new Error("Failed to get anti-forgery token");

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/SignIn";
  form.style.display = "none";
  const fields: Record<string, string> = {
    Email: email,           // LocalLoginByEmail=true の場合
    PasswordValue: password, // ★ Password ではなく PasswordValue
    ReturnUrl: "/",
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
}
```

> **重要**: `Password` フィールド名は動作しない。必ず `PasswordValue` を使う。`LocalLoginByEmail=true` の場合は `Email` フィールド、`false` の場合は `Username` フィールドを送信する。

### 11.2 ローカル認証のサイト設定

```yaml
name: Authentication/Registration/LocalLoginEnabled
value: "true"

name: Authentication/Registration/LocalLoginByEmail
value: "true"  # Email でログイン（false の場合はユーザー名）

name: Authentication/Registration/OpenRegistrationEnabled
value: "true"   # 自己登録を許可する場合
```

---

## 12. ログアウトモード（ローカル vs フェデレーテッド）

upstream `setup-auth` では 2 種類のログアウトモードを区別する。

| モード | サイト設定 | 動作 | 推奨用途 |
|---|---|---|---|
| **ローカルログアウト**（デフォルト） | `RPInitiatedLogout` 未設定/false、`PostLogoutRedirectUri` 未設定 | Power Pages セッションのみクリア。IdP 側はサインイン維持。次回サインインはサイレント SSO。 | 大多数の顧客向けサイト。スムーズな UX。 |
| **フェデレーテッドログアウト**（RP-initiated） | `RPInitiatedLogout=true` **かつ** `PostLogoutRedirectUri={site-url}/` | IdP の `end_session_endpoint` にリダイレクト。IdP 側のセッションもクリア。 | 共有デバイス、規制業種、毎回認証要求が必要なサイト。 |

> **両設定は必ずセットで**: `RPInitiatedLogout=true` のみで `PostLogoutRedirectUri` を省略すると、IdP のサインアウトページでユーザーが取り残される。

```typescript
// フェデレーテッドログアウト（use-auth.ts）
const logout = useCallback(() => {
  sessionStorage.removeItem("pp_return_hash");
  // ローカルログアウト（デフォルト）:
  window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
  // フェデレーテッドログアウト（RPInitiatedLogout=true 設定時）:
  // window.location.href = "/Account/Login/LogOff";  // PostLogoutRedirectUri がリダイレクト先を決定
}, []);
```

```yaml
# フェデレーテッドログアウトを有効にする場合のみ設定
name: Authentication/OpenIdConnect/{ProviderName}/RPInitiatedLogout
value: "true"

name: Authentication/OpenIdConnect/{ProviderName}/PostLogoutRedirectUri
value: "https://{site-url}/"  # 必ず明示設定（省略不可）
```

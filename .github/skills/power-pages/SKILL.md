---
name: power-pages
description: "Power Pages コードサイトの開発・ビルド・デプロイ。pac pages CLI を使用し、React/Vue/Angular/Astro 等の静的 SPA をアップロード・プロビジョニングする。"
category: ui
triggers:
  - "Power Pages"
  - "pac pages"
  - "upload-code-site"
  - "provision-website"
  - ".powerpages-site"
  - "ポータル"
  - "外部サイト"
  - "Power Pages デプロイ"
  - "コードサイト"
  - "code site"
  - "static SPA"
  - "サイト設定"
  - "テーブル権限"
  - "table permissions"
  - "site settings"
  - "Web ロール"
  - "Enhanced Data Model"
  - "mspp_entitypermission"
  - "powerpagecomponent"
  - "403 Forbidden"
---

# Power Pages コードサイト開発・デプロイスキル

> **ベースライン**: [microsoft/power-platform-skills](https://github.com/microsoft/power-platform-skills) `plugins/power-pages/` のワークフローに準拠。

Power Pages のコードサイトを **pac pages CLI** で開発・ビルド・デプロイする。
React / Vue / Angular / Astro 等の静的 SPA フレームワークに対応。

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [ビルドリファレンス](references/build-reference.md) | ビルド構成・フレームワーク別設定・出力形式 |
| [デプロイリファレンス](references/deployment-reference.md) | pac pages コマンド詳細・CI/CD パイプライン構成 |
| [トラブルシューティング](references/troubleshooting.md) | よくあるエラーと解決策 |
| [認証リファレンス](references/authentication-reference.md) | 認証サービス・anti-forgery・Entra ID |
| [PUBLIC サイト SPA 認証](references/public-site-spa-auth.md) | PUBLIC サイトの form POST 認証・Liquid 注入・post_upload_fix パターン |
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | Enhanced Data Model (v2.0) のテーブル権限設定・自動化パターン |
| [権限プローブ & UI パターン](references/permission-probing-patterns.md) | DELETE プローブ・PATCH 禁止・CSRF トークン・ボタン無効化・デプロイ教訓 |
| [Web API 実装パターン](references/web-api-implementation.md) | `/_api/` クライアント実装・CSRF・403 対処・デプロイ運用・RequireAuth |
| [デザインシステム](references/design-system.md) | カラートークン・ユーティリティクラス・コンポーネントパターン・業務シナリオ適用ガイド |
| **[デプロイ教訓集](references/lessons-learned-deploy-auth-data.md)** | **初回デプロイ〜安定稼働の全教訓・ログ出力ガイド・403診断フロー・LP設計パターン** |

## ワークフロー概要（microsoft/power-platform-skills 準拠）

```
┌────────────┐   ┌─────────────┐   ┌───────────────┐   ┌──────────────┐
│ create-site│ → │ deploy-site │ → │ activate-site │ → │  setup-auth  │
│ (scaffold) │   │ (upload)    │   │ (provision)   │   │ (identity)   │
└────────────┘   └─────────────┘   └───────────────┘   └──────────────┘
                        ↓                                       ↓
                 ┌─────────────┐                        ┌──────────────┐
                 │ deploy-site │  ← 最終デプロイ  ←     │ test-site    │
                 │ (re-upload) │                        │ (verify)     │
                 └─────────────┘                        └──────────────┘
```

| # | フェーズ | 対応する MS スキル | 本リポジトリの実装 |
|---|---|---|---|
| 1 | サイト作成 | `/create-site` | `npm create vite` + `powerpages.config.json` 作成 |
| 2 | 初回デプロイ | `/deploy-site` | `py .github/skills/power-pages/scripts/deploy_site.py` |
| 3 | アクティベート | `/activate-site` | Power Platform API POST or 管理画面 |
| 4 | 認証設定 | `/setup-auth` | `src/services/authService.ts` + 管理画面で IdP 有効化 |
| 5 | 再デプロイ | `/deploy-site` | `py .github/skills/power-pages/scripts/deploy_site.py` |
| 6 | テスト | `/test-site` | サイト URL にアクセスして確認 |

## 前提

### 必要ツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| `pac` (Power Platform CLI) | 最新 | サイトアップロード・リスト表示 |
| `node` + `npm` | 18+ | SPA ビルド |
| `az` (Azure CLI) | 任意 | アクティベート時のトークン取得（PP API 認証） |

### .env パラメータ

```env
DATAVERSE_URL=https://{org}.crm7.dynamics.com/
ENV_ID=                               # Power Platform 環境 ID
DATAVERSE_URL=                        # Dataverse エンドポイント
```

### プロジェクト構造

```text
project-root/
├── portal/                       # Power Pages プロジェクト
│   ├── powerpages.config.json    # pac pages が読む設定（必須）
│   ├── .powerpages-site/         # サイトメタデータ（初回 upload 後に自動生成）
│   │   ├── website.yml
│   │   ├── web-templates/
│   │   ├── page-templates/
│   │   ├── site-settings/
│   │   └── table-permissions/
│   ├── dist/                     # ビルド出力（compiledPath）
│   │   ├── index.html
│   │   └── assets/
│   ├── src/                      # ソースコード
│   ├── index.html                # エントリポイント
│   ├── package.json
│   └── vite.config.ts
├── src/
│   ├── services/
│   │   └── authService.ts        # Power Pages 認証サービス
│   ├── hooks/
│   │   └── useAuth.ts            # React 認証フック
│   └── types/
│       └── powerPages.d.ts       # PP 型定義
├── scripts/
│   └── deploy_portal.py          # 一括デプロイ（Build→Upload→Settings→Restart）
└── .env
```

### powerpages.config.json（必須）

```json
{
  "$schema": "https://www.schemastore.org/powerpages.config.json",
  "siteName": "サイト名",
  "compiledPath": "dist",
  "defaultLandingPage": "index.html"
}
```

> **戦略: 「先にデプロイ、後から開発」**
> プロビジョニングに 10〜20 分かかるため、設計承認後にインフラ確保を即開始し、
> 並行して Dataverse テーブル構築・SPA 開発を進める。

```
Step 0: サイト作成（プロビジョニング開始）
  ↓ 並行作業可
Step 1: サイト設計（ユーザー承認）
  ↓
Step 2: SPA 開発
  ↓
Step 3: セキュリティ構成（Site Settings + Table Permissions）
  ↓
Step 4: 認証構成（Identity Provider + Web Template）
  ↓
Step 5: サイトアップロード + Restart
  ↓
Step 6: 検証（管理者 AND 一般ユーザーの両方）
```

---

### Step 0: サイト作成 + プレースホルダーデプロイ

設計承認後、最優先で実行。Dataverse 構築と並行して進める。

```bash
python .github/skills/power-pages/scripts/deploy_placeholder.py \
  --create-site --site-name "サイト名" --subdomain "サブドメイン" --wait
```

---

### Step 1: サイト設計（ユーザー承認必須）

| 項目 | 内容 |
|------|------|
| フレームワーク | React / Vue / Angular / Astro |
| ページ構成 | ルーティング・認証ページ・公開ページ |
| テーブル権限 | テーブル × CRUD × スコープ × 対象ロール |
| サイト設定 | Web API 有効化・認証プロバイダ |
| Web ロール | Authenticated Users + 必要に応じてカスタムロール |
| サイト種別 | PRIVATE（認証必須）or PUBLIC（匿名許可） |

---

### Step 2: SPA 開発

> **⚠️ 必須**: `npm create vite` ではなく、必ず **デザインシステムテンプレート** から開始する。
> テンプレートにはカラートークン・ユーティリティ・レスポンシブヘッダー・ダークモードが事前構築済み。
> 詳細は本ファイル末尾「デザインシステム（必須）」セクション参照。

```bash
# テンプレートをコピーして初期化（推奨）
cp -r .github/skills/power-pages/templates/corporate-lp/* ./portal/
cd portal && npm install

# または従来方式（テンプレート不使用は非推奨）
# npm create vite@latest portal -- --template react-ts
# cd portal && npm install
```

**Vite 設定の重要項目**:
- `base: './'` — 相対パスでアセットを参照（Power Pages のパス構造に対応）
- `inlineDynamicImports: true` — 単一バンドル（ロード順問題防止）
- SPA ルーティングは **Hash モード必須**（サーバーリライト不可のため）

#### 必須制約

| 制約 | 理由 |
|------|------|
| 静的 SPA のみ | SSR / ISR 非対応 |
| **Hash ルーティング必須** | History API モードは直接 URL アクセスで 404（サーバーリライト不可） |
| `base: './'` (Vite) | Power Pages のパス構造に対応 |
| `inlineDynamicImports: true` | コード分割するとロード順問題が発生 |

#### Web API クライアント（必須パターン — デバッグログ付き）

> 参考実装: [incidentPage/portal/src/lib/dataverse.ts](https://github.com/geekfujiwara) の `handleResponse` + リダイレクトループ防止

```typescript
// lib/api.ts — 初回デプロイ時は必ずログ出力を含める
const BASE = "/_api";

// リダイレクトループ防止（10秒以内の再リダイレクトを抑止）
const REDIRECT_KEY = "__pp_login_redirect_ts";
function shouldRedirectToLogin(): boolean {
  const last = sessionStorage.getItem(REDIRECT_KEY);
  if (last && Date.now() - Number(last) < 10000) return false;
  sessionStorage.setItem(REDIRECT_KEY, String(Date.now()));
  return true;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}/${path}`;
  console.log(`[API] ${init?.method ?? "GET"} ${url}`);

  const res = await fetch(url, {
    ...init,
    redirect: "manual",       // ← 必須: 未認証時の 302 チェーン防止
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...init?.headers,
    },
  });

  // セッション切れ検知
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
```

> **`redirect: "manual"` を省略すると**: 未認証時に `/_api/` → 302 → `/Account/Login` → 302 → `/ExternalLogin`(GET) → 500 というエラーチェーンが発生する。
> **ログは安定後に `import.meta.env.DEV` 条件付きに変更する。**

#### OData クエリのポイント

| パターン | 正しい書式 | 誤り |
|----------|-----------|------|
| Lookup 列の参照 | `_geek_categoryid_value` | `geek_categoryid` |
| Boolean フィルタ | `$filter=geek_approved eq true` | `eq 'true'` |
| 日時フィルタ | `createdon gt 2024-01-01T00:00:00Z` | 引用符不要 |
| 展開 | `$expand=geek_CategoryId($select=geek_name)` | — |

#### 認証フック（PUBLIC サイト — LP + 認証ゲート）

> 参考実装: incidentPage の `useAuth` hook + `RequireAuth` コンポーネント

```typescript
// hooks/use-auth.ts (PUBLIC サイト)
import { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    __PP_USER__?: { id?: string; fullname?: string; emailaddress1?: string } | null;
  }
}

export function useAuth() {
  const [state, setState] = useState({ isAuthenticated: false, user: null as any, loading: true });

  useEffect(() => {
    const pp = window.__PP_USER__;
    if (pp?.id) {
      setState({ isAuthenticated: true, user: { contactId: pp.id, fullName: pp.fullname || "", email: pp.emailaddress1 || "" }, loading: false });
    } else {
      setState({ isAuthenticated: false, user: null, loading: false });
    }
  }, []);

  const login = useCallback(() => { window.location.href = "/Account/Login"; }, []);
  const logout = useCallback(() => { window.location.href = "/Account/Login/LogOff"; }, []);
  return { ...state, login, logout };
}
```

```tsx
// components/require-auth.tsx — 認証ゲートコンポーネント
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, login } = useAuth();
  if (loading) return <Spinner />;
  if (!isAuthenticated) return <LoginPrompt onLogin={login} />;
  return <>{children}</>;
}
```

> PUBLIC サイトの LP は未認証でもアクセス可能。保護ルートのみ `RequireAuth` で囲む。
> **LP の機能カードは常に表示**し、クリック時に認証チェック → 未認証なら login() を呼ぶ。

#### 認証フック（PRIVATE サイト）

```typescript
// hooks/use-auth.ts
export function useAuth() {
  const pp = (window as any).__PP_USER__;
  return {
    isAuthenticated: !!(pp?.id),
    user: pp ? { contactId: pp.id, fullName: pp.fullname, email: pp.emailaddress1 } : null,
    login: () => { window.location.href = "/Account/Login"; },
    logout: () => { window.location.href = "/Account/Login/LogOff"; },
  };
}
```

> PRIVATE サイトでは SPA ロード時点で必ず認証済み。`window.__PP_USER__` は Web Template の Liquid `{{ user | json }}` で注入される。

---

### Step 3: セキュリティ構成

**Web API を有効化し、テーブル権限を設定する。このステップを飛ばすと 403 / 404 になる。**

#### 3-A: Site Settings（API で自動化可能）

```python
# 各テーブルに対して enabled + fields を設定
tables = ["geek_incident", "geek_knowledge", "geek_knowledgecategory"]
for table in tables:
    create_site_setting(f"Webapi/{table}/enabled", "true")
    create_site_setting(f"Webapi/{table}/fields", "*")
```

> Site Settings がないとテーブルが Web API に公開されない（管理者でも 404）。

#### 3-B: Table Permission レコード（API で自動化可能）

powerpagecomponent type=18 を作成すると `mspp_entitypermission` が自動生成される。

```python
component = {
    "powerpagecomponenttype": 18,
    "name": f"{table_display} - Global Read",
    "content": json.dumps({
        "mspp_entityname": table_logical,
        "mspp_scope": "756150000",  # Global
        "mspp_read": "true",
        "mspp_write": "false",
        "mspp_create": "false",
        "mspp_delete": "false",
        "mspp_append": "true",
        "mspp_appendto": "true",
    }),
    "powerpagesiteid@odata.bind": f"/powerpagesites({SITE_ID})",
    "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({LANG_ID})",
}
```

#### 3-C: Web Role 紐付け（API 自動化可能 ✅）

> **解決済み**: Enhanced Data Model では `mspp_entitypermission_webrole` N:N は永続化しないが、
> **`powerpagecomponent_powerpagecomponent` 自己参照 N:N** で正しくリンクできる。

```python
# テーブル権限(type=18) → Web Role(type=11) を powerpagecomponent 自己参照N:N でリンク
url = f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"
body = {"@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({role_ppc_id})"}
r = requests.post(url, json=body, headers=headers)
assert r.status_code == 204  # 成功 & 永続化される
```

> 管理者ユーザーはテーブル権限をバイパスするため、管理者で OK でも一般ユーザーでは 403 になる。Step 6 で必ず一般ユーザーテストを行うこと。
> 詳細: [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md)

#### セキュリティ構成チェックリスト

| # | 設定 | 対象 | 自動化 |
|---|------|------|--------|
| 1 | `Webapi/{table}/enabled=true` | 全公開テーブル | ✅ API |
| 2 | `Webapi/{table}/fields=*` | 全公開テーブル | ✅ API |
| 3 | Table Permission (type=18) | 全公開テーブル | ✅ API |
| 4 | Web Role 紐付け (`powerpagecomponent_powerpagecomponent` N:N) | 全 Table Permission | ✅ API |
| 5 | Site Restart | — | ✅ API |

---

### Step 4: 認証構成（PRIVATE サイトの場合）

#### 4-A: Identity Provider 有効化（手動 — API 不可）

> Identity Provider は Power Pages admin center から手動設定が必須。
> Dataverse API / Power Platform API では自動化できない。

1. https://make.powerpages.microsoft.com/ → 対象サイトを選択
2. **Security** → **Identity Providers**
3. **Microsoft Entra ID** を有効化（リダイレクト URI 等はデフォルト値で OK）

#### 4-B: Web Template に Liquid ユーザー注入

```html
<script>window.__PP_USER__ = {{ user | json }};</script>
{{ page.adx_copy }}
```

#### 4-C: 認証アーキテクチャ（コードサイト固有）

```
┌─────────────────────────────────────────────────────┐
│ Power Pages Runtime (Server)                        │
│ ┌─────────────────────────────────────────────────┐ │
│ │ PRIVATE site → all pages require auth           │ │
│ │ LoginButtonAuthenticationType → auto-redirect   │ │
│ │ Session Cookie authentication                   │ │
│ │ /Account/Login (→ auto-redirect to IdP)         │ │
│ │ /Account/Login/LogOff (GET)                     │ │
│ └─────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Web Template (Liquid)                               │
│ <script>                                            │
│   window.__PP_USER__ = {{ user | json }};           │
│ </script>                                           │
│ {{ page.adx_copy }}                                 │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ SPA (Client-side)                                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ window.__PP_USER__ (Liquid injected)            │ │
│ │   → contactId, fullName, email                  │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ use-auth.ts (React hook)                        │ │
│ │   login()  → window.location = /Account/Login   │ │
│ │   logout() → window.location = .../LogOff       │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ dataverse.ts (API client)                       │ │
│ │   fetch(url, { redirect: 'manual' })            │ │
│ │   opaqueredirect → /Account/Login               │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

#### 4-D: 自動リダイレクト設定（推奨）

```yaml
# LoginButtonAuthenticationType: ログインページをスキップして直接 IdP へ
Authentication/Registration/LoginButtonAuthenticationType: "https://login.microsoftonline.com/{tenant-id}/"
```

> この設定を使用する場合、SPA の全 fetch に `redirect: "manual"` が**必須**。

#### 4-E: 必須サイト設定（YAML で管理）

> **鉄則**: 以下の設定は `.powerpages-site/site-settings/` の YAML ファイルに value を含めること。
> Dataverse だけ変更しても次回 `pac pages upload-code-site` で YAML の値に戻される。

| サイト設定名 | 値 | YAML管理 | 理由 |
|---|---|---|---|
| `Authentication/Registration/ProfileRedirectEnabled` | `false` | ✅ | ログイン後リダイレクト無効化 |
| `Authentication/Registration/AzureADLoginEnabled` | `false` | ✅ | ビルトインプロバイダー無効化（カスタム使用時） |
| `Authentication/Registration/LocalLoginEnabled` | `false` | ✅ | ローカルログイン無効化 |
| `Authentication/Registration/OpenRegistrationEnabled` | `false` | ✅ | オープン登録無効化 |
| `Authentication/Registration/InvitationEnabled` | `false` | ✅ | 招待無効化 |
| `Authentication/Registration/LoginButtonAuthenticationType` | provider authority URL | ✅ | 自動リダイレクト有効化 |
| `Authentication/OpenIdConnect/{name}/Nonce` | `false` | ⚠️ 任意 | トラッキング防止対策 |

```yaml
# Authentication-Registration-LoginButtonAuthenticationType.sitesetting.yml
id: {guid}
name: Authentication/Registration/LoginButtonAuthenticationType
value: "https://login.microsoftonline.com/{tenant-id}/"
```

> **注意**: `value` フィールドが無い YAML ファイルは、upload 時に Dataverse の値を空にする。

---

### Step 5: サイトアップロード + Post-Upload Fix + Restart

> **⚠️ CRITICAL**: `pac pages upload-code-site` はクラシックページを復活させる変更を加えるため、
> アップロード後に **必ず Post-Upload Fix を実行**する。手動デプロイは禁止。

> **⚠️ MUST: デプロイ後は必ずサイト再起動する**
> Dataverse のテーブル権限・サイト設定はランタイムに積極的にキャッシュされる。
> 再起動しないと変更が反映されず **403 (EntityPermissionReadIsMissing)** 等の原因になる。
> `deploy_site.py` は Phase 5 で自動的に再起動する（`--skip-restart` 非推奨）。
>
> **再起動後はブラウザキャッシュもクリアしてアクセスする:**
> `Ctrl+Shift+Delete` → **[キャッシュされた画像とファイル]** → 削除
> （またはシークレット / InPrivate ウィンドウで確認）

```bash
# 標準デプロイ（ビルド + アップロード + Post-Upload Fix + Restart すべて自動）
py .github/skills/power-pages/scripts/deploy_site.py

# ビルド済みの場合
py .github/skills/power-pages/scripts/deploy_site.py --skip-build

# デプロイ前チェックのみ実行
py .github/skills/power-pages/scripts/predeploy_check.py
py .github/skills/power-pages/scripts/predeploy_check.py --fix  # 自動修正付き
```

#### deploy_site.py の処理フロー

```
Phase 0: Pre-Deploy Check（ビルド出力・テンプレート整合性・mspp_copy 検証）
Phase 1: Verify (pac auth who + powerpages.config.json + .env)
Phase 2: Build (npm run build)
Phase 3: Upload (pac pages upload-code-site)
  ⚠️ この時点で以下が破壊される:
    - Page Template usewebsiteheaderandfooter → true にリセット
    - Web Template source → クラシックテンプレートで上書き
    - mspp_copy → dist/index.html の全文 (<!doctype html>...) で上書き
Phase 4: Post-Upload Fix（SPA 必須修正 — クラシック防止）
  [A] Page Template: usewebsiteheaderandfooter → false（全テンプレート）
  [B] Web Template "Default studio template": source → body-only SPA ローダー
  [C] Home page mspp_copy → body-only HTML
Phase 5: Restart (Power Platform API でキャッシュクリア)
```

#### Post-Upload Fix の核心パターン（検証済み）

| 対象 | 修正内容 | なぜ必要か |
|------|---------|-----------|
| Page Template | `usewebsiteheaderandfooter: false` | true のままだと Power Pages が header/footer をラップしクラシック表示に |
| Web Template source | body-only SPA ローダー | クラシックテンプレートだと SPA が正しく読み込まれない |
| mspp_copy | body-only HTML (`<div id="root">` + script + css) | full HTML だとネストされて表示崩壊 |

#### Web Template source（検証済みフォーマット）

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/index-XXXXX.css" />
<div id="root"></div>
<script type="module" src="/assets/index-XXXXX.js"></script>
```

> **重要**: アセットパスは **ルート相対 (`/assets/...`)** でなければならない。`./assets/...` は不可。

#### mspp_copy（検証済みフォーマット）

```html
<div id="root"></div>
<script type="module" crossorigin src="/assets/index-XXXXX.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-XXXXX.css">
```

> **注意**: `upload-code-site` は毎回 `.powerpages-site/site-settings/*.yml` で Dataverse を上書きする。YAML ファイルが設定の正。

#### Phase 5: Restart（キャッシュクリア）の詳細

デプロイ後のサイト再起動は **MUST**。Power Platform API 経由で実行する。

```python
from auth_helper import get_token
import requests

token = get_token(scope='https://api.powerplatform.com/.default')
h = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

# 1) /websites を GET して API 側のサイト ID を取得（Dataverse の ID とは別物！）
r = requests.get(
    f'https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01',
    headers=h)
sid = next(s['id'] for s in r.json()['value'] if 'mysite' in s['name'].lower())

# 2) restart を POST（200 で成功）
requests.post(
    f'https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites/{sid}/restart?api-version=2024-10-01',
    headers=h)
```

| 落とし穴 | 対策 |
|----------|------|
| `admin.powerpages.microsoft.com` は存在しない（NXDOMAIN） | エンドポイントは **`api.powerplatform.com`** |
| Power Platform API のサイト ID ≠ Dataverse `powerpagesiteid` | 必ず `/websites` を GET して name 一致で API 側 ID を取得 |
| 認証 scope が Dataverse のままだと 401 | `get_token(scope='https://api.powerplatform.com/.default')` |
| 再起動しても画面が変わらない | **ブラウザキャッシュをクリア**（`Ctrl+Shift+Delete` → キャッシュされた画像とファイル） |

---

### Step 6: 検証

| 検証項目 | 確認者 | 期待結果 |
|----------|--------|----------|
| SPA ルーティング | — | Hash URL で全ページ表示 |
| Web API GET | 管理者 | 200 + データ返却 |
| Web API GET | **一般ユーザー** | 200 + データ返却 |
| 認証フロー | 未認証 | IdP にリダイレクト → ログイン後 SPA 表示 |
| セッション切れ | — | `/Account/Login` にリダイレクト |

> **管理者で OK でも一般ユーザーで 403 は頻出パターン**。必ず両方でテストする。
> **403 が出たらまずサイト再起動 + ブラウザキャッシュクリア**を疑う（設定変更がランタイムに未反映なケースが多い）。

---

## Phase 3: アクティベート（activate-site）

初回のみ。サイトに公開 URL を割り当てる。

### 方法 A: Power Platform API 経由

```python
import requests
headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
body = {
    'dataverseOrganizationId': ORG_ID,
    'name': 'サイト名',
    'selectedBaseLanguage': 1041,
    'subdomain': 'サブドメイン',
    'templateName': 'DefaultPortalTemplate',
    'websiteRecordId': 'pac pages list で取得した GUID',
}
r = requests.post(
    f'https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01',
    headers=headers, json=body
)
# 202 Accepted → Operation-Location ヘッダーをポーリング
```

### 方法 B: 管理画面から手動

```
https://make.powerpages.microsoft.com/environments/{ENV_ID}/portals/home
```

### Cloud 別 URL ドメイン

| Cloud | Site URL Domain |
|---|---|
| `Public` | `powerappsportals.com` |
| `UsGov` | `powerappsportals.us` |
| `China` | `powerappsportals.cn` |

---

## 必須要件

### サイト構成

| ルール | 理由 |
|--------|------|
| **静的 SPA のみ** | Power Pages コードサイトは SSR / ISR 非対応 |
| **`.powerpages-site` は初回 upload で自動生成** | 手動作成しない |
| **ビルド出力は静的ファイル** | `index.html` + JS/CSS/assets のみ |
| **SPA ルーティングは Hash モード必須** | History API モードはサーバーリライト不可で直接 URL アクセスが 404 |
| **Web テンプレートで Liquid ユーザー注入** | `{{ user \| json }}` で SPA にユーザー情報を渡す |
| **vite base: './' + inlineDynamicImports** | 相対パス + 単一バンドル |

### セキュリティ

| ルール | 理由 |
|--------|------|
| **Client-side auth は UX only** | 実際のアクセス制御はサーバーサイド table permissions |
| **テーブル権限は最小権限の原則** | 外部ユーザーに不要なデータを公開しない |
| **Web ロール設計は事前承認必須** | 権限設計ミスは情報漏洩に直結 |
| **サイト設定に機密情報を格納しない** | クライアントから参照可能な場合がある |
| **Enhanced Data Model の N:N は `powerpagecomponent_powerpagecomponent` を使用** | `mspp_entitypermission_webrole` は永続化しないが自己参照N:Nで解決可能 |
| **一般ユーザーでテスト必須** | 管理者はテーブル権限をバイパスする |

### デプロイ

| ルール | 理由 |
|--------|------|
| **`deploy_site.py` を使用する（手動デプロイ禁止）** | Post-Upload Fix を自動実行しないとクラシック表示になる |
| **YAML ファイルを site settings の正とする** | pac pages upload が毎回 YAML から Dataverse を上書きする |
| **設定変更 = YAML 更新 + Dataverse PATCH** | 片方だけでは次回デプロイで不整合 |
| **デプロイ前チェックを実行** | `predeploy_check.py` で既知問題を事前検出 |
| **NEVER use `pac pages upload` 単体** | Post-Upload Fix なしではクラシックに戻る |
| **アセットパスはルート相対 (`/assets/...`)** | `./assets/...` だとパスが解決できない |
| **Page Template は全て usewebsiteheaderandfooter=false** | true だとクラシックの header/footer がラップされる |
| **Web Template source は body-only** | full HTML や `{{ page.adx_copy }}` は不可 |
| **デプロイ後に restart** | キャッシュが残り変更が反映されない |
| **`*-manifest.yml` が stale なら削除** | `.html blocked` エラーの原因 |

---

## Pre-Deploy Health Check（デプロイ前チェック）

デプロイ前に `py .github/skills/power-pages/scripts/predeploy_check.py` を実行し、既知の問題を検出する。
`deploy_site.py` の Phase 0 として自動実行される。

### チェック項目

| # | チェック | 検出する問題 | 自動修正 |
|---|---------|-------------|---------|
| 1 | Build Output | dist/index.html + assets/ の存在・パース可否 | ❌ ビルド必要 |
| 2 | Vite Config | inlineDynamicImports / base 設定 | ❌ 手動修正 |
| 3 | Page Template | usewebsiteheaderandfooter=true（クラシック原因） | ✅ --fix で修正 |
| 4 | Web Template | body-only SPA ローダーかどうか | ⚠️ 警告 |
| 5 | mspp_copy | full HTML (`<!doctype`) が含まれていないか | ⚠️ 警告（deploy で修正） |
| 2 | Publishing State | Home root ページが Draft | ✅ Published に変更 |
| 3 | mspp_copy Integrity | Content ページに full HTML が入っている | ✅ body-only に修正 |
| 4 | Page Template | usewebsiteheaderandfooter≠false / web template不正 | ❌ 手動修正 |
| 5 | Web File Availability | ビルド済み JS/CSS が Web File に存在するか | ⚠️ 警告のみ |
| 6 | Auth Configuration | OpenIdConnect 必須設定の欠落 | ❌ 手動修正 |
| 7 | Login Form ↔ AuthenticationType | form POST の provider 値と site setting の不一致 | ❌ 手動修正 |

### 使い方

```bash
# チェックのみ（読み取り専用）
py .github/skills/power-pages/scripts/predeploy_check.py

# チェック + 自動修正
py .github/skills/power-pages/scripts/predeploy_check.py --fix

# 標準デプロイ（チェック → ビルド → アップロード → Fix → Restart）
py .github/skills/power-pages/scripts/deploy_site.py

# チェックをスキップしてデプロイ
py .github/skills/power-pages/scripts/deploy_site.py --skip-checks
```

### デプロイスクリプト処理フロー（最新）

```
Phase 0: Pre-Deploy Check（ビルド出力・テンプレート整合性・mspp_copy 検証）
Phase 1: Verify (pac auth who + powerpages.config.json + .env)
Phase 2: Build (npm run build)
Phase 3: Upload (pac pages upload-code-site)
  ⚠️ この時点で YAML の site-settings が Dataverse に復元される
  ⚠️ この時点で Page Template / Web Template / mspp_copy が上書きされる
Phase 4: Post-Upload Fix（SPA 必須修正 — クラシック防止）
  [A] Page Template: usewebsiteheaderandfooter → false
  [B] Web Template source → body-only SPA ローダー
  [C] Home page mspp_copy → body-only HTML
Phase 5: Restart (Power Platform API でキャッシュクリア)
```

> **重要**: Phase 3 で YAML から設定が復元され、テンプレートが上書きされるため、
> Phase 4 の Post-Upload Fix が**毎回必須**。手動デプロイは禁止。
```

---

## Power Platform API によるポータル管理

| 操作 | エンドポイント |
|------|------|
| 一覧取得 | `GET /powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 作成 | `POST /powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 再起動 | `POST .../websites/{id}/restart?api-version=2024-10-01` |
| 開始 | `POST .../websites/{id}/start?api-version=2024-10-01` |
| 停止 | `POST .../websites/{id}/stop?api-version=2024-10-01` |

**Base URL**: `https://api.powerplatform.com`
**認証スコープ**: `https://api.powerplatform.com/.default`

---

## 検証済み教訓（Lessons Learned）

### ⚠️ CRITICAL: `pac pages upload-code-site` が site settings を YAML から復元する

| 症状 | Dataverse で設定した site settings がデプロイ後に元に戻る |
|------|------|
| 原因 | `pac pages upload-code-site` は **毎回** `.powerpages-site/site-settings/*.sitesetting.yml` の値で Dataverse を上書きする |
| 解決 | **YAML ファイルを正として管理する**。設定変更は (1) YAML を更新 → (2) Dataverse も更新（即時反映用）→ (3) デプロイ |
| パターン | deploy_portal.py Phase 3.5 で YAML に含まれない追加設定を PATCH する |

> **鉄則**: Site setting を変更したら必ず対応する YAML ファイルも同時に更新すること。
> YAML に value が未設定（または空）の場合、upload が Dataverse の値を空に戻す。

### `pac pages upload-code-site` が mspp_copy を上書きする

| 症状 | デプロイ後にページが 404 / 白紙 / full HTML がネストされて表示崩れ |
|------|------|
| 原因 | `pac pages upload-code-site` が Content ページの `mspp_copy` を `dist/index.html` の全内容（`<!doctype html>...`）で上書きする |
| 解決 | **デプロイ後に必ず mspp_copy を body-only に修正する**（Phase 3.6 で自動化済み） |
| body-only 形式 | `<div id="root"></div><script ...></script><link ...>` |
| 対象 | **Root ページ AND Content ページの両方**を修正（片方だけでは表示されない） |

### 重複ページ問題（Root + Content ページモデル）

| 症状 | 同一 URL で 404、「ページが2つ存在」 |
|------|------|
| 原因 | Power Pages のページモデルは Root ページ（URL 定義）+ Content ページ（言語別コンテンツ）の2レコード構成。`pac pages` が追加ページを作成する場合がある |
| 解決 | Pre-deploy check で重複検出→古い方を Draft に。Content ページの `_mspp_rootwebpageid_value` が正しい Root を指しているか確認 |
| 構造 | Root (isroot=true, partialurl='/') → Content (isroot=false, rootwebpageid=Root.id) |

### Website default language = None で白紙

| 症状 | デプロイ後にページが白紙 |
|------|------|
| 原因 | Website の default language が未設定の場合、Content ページではなく Root ページの mspp_copy が表示される |
| 解決 | Root ページにも mspp_copy を設定する（Phase 3.6 で両方修正） |

### `.js` 拡張子ブロック問題

| 症状 | `pac pages upload-code-site` が停止、`PortalFileContentUploadFailed` |
|------|------|
| 原因 | Dataverse organization の `blockedattachments` に `.js` が含まれている |
| 解決 | `blockedattachments` から `js` を除外して PATCH |

### `.html` ブロックエラー（ミスリーディング）

| 症状 | `'.html' type attachments are currently blocked` |
|------|------|
| 原因 | `.powerpages-site` 内のマニフェストファイル (`*-manifest.yml`) が stale |
| 解決 | `portal/.powerpages-site/*-manifest.yml` を削除してリトライ |

### セキュリティ系

| 問題 | 原因 | 解決 |
|------|------|------|
| 管理者 OK / 一般ユーザー 403 | 管理者はテーブル権限バイパス | `powerpagecomponent_powerpagecomponent` N:N で Web Role 紐付け |
| `mspp_entitypermission_webrole` で紐付けしても反映しない | Enhanced Model では無効 | `powerpagecomponent_powerpagecomponent` 自己参照N:N を使用 |
| `disableentitypermissions` が効かない | Enhanced Model では無視される | テーブル権限 + Role が必須 |
| Site Settings あるのに 404 | `enabled=true` が未設定（`fields` のみでは不足） | 両方設定する |

### PRIVATE サイトでの認証フロー（推奨パターン）

| 構成 | 説明 |
|------|------|
| **Web テンプレート** | `<script>window.__PP_USER__={{ user \| json }};</script>{{ page.adx_copy }}` |
| **SPA 側** | `window.__PP_USER__` からユーザー情報読み取り（API コール不要） |
| **ログイン** | `window.location.href = "/Account/Login"` |
| **ログアウト** | `window.location.href = "/Account/Login/LogOff"` |
| **自動リダイレクト** | `LoginButtonAuthenticationType` = provider authority URL |

> PRIVATE サイトではページロード時点で認証済み。SPA は `window.__PP_USER__` を読むだけ。

### LoginButtonAuthenticationType で自動リダイレクト

| 症状 | ログインページ表示 → ボタンクリック → "Sign in failed" |
|------|------|
| 原因 | カスタム OpenIdConnect (response_type=id_token) はトラッキング防止に弱く callback が失敗しやすい |
| 解決 | `Authentication/Registration/LoginButtonAuthenticationType` にプロバイダーの Authority URL を設定 → ログインページをスキップして直接 IdP にリダイレクト |
| 値の例 | `https://login.microsoftonline.com/{tenant-id}/` |
| 注意 | **SPA の fetch に `redirect: 'manual'` が必須**（下記参照） |

### SPA fetch に redirect: 'manual' 必須

| 症状 | LoginButtonAuthenticationType 設定後に SPA で 500 エラー |
|------|------|
| 原因 | 未認証時に /_api/ を fetch → 302 /Account/Login → 302 ExternalLogin(GET) → 500 |
| 解決 | 全 fetch に `redirect: 'manual'` を付与。`res.type === 'opaqueredirect'` (status=0) を検知 → `/Account/Login` にリダイレクト |
| コード | `fetch(url, { redirect: 'manual', headers: {...} })` |

```typescript
// handleResponse パターン
async function handleResponse<T>(res: Response): Promise<T> {
  if (res.type === "opaqueredirect" || res.status === 0) {
    window.location.href = "/Account/Login";
    return new Promise(() => {}); // never resolve
  }
  if (!res.ok) { /* ... */ }
  return res.json();
}
```

### AzureADLoginEnabled=false で重複ボタン除去

| 症状 | ログインページにボタンが2つ表示（ビルトイン + カスタム） |
|------|------|
| 原因 | ビルトイン Azure AD プロバイダーとカスタム OpenIdConnect が共存 |
| 解決 | `Authentication/Registration/AzureADLoginEnabled` = `false`（YAML も更新） |

### Nonce=false でトラッキング防止対策

| 症状 | "Sign in failed" — correlation cookie がブロックされる |
|------|------|
| 原因 | ブラウザのトラッキング防止が nonce 検証用 Cookie をブロック |
| 解決 | `Authentication/OpenIdConnect/{name}/Nonce` = `false` |
| YAML | この設定はデフォルトで YAML ファイルが存在しないため、pac pages upload では上書きされない |

### カスタム OpenIdConnect vs ビルトインプロバイダー

| 項目 | ビルトイン (AzureAD) | カスタム OpenIdConnect |
|------|------|------|
| response_type | `code id_token` | `id_token` |
| トラッキング防止耐性 | **強い** | 弱い（Cookie ブロックで失敗） |
| 自動設定 | Power Pages admin center で有効化 | Dataverse site settings で手動設定 |
| LoginButtonAuthenticationType | 不要（単独なら自動リダイレクト） | Authority URL を設定 |
| 推奨度 | ✅ 推奨 | ⚠️ トラブルが多い |

### ExternalLogin 401（provider 不一致）

| 症状 | ログインボタンクリック後 `/Account/Login/ExternalLogin` で HTTP 401 |
|------|------|
| 原因 | form POST の `provider` 値が Power Pages 内部の `AuthenticationType` と一致しない |
| 解決 | 1. `Authentication/OpenIdConnect/{name}/AuthenticationType` を明示設定 2. `use-auth.ts` の provider 値を一致させる |
| 注意 | `login.windows.net` ≠ `login.microsoftonline.com` — Authority と完全一致が必須 |

### ExternalLogin は POST 専用

| 症状 | `/Account/Login/ExternalLogin` に GET でアクセスして 401/500 |
|------|------|
| 原因 | ExternalLogin エンドポイントは anti-forgery トークン付き POST でのみ動作。GET だと失敗する |
| 解決 | `/_layout/tokenhtml` からトークン取得 → form POST で送信。または `LoginButtonAuthenticationType` で自動リダイレクト（platform 内部で POST 処理） |

### Web API 有効化に必要な4要素

| # | 要素 | 設定内容 |
|---|------|---------|
| 1 | Site Settings | `Webapi/{table}/enabled` = true, `Webapi/{table}/fields` = * or 列名リスト |
| 2 | Table Permissions | Global scope, CRUD 権限設定 |
| 3 | Web Role Link | Table Permission → Authenticated Users web role に紐付け |
| 4 | Site Restart | 設定反映のため必須 |

> 1つでも欠けると 404 または 403 になる。

### DNS 未解決（ポータルインフラ停止）

| 症状 | `Failed to resolve '{subdomain}.powerappsportals.com'` |
|------|------|
| 原因 | ポータルインフラがデプロビジョンされている |
| 解決 | Create Website API で再プロビジョニング or 管理画面から開始 |

### 認証 401 / Identity Provider 未構成

| 症状 | ログインページで 401、`Authority`, `ClientId` が空 |
|------|------|
| 原因 | Power Pages admin center で Identity Provider が有効化されていない |
| 解決 | 管理画面 → Security → Identity Providers → Microsoft Entra ID 有効化 |

### Power Platform API の Website ID ≠ Dataverse adx_websiteid

PP API で管理されるサイト ID と Dataverse の `adx_websiteid` は異なる場合がある。

### 設定変更後のサイト再起動は必須

| 症状 | site settings を変更したが反映されない |
|------|------|
| 原因 | Power Pages はキャッシュが強力。設定変更はキャッシュクリア（再起動）まで反映されない |
| 解決 | Power Platform API で restart: `POST .../websites/{id}/restart` |

---


| スキル | 関係 |
|--------|------|
| `architecture` | アーキテクチャ判断後にこのスキルへ |
| `dataverse` | テーブル権限・サイト設定のデプロイ |
| `standard` | 共通認証（auth_helper.py）・.env パラメータ |
| `code-apps` | 内部ユーザー向け UI は Code Apps、外部ユーザー向けは Power Pages |

---

## デザインシステム（必須）

> **⚠️ CRITICAL**: Power Pages サイトを新規作成する際は、**必ず `templates/corporate-lp/` テンプレートから開始**すること。
> ゼロからコードを書くことは禁止。テンプレートをスキャフォールド → 業務シナリオに合わせて改変する。

### デザインシステムリファレンス

詳細は [references/design-system.md](references/design-system.md) を参照。

### デザイン原則

| 原則 | 内容 |
|------|------|
| **Indigo/Violet グラデーション** | Primary=#6366f1, Accent=#8b5cf6 を一貫使用 |
| **プレミアムシャドウ** | `.shadow-premium` 多層シャドウで高級感 |
| **ダークモード完全対応** | CSS 変数 + `.dark` クラスで全コンポーネント対応 |
| **Inter フォント** | `font-family: 'Inter', system-ui` + letter-spacing: -0.01em |
| **カード中心レイアウト** | `.card-hover` で浮き上がるインタラクション |
| **レスポンシブ最優先** | モバイル→タブレット→デスクトップの順で設計 |

### テンプレート利用ワークフロー（Step 2 で必ず使用）

```bash
# 1. テンプレートをターゲットディレクトリにコピー
cp -r .github/skills/power-pages/templates/corporate-lp/* ./portal/

# 2. 依存インストール
cd portal && npm install

# 3. ローカル開発（業務シナリオに合わせて改変）
npm run dev

# 4. ビルド & デプロイ
npm run deploy
```

### テンプレート構成

```
templates/corporate-lp/
├── package.json          # React 19 + Tailwind v4 + Vite 7
├── tsconfig.json         # TypeScript strict
├── vite.config.ts        # base: "./" + inlineDynamicImports
├── index.html            # Inter フォント + メタ設定
├── dist-site/
│   └── .powerpages-site  # サイト識別マーカー
└── src/
    ├── main.tsx          # エントリ（ThemeProvider）
    ├── App.tsx           # HashRouter + Routes
    ├── index.css         # ★ デザインシステム（CSS変数 + ユーティリティ）
    ├── lib/utils.ts      # cn() ヘルパー
    ├── hooks/use-theme.tsx # ダークモード管理
    ├── components/
    │   ├── site-layout.tsx    # ★ グループ化ホバーメニュー + レスポンシブ
    │   ├── mode-toggle.tsx    # ダークモード切替
    │   └── ui/
    │       ├── button.tsx     # グラデーションボタン（CVA）
    │       └── dropdown-menu.tsx
    └── pages/
        └── home.tsx           # LP（ヒーロー + 機能カード + CTA）
```

### 業務シナリオ別カスタマイズポイント

| 変更したい内容 | 編集ファイル | 手順 |
|---|---|---|
| サイト名・ロゴ | `src/components/site-layout.tsx` | ヘッダーのロゴ文字を変更 |
| ナビグループ・項目 | `src/components/site-layout.tsx` | `navGroups` 配列を業務に合わせて編集 |
| LP コンテンツ | `src/pages/home.tsx` | `features` / `highlights` を業務に合わせて編集 |
| カラーテーマ | `src/index.css` | `:root` の CSS 変数を変更（Indigo/Violet 推奨） |
| ページ追加 | `src/App.tsx` | Route を追加 + `src/pages/` にコンポーネント作成 |

### navGroups カスタマイズ例

```typescript
// ヘルプデスクシナリオ
const navGroups: NavGroup[] = [
  {
    label: "チケット",
    items: [
      { icon: Ticket, label: "新規チケット", path: "/tickets/new" },
      { icon: List, label: "チケット一覧", path: "/tickets" },
    ],
  },
  {
    label: "ナレッジ",
    items: [
      { icon: Book, label: "FAQ", path: "/faq" },
      { icon: Search, label: "検索", path: "/search" },
    ],
  },
];

// 社内申請ポータルシナリオ
const navGroups: NavGroup[] = [
  {
    label: "申請",
    items: [
      { icon: FilePlus, label: "新規申請", path: "/request/new" },
      { icon: FileCheck, label: "申請一覧", path: "/requests" },
      { icon: Clock, label: "承認待ち", path: "/approvals" },
    ],
  },
  {
    label: "情報",
    items: [
      { icon: Bell, label: "お知らせ", path: "/announcements" },
      { icon: HelpCircle, label: "ヘルプ", path: "/help" },
    ],
  },
];

// 営業管理シナリオ
const navGroups: NavGroup[] = [
  {
    label: "概況",
    items: [
      { icon: LayoutDashboard, label: "ダッシュボード", path: "/dashboard" },
      { icon: Target, label: "テリトリー", path: "/territory" },
    ],
  },
  {
    label: "顧客・商談",
    items: [
      { icon: Building2, label: "顧客", path: "/customers" },
      { icon: Handshake, label: "商談", path: "/opportunities" },
    ],
  },
];
```

### デザインシステム UI 構築ルール

| ルール | 実装 |
|--------|------|
| ボタン（主要アクション） | `<Button>` default バリアント（グラデーション） |
| ボタン（副次） | `<Button variant="outline">` |
| カード | `rounded-xl border border-border/60 bg-card shadow-premium card-hover` |
| ドロップダウン | `rounded-xl border border-border/60 bg-card shadow-premium p-1.5 animate-fade-in` |
| グラデーションテキスト | `.gradient-text` クラス |
| ヘッダー | `sticky top-0 backdrop-blur-xl` + `.header-gradient-line` + `.shadow-premium` |
| アイコン配色 | `bg-primary/10 text-primary` or `bg-linear-to-br from-{color} to-{color}` |
| ホバー効果 | `.card-hover` で translateY(-2px) + シャドウ増大 |
| モバイル対応 | `hidden md:flex` / `md:hidden` でブレイクポイント切替 |

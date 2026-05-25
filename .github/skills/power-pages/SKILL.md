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
| 2 | 初回デプロイ | `/deploy-site` | `pac pages upload-code-site --rootPath portal` |
| 3 | アクティベート | `/activate-site` | Power Platform API POST or 管理画面 |
| 4 | 認証設定 | `/setup-auth` | `src/services/authService.ts` + 管理画面で IdP 有効化 |
| 5 | 再デプロイ | `/deploy-site` | `py scripts/deploy_portal.py` |
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

---

## Phase 1: サイト作成（create-site）

SPA プロジェクトの初期化。設計承認後に実行。

```bash
# Vite + React + TypeScript
npm create vite@latest portal -- --template react-ts
cd portal && npm install

# powerpages.config.json 作成
echo '{"$schema":"https://www.schemastore.org/powerpages.config.json","siteName":"SITE_NAME","compiledPath":"dist","defaultLandingPage":"index.html"}' > powerpages.config.json
```

**Vite 設定の重要項目**:
- `base: './'` — 相対パスでアセットを参照（Power Pages のパス構造に対応）
- `inlineDynamicImports: true` — 単一バンドル（ロード順問題防止）
- SPA ルーティングは **Hash モード必須**（サーバーリライト不可のため）

---

## Phase 2: デプロイ（deploy-site）

### コマンド

```bash
# フルデプロイ
py scripts/deploy_portal.py

# ビルドスキップ（アップロード + 再起動のみ）
py scripts/deploy_portal.py --skip-build
```

### デプロイスクリプト処理フロー

```
Phase 0: Pre-Deploy Check
Phase 1: Verify (pac auth who)
Phase 2: Build (npm run build)
Phase 3: Upload (pac pages upload-code-site) ← YAML から settings 復元 + mspp_copy 上書き
Phase 3.5: Site Settings (追加設定 PATCH)
Phase 3.6: Fix Page Content (Root + Content mspp_copy body-only 修正)
Phase 4: Restart (cache clear)
```

### 重要ルール

| ルール | 理由 |
|--------|------|
| **NEVER use `pac pages upload`** | コードサイトには常に `upload-code-site` を使う |
| **`--rootPath` はプロジェクトルート** | `dist/` ではなく `powerpages.config.json` のあるディレクトリ |
| **ビルド前にアップロードしない** | 古いビルド成果物のデプロイを防止 |

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

## Phase 4: 認証設定（setup-auth）

### 4.1 Identity Provider の有効化（手動 — API 不可）

> **CRITICAL**: Identity Provider は Power Pages admin center から手動設定が必須。
> Dataverse API / Power Platform API では自動化できない。

1. https://make.powerpages.microsoft.com/ にアクセス
2. 対象サイトを選択
3. **Security** → **Identity Providers**
4. **Microsoft Entra ID** を有効化
5. リダイレクト URI 等はデフォルト値で OK

### 4.2 認証アーキテクチャ（コードサイト固有）

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

### 認証フロー（PRIVATE サイト + LoginButtonAuthenticationType）

```
1. User accesses site → unauthenticated → redirect to /Account/Login
2. LoginButtonAuthenticationType is set → auto-redirect to Azure AD (no login page shown)
3. User authenticates at Azure AD
4. Callback → Power Pages sets session cookie
5. User redirected back to SPA
6. Web Template injects user info: window.__PP_USER__ = { id, fullname, email }
7. SPA reads window.__PP_USER__ → isAuthenticated = true
8. SPA fetch calls use redirect: 'manual' to prevent following auth redirects
9. If session expires: fetch returns opaqueredirect → SPA redirects to /Account/Login → step 2
```

### 4.3 必須サイト設定（YAML で管理）

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

#### YAML ファイルの形式

```yaml
# Authentication-Registration-LoginButtonAuthenticationType.sitesetting.yml
id: {guid}
name: Authentication/Registration/LoginButtonAuthenticationType
value: "https://login.microsoftonline.com/{tenant-id}/"
```

> **注意**: `value` フィールドが無い YAML ファイルは、upload 時に Dataverse の値を空にする。

### 4.4 認証ファイル構成（推奨パターン）

| ファイル | 用途 |
|---|---|
| `src/hooks/use-auth.ts` | React hook: `window.__PP_USER__` 読み取り + login()/logout() |
| `src/lib/dataverse.ts` | Web API クライアント: `redirect: 'manual'` + opaqueredirect 検知 |

#### use-auth.ts（最小実装）

```typescript
export function useAuth() {
  const ppUser = window.__PP_USER__;
  const isAuthenticated = !!(ppUser && ppUser.id);
  const user = isAuthenticated ? {
    contactId: ppUser!.id!,
    fullName: ppUser!.fullname || "",
    email: ppUser!.emailaddress1 || "",
  } : null;

  const login = () => { window.location.href = "/Account/Login"; };
  const logout = () => { window.location.href = "/Account/Login/LogOff"; };

  return { isAuthenticated, user, login, logout, loading: false };
}
```

#### dataverse.ts（fetch パターン）

```typescript
// 全 fetch に redirect: 'manual' を付与
const res = await fetch(`/_api/${entity}`, {
  redirect: "manual",
  headers: { Accept: "application/json", "OData-MaxVersion": "4.0" },
});

// opaqueredirect 検知 → ログインページへ
if (res.type === "opaqueredirect" || res.status === 0) {
  window.location.href = "/Account/Login";
  return new Promise(() => {}); // never resolve
}
```

> **重要**: `redirect: 'manual'` がないと、未認証時の 302 リダイレクトチェーンが
> ExternalLogin への GET リクエストになり 500 エラーを引き起こす。

---

## 絶対遵守ルール

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

### デプロイ

| ルール | 理由 |
|--------|------|
| **YAML ファイルを site settings の正とする** | pac pages upload が毎回 YAML から Dataverse を上書きする |
| **設定変更 = YAML 更新 + Dataverse PATCH** | 片方だけでは次回デプロイで不整合 |
| **デプロイ前チェックを実行** | `py scripts/predeploy_check.py` で既知問題を事前検出 |
| **NEVER use `pac pages upload`** | コードサイトのメタデータを破壊する |
| **アップロード前にビルドを実行** | 古いビルド成果物のデプロイを防止 |
| **デプロイ後に restart** | キャッシュが残り変更が反映されない |
| **`*-manifest.yml` が stale なら削除** | `.html blocked` エラーの原因 |
| **デプロイ後に mspp_copy を修正（Root + Content 両方）** | upload が full HTML で上書きする |
| **SPA fetch は redirect: 'manual' 必須** | LoginButtonAuthenticationType 使用時の 500 防止 |

---

## Pre-Deploy Health Check（デプロイ前チェック）

デプロイ前に `py scripts/predeploy_check.py` を実行し、既知の問題を検出する。
`deploy_portal.py` の Phase 0 として自動実行される。

### チェック項目

| # | チェック | 検出する問題 | 自動修正 |
|---|---------|-------------|---------|
| 1 | Duplicate Pages | 同一 URL に複数の Published root ページ | ✅ 古い方を Draft に |
| 2 | Publishing State | Home root ページが Draft | ✅ Published に変更 |
| 3 | mspp_copy Integrity | Content ページに full HTML が入っている | ✅ body-only に修正 |
| 4 | Page Template | usewebsiteheaderandfooter≠false / web template不正 | ❌ 手動修正 |
| 5 | Web File Availability | ビルド済み JS/CSS が Web File に存在するか | ⚠️ 警告のみ |
| 6 | Auth Configuration | OpenIdConnect 必須設定の欠落 | ❌ 手動修正 |
| 7 | Login Form ↔ AuthenticationType | form POST の provider 値と site setting の不一致 | ❌ 手動修正 |

### 使い方

```bash
# チェックのみ（読み取り専用）
py scripts/predeploy_check.py

# チェック + 自動修正
py scripts/predeploy_check.py --fix

# デプロイ時（Phase 0 として自動実行）
py scripts/deploy_portal.py

# チェックをスキップしてデプロイ
py scripts/deploy_portal.py --skip-checks
```

### デプロイスクリプト処理フロー（最新）

```
Phase 0: Pre-Deploy Check（重複ページ・mspp_copy・テンプレート整合性）
Phase 1: Verify (pac auth who + powerpages.config.json)
Phase 2: Build (npm run build)
Phase 3: Upload (pac pages upload-code-site)
  ⚠️ この時点で YAML の site-settings が Dataverse に復元される
  ⚠️ この時点で mspp_copy が dist/index.html の全文で上書きされる
Phase 3.5: Site Settings (YAML に含まれない追加設定を Dataverse PATCH)
Phase 3.6: Fix Page Content (Root + Content 両方の mspp_copy を body-only に修正)
Phase 4: Restart (Power Platform API で cache clear)
```

> **重要**: Phase 3 で YAML から設定が復元されるため、YAML ファイル自体を正しく管理することが最重要。
> Phase 3.5 は YAML に含まれない設定（ProfileRedirectEnabled 等）の追加設定用。
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

### DNS 未解決 = ポータルがデプロビジョン済み

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

## 関連スキル

| スキル | 関係 |
|--------|------|
| `architecture` | アーキテクチャ判断後にこのスキルへ |
| `dataverse` | テーブル権限・サイト設定のデプロイ |
| `standard` | 共通認証（auth_helper.py）・.env パラメータ |
| `code-apps` | 内部ユーザー向け UI は Code Apps、外部ユーザー向けは Power Pages |

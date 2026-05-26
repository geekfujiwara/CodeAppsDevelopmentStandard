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

# Power Pages 開発・デプロイスキル

Power Pages のコードサイトを **pac pages CLI** で開発・ビルド・デプロイする。
React / Vue / Angular / Astro 等の静的 SPA フレームワークに対応。

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [ビルドリファレンス](references/build-reference.md) | ビルド構成・フレームワーク別設定・出力形式 |
| [デプロイリファレンス](references/deployment-reference.md) | pac pages コマンド詳細・CI/CD パイプライン構成 |
| [トラブルシューティング](references/troubleshooting.md) | よくあるエラーと解決策 |
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | Enhanced Data Model (v2.0) のテーブル権限設定・N:N バグ・ワークアラウンド |

> **このスキルの位置づけ**: アーキテクチャ設計（`architecture`）で Power Pages 利用が確定した後、サイト開発→デプロイを担当する。Dataverse テーブル・テーブル権限・サイト設定は事前に `dataverse` スキルで構築しておくことを推奨。

## 前提

### 必要ツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| `pac` (Power Platform CLI) | 最新 | サイトアップロード・プロビジョニング |
| `node` + `npm` | 18+ | SPA ビルド |
| `az` (Azure CLI) | 任意 | Azure 連携時のみ |

### .env パラメータ

```env
DATAVERSE_URL=https://{org}.crm7.dynamics.com/
ENV_ID=                               # Power Platform 環境 ID（管理画面 URL・ポータル管理 API に使用）
POWERPAGES_SITE_PATH=./site           # .powerpages-site を含むディレクトリ
POWERPAGES_WEBSITE_NAME=              # 任意: プロビジョニング時のサイト名
```

### .powerpages-site アーティファクト

`POWERPAGES_SITE_PATH` で指定したディレクトリに `.powerpages-site` ファイルが存在する必要がある。
これは `pac pages` コマンドがサイトを識別するためのマーカーファイル。

```text
project-root/
├── site/                    # POWERPAGES_SITE_PATH / SPA ビルド出力
│   ├── .powerpages-site     # サイト識別マーカー
│   ├── index.html
│   └── assets/
├── src/                     # ソースコード
└── package.json
```

## 作業フロー（必ずこの順序で進める）

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

#### 必須制約

| 制約 | 理由 |
|------|------|
| 静的 SPA のみ | SSR / ISR 非対応 |
| **Hash ルーティング必須** | History API モードは直接 URL アクセスで 404（サーバーリライト不可） |
| `base: './'` (Vite) | Power Pages のパス構造に対応 |
| `inlineDynamicImports: true` | コード分割するとロード順問題が発生 |

#### Web API クライアント（必須パターン）

```typescript
// lib/dataverse.ts
const BASE = "/_api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    redirect: "manual",  // ← 必須: 未認証時の 302 チェーン防止
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...init?.headers,
    },
  });

  // セッション切れ検知
  if (res.type === "opaqueredirect" || res.status === 0) {
    window.location.href = "/Account/Login";
    return new Promise(() => {});
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[API] ${path} → ${res.status}`, body);
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}
```

> **`redirect: "manual"` を省略すると**: 未認証時に `/_api/` → 302 → `/Account/Login` → 302 → `/ExternalLogin`(GET) → 500 というエラーチェーンが発生する。

#### OData クエリのポイント

| パターン | 正しい書式 | 誤り |
|----------|-----------|------|
| Lookup 列の参照 | `_geek_categoryid_value` | `geek_categoryid` |
| Boolean フィルタ | `$filter=geek_approved eq true` | `eq 'true'` |
| 日時フィルタ | `createdon gt 2024-01-01T00:00:00Z` | 引用符不要 |
| 展開 | `$expand=geek_CategoryId($select=geek_name)` | — |

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

#### 3-C: Web Role 紐付け（Design Studio で手動 — 自動化不可）

> **⚠️ CRITICAL**: Enhanced Data Model (v2.0) では `mspp_entitypermission_webrole` の N:N を Dataverse Web API で設定できない（プラットフォームバグ）。Design Studio のみが正しく設定可能。

**手順:**
1. https://make.powerpages.microsoft.com/ → 対象サイト
2. セキュリティ → テーブルのアクセス許可
3. 各レコードを開き → ロールに **Authenticated Users** を追加 → 保存

> 管理者ユーザーはテーブル権限をバイパスするため、管理者で OK でも一般ユーザーでは 403 になる。Step 6 で必ず一般ユーザーテストを行うこと。

#### セキュリティ構成チェックリスト

| # | 設定 | 対象 | 自動化 |
|---|------|------|--------|
| 1 | `Webapi/{table}/enabled=true` | 全公開テーブル | ✅ API |
| 2 | `Webapi/{table}/fields=*` | 全公開テーブル | ✅ API |
| 3 | Table Permission (type=18) | 全公開テーブル | ✅ API |
| 4 | Web Role 紐付け | 全 Table Permission | ❌ Design Studio |
| 5 | Site Restart | — | ✅ API |

---

### Step 4: 認証構成（PRIVATE サイトの場合）

#### 4-A: Identity Provider 有効化（手動）

> Identity Provider は Power Pages Design Studio から手動設定が必須（API 不可）。

1. make.powerpages.microsoft.com → セキュリティ → ID プロバイダー
2. Microsoft Entra ID を有効化

#### 4-B: Web Template に Liquid ユーザー注入

```html
<script>window.__PP_USER__ = {{ user | json }};</script>
{{ page.adx_copy }}
```

#### 4-C: 自動リダイレクト設定（推奨）

```yaml
# LoginButtonAuthenticationType: ログインページをスキップして直接 IdP へ
Authentication/Registration/LoginButtonAuthenticationType: "https://login.microsoftonline.com/{tenant-id}/"
```

> この設定を使用する場合、SPA の全 fetch に `redirect: "manual"` が**必須**。

---

### Step 5: サイトアップロード + Restart

```bash
# ビルド
npm run build

# アップロード
pac pages upload-code-site --rootPath ./portal --siteName "サイト名"

# サイト再起動（セキュリティ設定反映に必須）
python .github/skills/power-pages/scripts/manage_portal.py --action restart
```

> **注意**: `upload-code-site` は毎回 `.powerpages-site/site-settings/*.yml` で Dataverse を上書きする。YAML ファイルが設定の正。

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

## 必須制約

| 制約 | 理由 |
|------|------|
| 静的 SPA のみ | SSR / ISR 非対応 |
| Hash ルーティング必須 | サーバーリライト不可 → History API だと直接 URL で 404 |
| `redirect: "manual"` 必須 | 未認証時の 302 → 500 チェーン防止 |
| Vite `base: './'` + `inlineDynamicImports` | Power Pages パス構造対応 |
| YAML が設定の正 | upload-code-site が毎回 YAML で Dataverse を上書き |
| デプロイ後に必ず Restart | セキュリティ設定はキャッシュクリアまで反映されない |
| 一般ユーザーでテスト必須 | 管理者はテーブル権限をバイパスする |

## 対応フレームワーク別ノート

| フレームワーク | ビルドコマンド例 | 出力先 | 備考 |
|---|---|---|---|
| React (Vite) | `npm run build` | `dist/` | `base: './'` を vite.config に設定 |
| Vue (Vite) | `npm run build` | `dist/` | 同上 |
| Angular | `ng build` | `dist/{project}/` | `--base-href ./` オプション |
| Astro | `astro build` | `dist/` | `output: 'static'` を astro.config に設定 |

## ポータル管理（プロビジョニング・再起動・状態確認）

### 管理画面 URL

ポータルのプロビジョニング状態・起動/停止は以下で確認:

```
https://make.powerpages.microsoft.com/environments/{ENV_ID}/portals/home
```

> `ENV_ID` は `.env` の `ENV_ID` 値。スクリプトから動的に開く場合:
> ```python
> import os, webbrowser
> env_id = os.environ["ENV_ID"]
> webbrowser.open(f"https://make.powerpages.microsoft.com/environments/{env_id}/portals/home")
> ```

### Power Platform API によるポータル管理

| 操作 | エンドポイント |
|------|------|
| 一覧取得 | `GET https://api.powerplatform.com/powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 作成 | `POST https://api.powerplatform.com/powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 再起動 | `POST .../websites/{id}/restart?api-version=2024-10-01` |
| 開始 | `POST .../websites/{id}/start?api-version=2024-10-01` |
| 停止 | `POST .../websites/{id}/stop?api-version=2024-10-01` |

**認証スコープ**: `https://api.powerplatform.com/.default`（`auth_helper.get_token(scope=...)` で取得可能）

**Create Website リクエストボディ**:
```json
{
  "dataverseOrganizationId": "{ORG_ID}",
  "name": "サイト名",
  "selectedBaseLanguage": 1041,
  "subdomain": "サブドメイン",
  "templateName": "DefaultPortalTemplate",
  "websiteRecordId": "{既存 adx_websiteid（オプション）}"
}
```

> **注意**: `templateName` は `"DefaultPortalTemplate"` が日本リージョンで利用可能。`"Default Portal Template"`（スペースあり）は無効。

### ポータル管理スクリプト

```bash
python .github/skills/power-pages/scripts/manage_portal.py
```

プロビジョニング状態確認・再起動・新規作成を一括で実行する。

## 検証済み教訓（Lessons Learned）

### デプロイ系

| 問題 | 原因 | 解決 |
|------|------|------|
| upload 後に site settings が消える | `upload-code-site` が YAML で上書き | YAML を正として管理。追加設定は upload 後に PATCH |
| upload 後にページが白紙 / HTML ネスト | mspp_copy が `dist/index.html` 全文で上書き | deploy スクリプトで body-only に修正（Phase 3.6） |
| upload が 50% で停止 | `.js` が blockedattachments に含まれる | `unblock_js.py` で解除 |
| DNS 未解決 | ポータルインフラ停止 | Power Platform API で再プロビジョニング |
| `pac pages provision-website` が動かない | PAC CLI 2.7.x に未実装 | Power Platform API or 管理画面 |

### セキュリティ系

| 問題 | 原因 | 解決 |
|------|------|------|
| 管理者 OK / 一般ユーザー 403 | 管理者はテーブル権限バイパス | Design Studio で Web Role 紐付け |
| API で N:N を設定しても反映しない | Enhanced Model の mspp_ N:N バグ | Design Studio のみ有効 |
| `disableentitypermissions` が効かない | Enhanced Model では無視される | テーブル権限 + Role が必須 |
| Site Settings あるのに 404 | `enabled=true` が未設定（`fields` のみでは不足） | 両方設定する |

### 認証系

| 問題 | 原因 | 解決 |
|------|------|------|
| SPA fetch で 500 | `redirect: "manual"` なし + LoginButtonAuthenticationType | 全 fetch に `redirect: "manual"` |
| ログインボタン2つ表示 | ビルトイン + カスタム OIDC 共存 | `AzureADLoginEnabled=false` |
| "Sign in failed" | トラッキング防止が nonce Cookie ブロック | `Nonce=false` or ビルトインプロバイダー使用 |
| ExternalLogin で 401 | form の provider 値が AuthenticationType と不一致 | 値を完全一致させる |

### ID 管理

| 問題 | 原因 | 解決 |
|------|------|------|
| Power Platform API の Website ID ≠ adx_websiteid | 管理レイヤーが異なる | 用途に応じて使い分け |
| `pac pages list` で表示されるが実際は停止 | adx_ レコードとインフラの乖離 | PP API で状態確認 |
| Restart が 200 だが反映されない | キャッシュクリアに 1〜2 分必要 | 待機してからテスト |

## 関連スキル

| スキル | 関係 |
|--------|------|
| `architecture` | アーキテクチャ判断後にこのスキルへ |
| `dataverse` | テーブル権限・サイト設定のデプロイ |
| `standard` | 共通認証（auth_helper.py）・.env パラメータ |
| `code-apps` | 内部ユーザー向け UI は Code Apps、外部ユーザー向けは Power Pages |
| `model-driven-app` | 管理画面はモデル駆動型、外部公開は Power Pages |

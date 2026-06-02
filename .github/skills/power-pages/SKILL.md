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
---

# Power Pages Code Site (SPA) 開発・デプロイスキル

> **公式リファレンス**: [Power Pages でシングルページ アプリケーションを作成して展開する | Microsoft Learn](https://learn.microsoft.com/ja-jp/power-pages/configure/create-code-sites)

## 核心原則

1. **`pac pages upload-code-site` がサイト作成とデプロイの両方を行う** — API でサイトを事前作成する必要はない
2. **初回は Inactive Sites に作成される** → Power Pages ポータル or PP API でアクティブ化
3. **2回目以降は upload-code-site → restart の2ステップだけ**
4. **Post-Upload Fix は不要** — `upload-code-site` が header/footer/page を正しく構成する
5. **`.powerpages-site/` は upload-code-site が自動管理する** — 手動作成・編集しない
6. **`adx_website` レコードは絶対に削除しない** — EDM 2.0 でもランタイムが起動時に参照する
7. **環境のクリーンアップ時は PP API のサイト一覧と照合してから削除する** — 誤削除で 500 エラー

## ワークフロー

```
初回:
  npm run build → pac pages upload-code-site → Activate → Restart

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
│   │   └── use-auth.ts           ← SSO 認証フック (★デフォルト実装)
│   ├── lib/
│   │   └── utils.ts              ← cn() ユーティリティ
│   └── pages/
│       ├── home.tsx              ← ランディングページ
│       └── profile.tsx           ← プロフィール編集 (★デフォルト実装)
├── dist-site/                    ← ビルド出力 (compiledPath)
│   ├── index.html
│   └── assets/
├── powerpages.config.json        ← CLI 設定ファイル (必須)
├── package.json
├── vite.config.ts
└── scripts/
    └── deploy.py                 ← デプロイスクリプト (Build→Upload→Restart)
```

> **`.powerpages-site/` は upload-code-site が自動生成・管理する。手動作成不要。**

---

## ★ デフォルト実装: SSO ログイン + プロフィール編集

**すべての Code Site プロジェクトに最初から含める必須機能:**

1. Entra ID SSO ログイン（`/SignIn` 直行方式）
2. プロフィール編集ページ（`/_api/contacts` 経由で PATCH）
3. ヘッダー右上のプロフィールアバターアイコン + ドロップダウン
4. `RequireAuth` ガードコンポーネント
5. Contact 自動作成（Power Pages のデフォルト動作）

**実体は `templates/corporate-lp/` にそのまま含まれている。** 新規プロジェクトはこのテンプレートをコピーして使う:

| 機能 | テンプレートファイル |
|---|---|
| SSO 認証フック | [`templates/corporate-lp/src/hooks/use-auth.ts`](templates/corporate-lp/src/hooks/use-auth.ts) |
| Web API クライアント（`/_api/` + anti-forgery token） | [`templates/corporate-lp/src/lib/dataverse.ts`](templates/corporate-lp/src/lib/dataverse.ts) |
| 認証ガード | [`templates/corporate-lp/src/components/require-auth.tsx`](templates/corporate-lp/src/components/require-auth.tsx) |
| プロフィール編集ページ | [`templates/corporate-lp/src/pages/profile.tsx`](templates/corporate-lp/src/pages/profile.tsx) |
| ヘッダーのプロフィールドロップダウン | [`templates/corporate-lp/src/components/site-layout.tsx`](templates/corporate-lp/src/components/site-layout.tsx) |
| `/profile` ルート（`RequireAuth` でガード） | [`templates/corporate-lp/src/App.tsx`](templates/corporate-lp/src/App.tsx) |

**実装の核心:**
- `login()` は `/SignIn?returnUrl=...`。Entra ID が唯一の IdP なら自動で SSO に直行する
- ユーザー情報は `window.Microsoft.Dynamic365.Portal.User`（標準注入）または Liquid `window.__PP_USER__`
- 読み取りは `credentials: 'same-origin'`、書き込みは `/_layout/tokenhtml` の anti-forgery token を付与
- コード詳細・設計判断は [`references/authentication-reference.md`](references/authentication-reference.md) を参照

### ★ SSO 自動リダイレクト設定（ログインボタンで直接 Entra ID に飛ばす）

**これがないと `/SignIn` でクラシックなログイン画面（Username/Password フォーム + Entra ID ボタン）が表示される。**

以下の Site Settings を `adx_sitesettings` テーブルに作成する:

| Site Setting | 値 | 効果 |
|---|---|---|
| `Authentication/Registration/LocalLoginEnabled` | `false` | Username/Password フォームを非表示 |
| `Authentication/Registration/ExternalLoginEnabled` | `true` | 外部 IdP (Entra ID) を有効化 |
| `Authentication/Registration/AzureADLoginEnabled` | `false` | 旧式 Azure AD ボタンの重複を防止 |
| `Authentication/Registration/LoginButtonAuthenticationType` | `https://login.microsoftonline.com/{TENANT_ID}/` | **IdP が1つの場合、ログインページをスキップして直接リダイレクト** |
| `Authentication/Registration/ProfileRedirectEnabled` | `false` | ログイン後に `/profile` へのリダイレクトを防止 |
| `Authentication/Registration/OpenRegistrationEnabled` | `false` | Entra ID ユーザーのみ（セルフ登録無効） |

> ⚠️ **`LoginButtonAuthenticationType` の値は Authority URL** (`https://login.microsoftonline.com/{TENANT_ID}/`)
> **`https://sts.windows.net/{TENANT_ID}/`（OIDC Issuer）ではない！** Issuer を設定すると自動リダイレクトが動作しない。

```python
# setup_auth.py で一括設定
TENANT_ID = os.environ["TENANT_ID"]
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}/"
ADX_WEBSITE_ID = "..."  # adx_websites テーブルの ID

SETTINGS = {
    "Authentication/Registration/LoginButtonAuthenticationType": AUTHORITY,
    "Authentication/Registration/LocalLoginEnabled": "false",
    "Authentication/Registration/ExternalLoginEnabled": "true",
    "Authentication/Registration/AzureADLoginEnabled": "false",
    "Authentication/Registration/ProfileRedirectEnabled": "false",
    "Authentication/Registration/OpenRegistrationEnabled": "false",
}

for name, value in SETTINGS.items():
    upsert_adx_sitesetting(name, value, ADX_WEBSITE_ID)

# 設定反映にはサイト再起動が必要
restart_site(ENV_ID, SUBDOMAIN)
```

**設定後の動作:**
1. ユーザーが `/SignIn?returnUrl=/` にアクセス
2. Power Pages はログイン画面を表示せず、直接 `https://login.microsoftonline.com/{TENANT_ID}/oauth2/authorize?...` にリダイレクト
3. Entra ID でSSO認証（既にセッションがあれば自動的にログイン完了）
4. `returnUrl=/` にリダイレクトされ SPA がロード

> Site Settings 変更後は **PP API で restart が必須**（最大15分キャッシュが残る）。

### Contact 自動作成

Power Pages では **Entra ID 経由で初回ログインした時に Contact レコードが自動作成される**。
サイト設定 `Authentication/Registration/OpenRegistrationEnabled = false` でも、Entra ID 経由なら Contact は自動作成される。
追加のコードは不要。

### Contact テーブルの Web API 有効化

プロフィール編集には `contact` テーブルの Web API アクセスが必要。
**3 つのレイヤーすべてを設定しないと 404 になる:**

1. **Site Settings** (`adx_sitesettings`) — `Webapi/contact/enabled` + `fields`
2. **テーブル権限** (`powerpagecomponent` type=18 / Enhanced。Standard なら `mspp_entitypermission`) — Contact Self スコープ
3. **Web Role 紐付け** (N:N) — 認証ユーザーへの権限付与

`scripts/setup_permissions.py` がこの 3 レイヤーをべき等に一括設定する。手順・スコープ値・モデル別の注意点（`powerpagesites` vs `adx_websites` のバインド先など）は [`references/dataverse-connection-reference.md`](references/dataverse-connection-reference.md) を参照。

> ⚠️ **よくあるミス:** Site Settings の `adx_websiteid` は `adx_websites` に、テーブル権限の `powerpagesiteid` は `powerpagesites` に紐付ける（バインド先が異なる）。

### ★ 初回デプロイ後の必須手順

デプロイ直後に以下を実行し、SSO + Web API が動作する状態にする:

```bash
# 1. SSO 自動リダイレクト設定（/SignIn で直接 Entra ID にリダイレクト）
py scripts/setup_auth.py

# 2. Web API テーブル権限設定（/_api/ エンドポイント有効化）
py scripts/setup_permissions.py

# 3. サイトリスタート（設定反映）— 上記スクリプト内で自動実行される
```

**スクリプト実行に必要な .env:**
```env
DATAVERSE_URL=https://your-org.crm.dynamics.com/
ENV_ID=your-environment-id
TENANT_ID=your-tenant-id
PP_SUBDOMAIN=your-site-subdomain
```

**`/_api/contacts` が 404 を返す原因**:
- Site Settings (`Webapi/contact/enabled`) が未設定 → `setup_permissions.py` で解決
- テーブル権限が未設定 → 同スクリプトで解決
- Web Role リンクなし → 同スクリプトで解決

**ログイン画面が表示される（自動リダイレクトしない）原因**:
- `LoginButtonAuthenticationType` が未設定 or 値が間違い → `setup_auth.py` で解決
- ❌ `https://sts.windows.net/{TENANT_ID}/` → 動作しない
- ✅ `https://login.microsoftonline.com/{TENANT_ID}/` → 正しい Authority URL

### powerpages.config.json（必須）

```json
{
  "siteName": "MySite",
  "compiledPath": "dist-site",
  "defaultLandingPage": "index.html"
}
```

| フィールド | 説明 |
|-----------|------|
| `siteName` | Power Pages サイトの表示名。初回 upload 時にこの名前でサイトが作成される |
| `compiledPath` | ビルド出力ディレクトリ（`vite.config.ts` の `outDir` と一致させる） |
| `defaultLandingPage` | ランディングページファイル名 |

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
| **Hash ルーティング必須** | History API モードは直接 URL アクセスで 404（サーバーリライト不可） |
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

これだけで:
- Dataverse に Code Site レコードが作成される (Enhanced Data Model 2.0)
- ビルド済みアセット (JS/CSS) が Web File としてアップロードされる
- Home page / Header / Footer テンプレートが SPA 用に構成される
- サイトは **Inactive** 状態で作成される

### 2-C: サイトのアクティブ化

#### 方法 A: Power Pages ポータル（推奨）

1. [Power Pages](https://make.powerpages.microsoft.com/) に移動
2. **Inactive sites** でサイトを見つける
3. **再アクティブ化** をクリック

#### 方法 B: Power Platform API

```python
import requests
from auth_helper import get_token

ENV_ID = os.environ["ENV_ID"]
token = get_token(scope="https://api.powerplatform.com/.default")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Organization ID を取得
dv_token = get_token()
org = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/organizations?$select=organizationid",
    headers={"Authorization": f"Bearer {dv_token}", "Accept": "application/json"},
)
org_id = org.json()["value"][0]["organizationid"]

# websiteRecordId を取得 (powerpagesites テーブルから)
sites = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/powerpagesites?$select=powerpagesiteid,name&$orderby=createdon desc&$top=1",
    headers={"Authorization": f"Bearer {dv_token}", "Accept": "application/json"},
)
website_record_id = sites.json()["value"][0]["powerpagesiteid"]

# プロビジョニング
body = {
    "dataverseOrganizationId": org_id,
    "name": "MySite",
    "selectedBaseLanguage": 1041,
    "subdomain": "mysite01",
    "templateName": "DefaultPortalTemplate",
    "websiteRecordId": website_record_id,
    "dataModel": "Enhanced",
}
r = requests.post(
    f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01",
    headers=headers, json=body,
)
# 202 Accepted → プロビジョニング開始（3〜5分で完了）
```

### 2-D: アクティブ化後の初回リスタート

```python
# PP API でサイト ID を取得してリスタート
base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
for s in r.json()["value"]:
    if s["subdomain"] == "mysite01":
        requests.post(f"{base}/{s['id']}/restart?api-version=2024-10-01", headers=headers)
        break
```

> アクティブ化後、URL にアクセスできるまで **60〜90秒** かかる。

---

## Step 3: 再デプロイ（2回目以降）

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath .
# → サイト再起動（API or deploy.py）
```

または Python スクリプトで一括:

```bash
py portal/scripts/deploy.py
```

### deploy.py（推奨デプロイスクリプト）

```python
"""Power Pages Code Site: Build → Upload → Restart"""
import os, sys, subprocess
# ... (auth_helper / requests をインポート)

def main():
    # [1/3] Build
    subprocess.run("npm run build", shell=True, cwd=PORTAL_DIR, check=True)

    # [2/3] Upload
    subprocess.run(f'pac pages upload-code-site --rootPath "{PORTAL_DIR}"',
                   shell=True, check=True)

    # [3/3] Restart
    token = get_token(scope="https://api.powerplatform.com/.default")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
    for s in r.json()["value"]:
        if s["subdomain"] == SUBDOMAIN:
            requests.post(f"{base}/{s['id']}/restart?api-version=2024-10-01", headers=headers)
            break

    print(f"DONE. URL: https://{SUBDOMAIN}.powerappsportals.com")
    print("(60-90秒後にアクセス可能)")
```

---

## Step 4: 認証と承認

> **SSO ログイン + プロフィール編集は「★ デフォルト実装」セクションのコードをそのまま使う。**
> 以下は技術的な背景と追加カスタマイズ用のリファレンス。

### 認証方式の選択

| 方式 | 推奨度 | 説明 |
|------|--------|------|
| `/SignIn` 直行 (SSO) | ★推奨 | `LoginButtonAuthenticationType` 設定済みなら自動でSSO。ログイン画面が表示されない |
| PRIVATE サイト | ◎ | 全ページ認証必須。SPA ロード時点で認証済み。最もシンプル |
| `/Account/Login/ExternalLogin` POST | ○ | 複数 IdP がある場合に特定プロバイダーを指定 |
| `/Account/Login` リダイレクト | △ | クラシックログインページ。SPA 体験が途切れる |

> `/SignIn` 方式で自動リダイレクトが動作するには **Site Settings の設定が必須**。
> 上記「★ SSO 自動リダイレクト設定」セクションの `setup_auth.py` を初回デプロイ後に実行する。

### 実装の要点

- **Site Settings のバインド**: `adx_sitesettings` は `adx_websiteid@odata.bind` で最新の `adx_websites` レコードに紐付ける。`scripts/setup_auth.py` が upsert する。詳細は [`references/operations-and-pitfalls.md`](references/operations-and-pitfalls.md)。
- **ユーザーコンテキスト**: `window.Microsoft.Dynamic365.Portal.User`（`use-auth.ts` が正規化）。
- **Anti-Forgery Token**: 書き込みは `/_layout/tokenhtml` から `__RequestVerificationToken` を取得（`lib/dataverse.ts` が実装）。
- **ID プロバイダー**: [Power Pages](https://make.powerpages.microsoft.com/) → サイト → セキュリティ → ID プロバイダー → Microsoft Entra ID を有効化（新規サイトはデフォルト設定済み）。
- 認証フロー・コード詳細は [`references/authentication-reference.md`](references/authentication-reference.md)。

---

## Step 5: Power Pages Web API

```typescript
// /_api/ を使用して Dataverse テーブルにアクセス
const response = await fetch("/_api/geek_incidents", { credentials: "same-origin" });
const data = await response.json();
const records = data.value;
```

`/_api/` が動くには **3 レイヤー**（① `adx_sitesettings` で API 公開 + ② `powerpagecomponent` type=18 のテーブル権限 + ③ N:N Web Role 紐付け）すべてが必要。`scripts/setup_permissions.py` の `TABLES` に公開テーブルを追加して実行すれば一括設定できる。

> 管理者はテーブル権限をバイパスする。**必ず一般ユーザーでもテストする。**

手順・スコープ値・OData クエリの書式・モデル別の注意点は [`references/dataverse-connection-reference.md`](references/dataverse-connection-reference.md) と [`references/enhanced-data-model-permissions.md`](references/enhanced-data-model-permissions.md) を参照。

---

## Step 6: ローカル開発

`vite.config.ts` にプロキシを追加して localhost から Web API を呼べるようにする:

```typescript
export default defineConfig({
  server: {
    proxy: {
      "/_api": {
        target: "https://mysite01.powerappsportals.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
```

> Bearer 認証には Entra AD v1 エンドポイント + ADAL.js を使用。MSAL は非互換。

---

## 既存 Power Pages サイトとの違い

| 項目 | SPA Code Site |
|------|--------------|
| ルーティング | クライアント側（Hash Router）。ハードリフレッシュはルートにフォールバック |
| Liquid テンプレート | 非サポート。Web API + フレームワークテンプレートを使用 |
| ページワークスペース | 非サポート。クライアントルーティングを使用 |
| スタイル | フレームワークの CSS/Tailwind を使用 |
| ローカライゼーション | クライアント側リソース読み込みで実装 |
| SEO | 限定的（CSR のため） |

---

## Power Platform API

| 操作 | エンドポイント |
|------|------|
| 一覧取得 | `GET /powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 作成/アクティブ化 | `POST /powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 再起動 | `POST .../websites/{id}/restart?api-version=2024-10-01` |
| 開始 | `POST .../websites/{id}/start?api-version=2024-10-01` |
| 停止 | `POST .../websites/{id}/stop?api-version=2024-10-01` |

**Base URL**: `https://api.powerplatform.com`
**認証スコープ**: `https://api.powerplatform.com/.default`

---

## トラブルシューティング

| 問題 | 原因 | 対策 |
|------|------|------|
| upload-code-site で `.js blocked` | 環境で JS ブロック | `scripts/unblock_js.py`（管理センターで `js` を許可） |
| サイト URL が 503 | 未プロビジョニング/未アクティブ | Inactive Sites でアクティブ化。60-90秒待つ |
| Web API が 403 / 404 | 3 レイヤーのいずれか未設定 | `setup_permissions.py` 実行 |
| `/SignIn` でログインフォーム表示 | `LoginButtonAuthenticationType` 未設定/値誤り | `setup_auth.py` 実行（Authority URL） |
| 設定変更が反映されない | サイトキャッシュ | PP API で restart + ブラウザキャッシュクリア |

> 症状別の完全な一覧（500 エラー、孤立レコード、コールドスタート、復旧不能時など）は [`references/operations-and-pitfalls.md`](references/operations-and-pitfalls.md)。

---

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [認証リファレンス](references/authentication-reference.md) | SSO フロー・use-auth/dataverse 実装・anti-forgery・Entra ID |
| [Dataverse 接続リファレンス](references/dataverse-connection-reference.md) | `/_api/` を確実に通す 3 レイヤー設定・OData クエリ・モデル別注意点 |
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | テーブル権限設定・自動化パターン |
| [Web API 実装パターン](references/web-api-implementation.md) | `/_api/` クライアント実装・CSRF・403 対処 |
| [運用上の落とし穴とリカバリ](references/operations-and-pitfalls.md) | 危険操作・検証済み教訓・リカバリ手順・トラブルシュート全集 |
| [デザインシステム](references/design-system.md) | カラートークン・コンポーネントパターン |

## 自動化スクリプト

| スクリプト | 用途 |
|---|---|
| `scripts/setup_auth.py` | SSO 自動リダイレクト設定（Site Settings + restart） |
| `scripts/setup_permissions.py` | Web API テーブル権限（Site Settings + powerpagecomponent + N:N リンク） |
| `scripts/check_prerequisites.py` | 環境前提条件チェック |
| `scripts/unblock_js.py` | JS ファイルブロック解除 |

### 初回デプロイの完全手順（ゼロから動作するまで）

```bash
# 0. 前提: pac CLI ログイン済み + .env 設定済み
pac auth list

# 1. ビルド & アップロード（サイト作成）
npm run build
pac pages upload-code-site --rootPath .

# 2. Power Pages ポータルでサイトをアクティブ化
#    https://make.powerpages.microsoft.com/ → Inactive Sites → 再アクティブ化

# 3. SSO 設定（ログイン画面スキップ → 直接 Entra ID）
py scripts/setup_auth.py

# 4. Web API 権限設定（/_api/ エンドポイント有効化）
py scripts/setup_permissions.py

# 5. 動作確認（60-90秒後にアクセス可能）
#    https://{subdomain}.powerappsportals.com/
#    → /SignIn にアクセス → 自動で Entra ID にリダイレクト → ログイン完了
#    → /_api/contacts で JSON レスポンス確認
```

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
├── src/                          ← ソースコード (React/Vue/Angular)
├── dist-site/                    ← ビルド出力 (compiledPath)
│   ├── index.html
│   └── assets/
│       ├── index-XXXXX.js
│       └── index-XXXXX.css
├── powerpages.config.json        ← CLI 設定ファイル (必須)
├── package.json
├── vite.config.ts
└── scripts/
    └── deploy.py                 ← デプロイスクリプト (Build→Upload→Restart)
```

> **`.powerpages-site/` は upload-code-site が自動生成・管理する。手動作成不要。**

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

### ユーザーコンテキストへのアクセス

```typescript
// Power Pages がグローバルに注入するユーザー情報
const user = (window as any)["Microsoft"]?.Dynamic365?.Portal?.User;
const username = user?.userName ?? "";
const firstName = user?.firstName ?? "";
const tenantId = (window as any)["Microsoft"]?.Dynamic365?.Portal?.tenant ?? "";
const isAuthenticated = username !== "";
```

### ログイン / ログアウト

```typescript
// Anti-Forgery Token の取得
const fetchToken = async (): Promise<string> => {
  const res = await fetch("/_layout/tokenhtml");
  const html = await res.text();
  const match = html.match(/value="([^"]+)"/);
  return match?.[1] ?? "";
};

// ログイン form POST
<form action="/Account/Login/ExternalLogin" method="post">
  <input name="__RequestVerificationToken" type="hidden" value={token} />
  <button name="provider" type="submit"
    value={`https://login.windows.net/${tenantId}/`}>
    Login
  </button>
</form>

// ログアウト
window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
```

### ID プロバイダー構成

1. [Power Pages](https://make.powerpages.microsoft.com/) → サイト選択
2. セキュリティ → ID プロバイダー
3. Microsoft Entra ID を有効化（新規サイトはデフォルトで設定済み）

---

## Step 5: Power Pages Web API

```typescript
// /_api/ を使用して Dataverse テーブルにアクセス
const response = await fetch("/_api/geek_incidents");
const data = await response.json();
const records = data.value;
```

### Web API を有効化する Site Settings

テーブルごとに `adx_sitesettings` に設定を追加:

```python
tables = ["geek_incident", "geek_category"]
for table in tables:
    create_adx_sitesetting(f"Webapi/{table}/enabled", "true", website_id)
    create_adx_sitesetting(f"Webapi/{table}/fields", "*", website_id)
```

> Site Settings がないとテーブルが Web API に公開されない（管理者でも 404）。

### テーブル権限 (Enhanced Data Model)

Enhanced Data Model (v2.0) では `powerpagecomponent` テーブルで管理:

```python
# type=18 がテーブル権限
component = {
    "powerpagecomponenttype": 18,
    "name": f"{table} - Global Read",
    "content": json.dumps({
        "mspp_entityname": table_logical,
        "mspp_scope": "756150000",  # Global
        "mspp_read": "true",
        "mspp_write": "false",
        "mspp_create": "false",
        "mspp_delete": "false",
    }),
    "powerpagesiteid@odata.bind": f"/powerpagesites({SITE_ID})",
}

# Web Role (type=11) との紐付け: 自己参照 N:N
url = f"{DV}/api/data/v9.2/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"
body = {"@odata.id": f"{DV}/api/data/v9.2/powerpagecomponents({role_ppc_id})"}
requests.post(url, json=body, headers=headers)
```

> 管理者でも Web ロール経由でないと 403。必ず一般ユーザーでもテストすること。

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
| upload-code-site で `.js blocked` | 環境で JS ブロック | 管理センター → ブロック添付ファイルから `js` 削除 |
| サイト URL が 503 | プロビジョニング未完了 or 未アクティブ | Inactive Sites でアクティブ化。60-90秒待つ |
| Web API が 403 | テーブル権限未設定 or Web ロール未紐付け | Site Settings + Table Permission + Web Role 紐付け確認 |
| Web API が 404 | `Webapi/{table}/enabled` 未設定 | adx_sitesettings に追加 |
| SPA が表示されずクラシックページ表示 | サイトが Code Site として作成されていない | **削除して `upload-code-site` で再作成**（変換不可） |
| ログイン後にブランクページ | `ProfileRedirectEnabled=true` | `false` に設定 |
| 設定変更が反映されない | サイトキャッシュ | PP API で restart + ブラウザキャッシュクリア |
| `Object reference not set` + `FetchSolutions` | `adx_website` レコードが存在しない | 下記「adx_website は絶対に削除してはいけない」参照 |
| `Object reference not set` + `ToOrganizationService` | ポータル App User の CRM 接続失敗 | サイトの Application User がロール付きで存在するか確認 |
| 起動エラー全般（500）| 孤立レコードが原因の可能性 | 下記「孤立レコード問題」参照 |

---

## 危険操作（絶対にやってはいけないこと）

### 1. `adx_website` レコードを削除してはいけない

**EDM 2.0 Code Site であっても** ポータルランタイム (Adxstudio) は `adx_website` レコードを参照する。
`upload-code-site` が初回アップロード時に自動作成するこのレコードを削除すると:

- ランタイムが起動時に `NullReferenceException` → 500 エラー
- スタックトレース: `ToOrganizationService` → `FetchSolutions`
- サイトが完全にアクセス不能になる

**復旧方法**: `adx_website` を POST で再作成 → restart

```python
# 最低限のフィールドで再作成
body = {
    "adx_name": f"{SITE_NAME} - {SUBDOMAIN}",
    "adx_primarydomainname": f"{SUBDOMAIN}.powerappsportals.com",
    "adx_website_language": 1033,  # or 1041 for Japanese
}
requests.post(f"{DATAVERSE_URL}api/data/v9.2/adx_websites", headers=headers, json=body)
```

### 2. PP API `POST /websites` で Code Site を作ってはいけない

PP API の `POST /powerpages/environments/{envId}/websites` は**常にクラシックポータル**を作成する。
Code Site は `pac pages upload-code-site` でのみ作成可能。

### 3. 孤立レコードのクリーンアップ時の注意

環境に複数のテスト/失敗サイトレコードが残った場合:

| テーブル | 安全に削除可能? | 注意 |
|---------|----------------|------|
| `powerpagesites` | ⚠ 慎重に | 対応する PP API サイトが存在しないもののみ |
| `adx_websites` | ❌ 基本削除禁止 | ランタイムが参照。削除すると 500 エラー |
| `adx_websitelanguages` | ❌ 削除禁止 | サイトの言語バインディング |
| `adx_webtemplates` | ❌ 削除禁止 | Header/Footer のレンダリングに必須 |

**クリーンアップ前に必ず確認すること:**
1. PP API (`GET /websites?api-version=2024-10-01`) で現在アクティブなサイト一覧を取得
2. 各サイトの `websiteRecordId` (= `powerpagesiteid`) を確認
3. アクティブサイトに紐付く `powerpagesiteid` を持つレコードは絶対に消さない
4. `adx_websites` は基本的に消さない（どのサイトに紐付くか明確でない場合が多い）

### 4. 環境内に 1つの Code Site しか作成しない

同じ環境に複数の Code Site を作ると `adx_website` の紐付けが曖昧になる。
1 環境 = 1 Code Site を推奨。

---

## 重要な教訓

1. **Code Site は最初から Code Site として作成する必要がある** — 既存のクラシックサイトを Code Site に変換することはできない
2. **`pac pages upload-code-site` が正しいサイト作成方法** — PP API の `POST /websites` で作ったサイトはクラシックポータル
3. **Enhanced Data Model (v2.0) が自動的に使われる** — upload-code-site で作成されたサイトは EDM
4. **Standard Data Model のサイトでは `adx_sitesettings` / `adx_websites` テーブルを使用** — `mspp_` プレフィックスは EDM (powerpagecomponent) のみ
5. **サイト設定は `adx_sitesettings` に `adx_websiteid` をリンクして作成** — websiteId が異なると無視される
6. **`adx_website` レコードは EDM 2.0 でもランタイムに必須** — upload-code-site が初回に自動作成。削除禁止
7. **孤立レコードは `FetchSolutions` の NullRef を引き起こす** — ただし削除対象を間違えるとさらに悪化する
8. **デプロイ失敗時のリカバリは「再 upload-code-site」が最善** — 手動レコード操作はリスクが高い

---

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [認証リファレンス](references/authentication-reference.md) | 認証サービス・anti-forgery・Entra ID |
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | テーブル権限設定・自動化パターン |
| [Web API 実装パターン](references/web-api-implementation.md) | `/_api/` クライアント実装・CSRF・403 対処 |
| [デザインシステム](references/design-system.md) | カラートークン・コンポーネントパターン |

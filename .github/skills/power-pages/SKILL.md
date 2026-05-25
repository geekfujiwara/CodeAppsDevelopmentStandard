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

# Power Pages 開発・デプロイスキル

Power Pages のコードサイトを **pac pages CLI** で開発・ビルド・デプロイする。
React / Vue / Angular / Astro 等の静的 SPA フレームワークに対応。

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [ビルドリファレンス](references/build-reference.md) | ビルド構成・フレームワーク別設定・出力形式 |
| [デプロイリファレンス](references/deployment-reference.md) | pac pages コマンド詳細・CI/CD パイプライン構成 |
| [トラブルシューティング](references/troubleshooting.md) | よくあるエラーと解決策 |

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
ENV_ID=                               # Power Platform 環境 ID（管理画面 URL に使用）
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

### Step 0: 前提チェック（スクリプト利用可）

```bash
python .github/skills/power-pages/scripts/check_prerequisites.py
```

CLI・認証プロファイル・アーティファクトの存在を確認する。

### Step 1: サイト設計（ユーザー承認必須）

設計書を作成してユーザーに提示する。以下をすべて含める:

| 項目 | 内容 |
|------|------|
| フレームワーク | React / Vue / Angular / Astro のいずれか |
| ページ構成 | ルーティング・認証ページ・公開ページの一覧 |
| テーブル権限 | 外部ユーザーがアクセスする Dataverse テーブルと権限レベル |
| サイト設定 | 必要な site settings キー・値の一覧 |
| Web ロール | ロール定義と割り当て方針 |
| ビルド出力先 | `dist/` or `build/` → Power Pages へのマッピング |

### Step 2: SPA 開発・ビルド

選択したフレームワークでローカル開発し、静的ファイルとしてビルドする。

```bash
npm run build
```

> **重要**: Power Pages コードサイトは静的 SPA のみ対応。SSR / ISR は使用不可。

### Step 3: テーブル権限・サイト設定のデプロイ

Dataverse テーブル権限と Power Pages サイト設定は `dataverse` スキルで事前にデプロイする。
外部ユーザーのアクセス制御に直接影響するため、テーブル権限の設定漏れがないか確認する。

### Step 4: サイトアップロード

```bash
# rootPath: サイトルート(.powerpages-site のあるディレクトリ)
# compiledPath: ビルド出力ディレクトリ(rootPath からの相対)
# siteName: Dataverse の adx_website.adx_name
pac pages upload-code-site --rootPath ./site --compiledPath ./dist --siteName "サイト名"
```

> `--siteName` を省略すると環境内で一意のサイトが自動選択される。複数サイトがある場合は必ず指定する。

### Step 5: サイトプロビジョニング（初回のみ）

> **注意**: `pac pages provision-website` は PAC CLI 2.7.x では未実装。以下の代替手段を使用する。

**方法 A: Power Platform API 経由（推奨）**
```bash
python .github/skills/power-pages/scripts/manage_portal.py --action create --name "サイト名" --subdomain "サブドメイン"
```

**方法 B: 管理画面から手動作成**
```
https://make.powerpages.microsoft.com/environments/{ENV_ID}/portals/home
```

既にプロビジョニング済みの場合は Step 4 のアップロードのみで更新される。

### Step 6: デプロイスクリプト（一括実行）

```bash
python .github/skills/power-pages/scripts/deploy_site.py
```

前提チェック → アップロード → プロビジョニング（任意）を一括実行する。

## 絶対遵守ルール

### サイト構成

| ルール | 理由 |
|--------|------|
| **静的 SPA のみ** | Power Pages コードサイトは SSR / ISR 非対応 |
| **`.powerpages-site` 必須** | pac pages がサイトを識別するマーカー |
| **ビルド出力は静的ファイル** | `index.html` + JS/CSS/assets のみ |
| **対応フレームワーク: React / Vue / Angular / Astro** | これら以外は動作保証外 |
| **SPA ルーティングは Hash モード推奨** | History API モードはサーバーリライト不可のため注意 |

### セキュリティ

| ルール | 理由 |
|--------|------|
| **テーブル権限は最小権限の原則** | 外部ユーザーに不要なデータを公開しない |
| **Web ロール設計は事前承認必須** | 権限設計ミスは情報漏洩に直結 |
| **サイト設定に機密情報を格納しない** | サイト設定はクライアントから参照可能な場合がある |
| **認証ページと公開ページを明確に分離** | 未認証ユーザーのアクセス制御を確実に |

### デプロイ

| ルール | 理由 |
|--------|------|
| **`pac auth list` で認証プロファイルを確認** | 未認証状態でのデプロイは失敗する |
| **アップロード前にビルドを実行** | 古いビルド成果物のデプロイを防止 |
| **プロビジョニングは初回のみ** | 2 回目以降は upload-code-site で更新 |
| **デプロイ後に動作確認** | ルーティング・API 呼び出し・認証フローの確認 |

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
|------|--------------|
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

### `.js` 拡張子ブロック問題

| 症状 | `pac pages upload-code-site` が 50% で停止、`PortalFileContentUploadFailed` |
|------|------|
| 原因 | Dataverse organization の `blockedattachments` に `.js` が含まれている |
| 確認方法 | `GET /api/data/v9.2/organizations?$select=blockedattachments` |
| 解決方法 | `.js` をリストから除外して PATCH で更新 |

```python
# 除外スクリプト例
from auth_helper import get_token
import requests, os
token = get_token()
url = f"{os.environ['DATAVERSE_URL']}/api/data/v9.2/organizations"
headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
r = requests.get(f"{url}?$select=blockedattachments,organizationid", headers=headers)
org = r.json()["value"][0]
exts = [e.strip() for e in org["blockedattachments"].split(";") if e.strip() and e.strip() != "js"]
requests.patch(f"{url}({org['organizationid']})",
    headers={**headers, "Content-Type": "application/json"},
    json={"blockedattachments": ";".join(exts)})
```

### DNS 未解決 = ポータルがデプロビジョン済み

| 症状 | `Failed to resolve '{subdomain}.powerappsportals.com'` |
|------|------|
| 原因 | ポータルインフラがデプロビジョンされている（トライアル期限切れ or 停止） |
| 確認方法 | Power Platform API の `websites` 一覧が空 / 管理画面で「停止」表示 |
| 解決方法 | Create Website API で再プロビジョニング or 管理画面から開始 |

> **重要**: Dataverse の `adx_website` レコードが残っていてもインフラが停止していることがある。`pac pages list` はレコードを参照するため表示されるが、実際のサイトは利用不可。

### `pac pages provision-website` は PAC CLI 2.7.x に存在しない

PAC CLI 2.7.4 時点では `provision-website` コマンドは未実装。代替手段:
- Power Platform API の Create Website エンドポイント
- Power Pages 管理画面: `https://make.powerpages.microsoft.com/environments/{ENV_ID}/portals/home`

### Power Platform API の Website ID ≠ Dataverse adx_websiteid

Power Platform API (`api.powerplatform.com`) で管理されるサイト ID は、Dataverse の `adx_websiteid` とは異なる場合がある。レガシーポータル（Power Pages サービス移行前に作成されたもの）は API に登録されておらず、一覧で 0 件が返る。

## 関連スキル

| スキル | 関係 |
|--------|------|
| `architecture` | アーキテクチャ判断後にこのスキルへ |
| `dataverse` | テーブル権限・サイト設定のデプロイ |
| `standard` | 共通認証（auth_helper.py）・.env パラメータ |
| `code-apps` | 内部ユーザー向け UI は Code Apps、外部ユーザー向けは Power Pages |
| `model-driven-app` | 管理画面はモデル駆動型、外部公開は Power Pages |

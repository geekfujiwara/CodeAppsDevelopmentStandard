# Power Pages デプロイリファレンス

> Based on [microsoft/power-platform-skills](https://github.com/microsoft/power-platform-skills) best practices.

## プロジェクト構成（必須）

```text
portal/
├── powerpages.config.json    ← pac pages が読む設定ファイル
├── .powerpages-site/         ← サイトメタデータ（pac pages download で取得）
│   ├── website.yml
│   ├── web-templates/
│   ├── web-pages/
│   ├── site-settings/
│   ├── table-permissions/
│   └── web-roles/
├── dist/                     ← ビルド出力（compiledPath）
│   ├── index.html
│   └── assets/
├── src/                      ← ソースコード
├── index.html                ← エントリポイント
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### powerpages.config.json（必須）

```json
{
  "$schema": "https://www.schemastore.org/powerpages.config.json",
  "siteName": "geeksupport",
  "compiledPath": "dist",
  "defaultLandingPage": "index.html"
}
```

| フィールド           | 説明                                                |
| -------------------- | --------------------------------------------------- |
| `siteName`           | Dataverse 上のサイト名（`pac pages list` で確認）   |
| `compiledPath`       | ビルド出力ディレクトリ（`rootPath` からの相対パス） |
| `defaultLandingPage` | エントリ HTML ファイル名                            |

## pac pages コマンド

### upload-code-site（デプロイ）

```bash
pac pages upload-code-site --rootPath "<PROJECT_ROOT>"
```

| オプション   | 説明                                                              | 必須 |
| ------------ | ----------------------------------------------------------------- | ---- |
| `--rootPath` | `powerpages.config.json` と `.powerpages-site` のあるディレクトリ | Yes  |

> **重要**: `--rootPath` は `dist/` ではなくプロジェクトルート。  
> ツールは `powerpages.config.json` の `compiledPath` から dist を解決する。

> **NEVER use `pac pages upload`** — コードサイトには常に `upload-code-site` を使う。  
> `pac pages upload` はポータルスタジオ用で、コードサイトのメタデータを破壊する。

### upload-code-site の動作

1. `powerpages.config.json` を読み `siteName` と `compiledPath` を取得
2. `compiledPath` 内の全ファイルを Web ファイルとして Dataverse にアップロード
3. Home ページの `mspp_copy` を `index.html` の内容で更新
4. Header / Footer Web テンプレートを `<div/>` に更新

### list（サイト一覧）

```bash
pac pages list
```

### download-code-site

```bash
pac pages download-code-site --rootPath "<PROJECT_ROOT>"
```

## デプロイワークフロー（6 フェーズ）

### Phase 0: Pre-Deploy Health Check

```bash
py scripts/predeploy_check.py          # チェックのみ
py scripts/predeploy_check.py --fix    # チェック + 自動修正
```

重複ページ・mspp_copy 形式・テンプレート設定を検証。

### Phase 1: 前提確認

```bash
pac auth who          # 認証状態確認
pac pages list        # サイト存在確認
```

### Phase 2: ビルド

```bash
cd portal && npm run build
```

### Phase 3: アップロード

```bash
pac pages upload-code-site --rootPath portal
```

> ⚠️ **CRITICAL**: このコマンドは以下を実行する:
> 1. `dist/` 内の全ファイルを Web ファイルとして Dataverse にアップロード
> 2. **`.powerpages-site/site-settings/*.sitesetting.yml` の値で Dataverse の site settings を上書き**
> 3. Home ページの `mspp_copy` を `dist/index.html` の全内容で上書き
>
> → YAML ファイルが設定の真のソース。設定変更は必ず YAML を更新すること。
> → mspp_copy は Phase 3.6 で修正する。

### Phase 3.5: 追加サイト設定

YAML に含まれていない追加設定を Dataverse API で直接設定:

```python
# ProfileRedirectEnabled（YAML にない場合）
requests.patch(
    f'{DATAVERSE_URL}/api/data/v9.2/mspp_sitesettings({setting_id})',
    headers=h, json={'mspp_value': 'false'}
)
```

### Phase 3.6: mspp_copy 修正（Root + Content 両方）

`pac pages upload-code-site` が full HTML で上書きした mspp_copy を body-only に修正:

```python
# ビルド出力から JS/CSS ファイル名を取得
import os, glob
dist_dir = 'portal/dist/assets'
js_file = glob.glob(f'{dist_dir}/index-*.js')[0]
css_file = glob.glob(f'{dist_dir}/index-*.css')[0]

# body-only コンテンツ
body = (
    '<div id="root"></div>'
    f'<script type="module" crossorigin src="./assets/{os.path.basename(js_file)}"></script>'
    f'<link rel="stylesheet" crossorigin href="./assets/{os.path.basename(css_file)}">'
)

# Root ページ AND Content ページの両方を更新
for page_id in [ROOT_PAGE_ID, CONTENT_PAGE_ID]:
    requests.patch(
        f'{DATAVERSE_URL}/api/data/v9.2/mspp_webpages({page_id})',
        headers=h, json={'mspp_copy': body}
    )
```

> **重要**: Root ページと Content ページの**両方**を修正すること。
> Website default language の設定によってどちらが表示されるか変わる。

### Phase 4: キャッシュクリア（リスタート）

```python
POST https://api.powerplatform.com/powerpages/environments/{envId}/websites/{siteId}/restart?api-version=2022-03-01-preview
Authorization: Bearer {token}  # scope: https://api.powerplatform.com/.default
```
pac pages upload-code-site --rootPath .
```

### Phase 4: テンプレート設定（初回のみ）

```bash
py scripts/setup_portal_template.py
```

SPA を直接レンダリングするために:

- `usewebsiteheaderandfooter` → `false`
- Web テンプレートソース → `{{ page.adx_copy }}`

### Phase 5: キャッシュクリア（リスタート）

```python
# Power Platform API で再起動
POST https://api.powerplatform.com/powerpages/environments/{envId}/websites/{siteId}/restart?api-version=2024-10-01
Authorization: Bearer {token}  # scope: https://api.powerplatform.com/.default
```

## 一括デプロイスクリプト

```bash
py scripts/deploy_portal.py                  # フル：Check + Build + Upload + Settings + Fix + Restart
py scripts/deploy_portal.py --skip-build     # Upload + Settings + Fix + Restart のみ
py scripts/deploy_portal.py --skip-settings  # Build + Upload + Fix + Restart（設定スキップ）
py scripts/deploy_portal.py --skip-restart   # Build + Upload + Settings + Fix（再起動スキップ）
py scripts/deploy_portal.py --skip-checks    # Pre-deploy check スキップ
```

### deploy_portal.py の処理フロー

```
Phase 0: Pre-Deploy Health Check
Phase 1: Verify (pac auth who + powerpages.config.json)
Phase 2: Build (npm run build)
Phase 3: Upload (pac pages upload-code-site --rootPath portal)
  ⚠️ YAML site-settings が Dataverse に復元される
  ⚠️ mspp_copy が dist/index.html 全文で上書きされる
Phase 3.5: Site Settings (YAML に含まれない追加設定を PATCH)
Phase 3.6: Fix Page Content (Root + Content の mspp_copy を body-only に修正)
Phase 4: Restart (Power Platform API で cache clear)
```

## サイト設定管理（YAML が正）

> **鉄則**: `pac pages upload-code-site` は毎回 `.powerpages-site/site-settings/*.sitesetting.yml` の値で
> Dataverse の mspp_sitesettings を上書きする。

### 設定変更手順

1. YAML ファイルの `value:` を更新
2. Dataverse API で同じ値を PATCH（即時反映用）
3. サイト再起動

### YAML ファイル形式

```yaml
# .powerpages-site/site-settings/{Name}.sitesetting.yml
id: {guid}
name: Setting/Full/Name
value: "設定値"
```

> `value` フィールドが存在しない YAML は、upload 時に Dataverse の値を null/空にリセットする。

## 初回セットアップ手順

新しい Power Pages コードサイトを一から構築する完全な手順：

```bash
# 1. サイトプロビジョニング（Power Platform API 経由）
#    → 管理画面 or scripts/manage_portal.py --action create

# 2. .js ブロック解除
py scripts/unblock_js.py

# 3. ビルド + アップロード
cd portal && npm run build && cd ..
pac pages upload-code-site --rootPath portal

# 4. テンプレート修正（SPA 直接レンダリング化）
py scripts/setup_portal_template.py

# 5. キャッシュクリア
py scripts/deploy_portal.py --skip-build
```

## 認証プロファイル

```bash
pac auth list                                    # 一覧確認
pac auth create --environment {ENVIRONMENT_URL}  # 新規作成
pac auth select --index {N}                      # 切替
pac auth who                                     # 現在の認証情報
```

## ポータル管理 API

| 操作     | エンドポイント                                     | メソッド |
| -------- | -------------------------------------------------- | -------- |
| 一覧取得 | `.../websites?api-version=2024-10-01`              | GET      |
| 作成     | `.../websites?api-version=2024-10-01`              | POST     |
| 再起動   | `.../websites/{id}/restart?api-version=2024-10-01` | POST     |
| 開始     | `.../websites/{id}/start?api-version=2024-10-01`   | POST     |
| 停止     | `.../websites/{id}/stop?api-version=2024-10-01`    | POST     |

Base: `https://api.powerplatform.com/powerpages/environments/{envId}`  
Scope: `https://api.powerplatform.com/.default`

## SPA レンダリングの仕組み

### なぜ `usewebsiteheaderandfooter: false` が必要か

Power Pages のページレンダリング:

```
usewebsiteheaderandfooter: true の場合（デフォルト）:
┌─── Power Pages Runtime HTML Shell ────────────────────────┐
│ <html><head>[Portal CSS/Meta]</head><body>                │
│   <header>[Header Web Template]</header>                  │
│   <main>[Page Template → Web Template → mspp_copy]</main> │
│   <footer>[Footer Web Template]</footer>                  │
│   [Portal JS]                                             │
│ </body></html>                                            │
└───────────────────────────────────────────────────────────┘

usewebsiteheaderandfooter: false の場合:
┌─── Raw Output ────────────────────────────────────────────┐
│ [Web Template output only]                                │
│ → {{ page.adx_copy }}                                     │
│ → mspp_copy の内容がそのまま HTTP レスポンスに              │
└───────────────────────────────────────────────────────────┘
```

`pac pages upload-code-site` は `index.html` の内容を `mspp_copy` に設定する。
`usewebsiteheaderandfooter: false` + `{{ page.adx_copy }}` で
SPA の HTML がそのままブラウザに配信される。

## トラブルシューティング

### `.js` ブロックエラー

| 症状 | Upload が 50% で停止、`PortalFileContentUploadFailed` |
| ---- | ----------------------------------------------------- |
| 原因 | `blockedattachments` に `.js` が含まれている          |
| 解決 | `py scripts/unblock_js.py`                            |

### `.html` ブロックエラー（ミスリーディング）

| 症状 | `'.html' type attachments are currently blocked`            |
| ---- | ----------------------------------------------------------- |
| 原因 | `.powerpages-site` 内のマニフェストファイルが古い           |
| 解決 | `portal/.powerpages-site/*-manifest.yml` を削除してリトライ |

> `.html` 自体はブロックされていない。マニフェストが stale なのが本当の原因。

### デプロイ後もサイトが変わらない

| 症状 | Upload 成功だが古いページが表示される                      |
| ---- | ---------------------------------------------------------- |
| 原因 | Power Pages サーバーサイドキャッシュ                       |
| 解決 | ポータル再起動: `py scripts/deploy_portal.py --skip-build` |

### デプロイ後にデフォルトテンプレートが表示される

| 症状 | React SPA ではなく Power Pages のデフォルト UI が表示                   |
| ---- | ----------------------------------------------------------------------- |
| 原因 | `usewebsiteheaderandfooter: true` でポータルの HTML shell が SPA を囲む |
| 解決 | `py scripts/setup_portal_template.py`（初回のみ）                       |

## CI/CD パイプライン（GitHub Actions）

```yaml
name: Deploy Power Pages Site

on:
  push:
    branches: [main]
    paths: ["portal/src/**"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install dependencies
        working-directory: portal
        run: npm ci
      - name: Build
        working-directory: portal
        run: npm run build
      - name: Install PAC
        run: dotnet tool install --global Microsoft.PowerApps.CLI.Tool
      - name: Authenticate
        run: |
          pac auth create \
            --applicationId ${{ secrets.CLIENT_ID }} \
            --clientSecret ${{ secrets.CLIENT_SECRET }} \
            --tenant ${{ secrets.TENANT_ID }} \
            --environment ${{ secrets.ENVIRONMENT_URL }}
      - name: Upload site
        run: pac pages upload-code-site --rootPath portal
```

3. 再ビルド & `pac pages upload-code-site` で上書き

```bash
git checkout v1.0.0
npm ci && npm run build
pac pages upload-code-site --path ./dist
```

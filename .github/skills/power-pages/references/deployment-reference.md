# Power Pages デプロイリファレンス

## pac pages コマンド一覧

### upload-code-site

コードサイトの静的ファイルを Power Pages 環境にアップロードする。

```bash
pac pages upload-code-site --path <site-directory>
```

| オプション | 説明 | 必須 |
|---|---|---|
| `--path` | `.powerpages-site` を含むサイトディレクトリのパス | Yes |

**前提条件:**
- `pac auth list` でアクティブな認証プロファイルが存在すること
- 指定パスに `.powerpages-site` ファイルが存在すること
- ビルド済み静的ファイルが配置されていること

### provision-website

新しい Power Pages Web サイトをプロビジョニング（作成）する。

```bash
pac pages provision-website --name "サイト名"
```

| オプション | 説明 | 必須 |
|---|---|---|
| `--name` | Web サイトの表示名 | Yes |

**注意:** 初回のみ実行。既存サイトに対しては `upload-code-site` で更新する。

## 認証プロファイル

### プロファイル確認

```bash
pac auth list
```

アクティブなプロファイル（`*` マーク付き）が Power Pages 環境を指していることを確認する。

### プロファイル作成

```bash
pac auth create --environment {ENVIRONMENT_ID}
```

### プロファイル切り替え

```bash
pac auth select --index {N}
```

## CI/CD パイプライン構成

### GitHub Actions 例

```yaml
name: Deploy Power Pages Site

on:
  push:
    branches: [main]
    paths:
      - 'dist/**'
      - 'src/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Install PAC
        run: npm install -g @microsoft/power-apps-cli

      - name: Authenticate
        run: pac auth create --applicationId ${{ secrets.CLIENT_ID }} --clientSecret ${{ secrets.CLIENT_SECRET }} --tenant ${{ secrets.TENANT_ID }} --environment ${{ secrets.ENVIRONMENT_ID }}

      - name: Upload site
        run: pac pages upload-code-site --path ./dist
```

### 環境変数（CI/CD 用）

| 変数 | 説明 |
|------|------|
| `CLIENT_ID` | サービスプリンシパルのアプリケーション ID |
| `CLIENT_SECRET` | クライアントシークレット |
| `TENANT_ID` | Azure AD テナント ID |
| `ENVIRONMENT_ID` | Power Platform 環境 ID |

## デプロイフロー図

```text
┌─────────────┐     ┌──────────────┐     ┌────────────────────────┐
│ npm run build│ ──→ │ pac pages    │ ──→ │ Power Pages 環境       │
│ (静的ビルド) │     │ upload-code- │     │ (サイト更新・公開)     │
│             │     │ site         │     │                        │
└─────────────┘     └──────────────┘     └────────────────────────┘
                           ↑
                    pac auth (認証済み)
```

## テーブル権限とサイト設定

### テーブル権限のデプロイ

テーブル権限は Dataverse のレコードとして管理される。`dataverse` スキルで作成する。

| 設定項目 | 説明 |
|----------|------|
| テーブル名 | 権限を付与する Dataverse テーブル |
| アクセスの種類 | グローバル / コンタクト / アカウント / セルフ |
| 権限 | 読み取り / 書き込み / 作成 / 削除 / 追加 / 追加先 |
| Web ロール | この権限を付与する Web ロール |

### サイト設定のデプロイ

サイト設定は `adx_sitesetting` テーブルのレコードとして管理される。

```python
# サイト設定の作成例（dataverse スキルの auth_helper.py 使用）
from auth_helper import api_post

api_post("adx_sitesettings", {
    "adx_name": "Authentication/Registration/Enabled",
    "adx_value": "true",
    "adx_websiteid@odata.bind": "/adx_websites({website_id})"
})
```

## ロールバック手順

1. 前バージョンのビルド成果物を保持しておく（Git タグ推奨）
2. 前バージョンのタグをチェックアウト
3. 再ビルド & `pac pages upload-code-site` で上書き

```bash
git checkout v1.0.0
npm ci && npm run build
pac pages upload-code-site --path ./dist
```

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
POWERPAGES_SITE_PATH=./site           # .powerpages-site を含むディレクトリ
POWERPAGES_WEBSITE_NAME=              # 任意: プロビジョニング時のサイト名
```

### .powerpages-site アーティファクト

プロジェクトルート（または `POWERPAGES_SITE_PATH`）に `.powerpages-site` ファイルが存在する必要がある。
これは `pac pages` コマンドがサイトを識別するためのマーカーファイル。

```text
project-root/
├── .powerpages-site         # サイト識別マーカー
├── site/                    # SPA ビルド出力
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
pac pages upload-code-site --path ./site
```

### Step 5: サイトプロビジョニング（初回のみ）

```bash
pac pages provision-website --name "サイト名"
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

## 関連スキル

| スキル | 関係 |
|--------|------|
| `architecture` | アーキテクチャ判断後にこのスキルへ |
| `dataverse` | テーブル権限・サイト設定のデプロイ |
| `standard` | 共通認証（auth_helper.py）・.env パラメータ |
| `code-apps` | 内部ユーザー向け UI は Code Apps、外部ユーザー向けは Power Pages |
| `model-driven-app` | 管理画面はモデル駆動型、外部公開は Power Pages |

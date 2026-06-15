# geek-helpdesk — ヘルプデスクポータル

サポートチケット管理・ナレッジベース・レポートを一元化した Code Apps サンプル実装。
ナレッジベースとレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（未対応・対応中・解決済み（今月）・緊急チケット）+ ステータス別棒グラフ + 優先度別円グラフ + 最近のチケット |
| チケット | `/tickets` | チケットの一覧・登録・編集・削除。ステータス・優先度・カテゴリフィルター付き |
| ナレッジベース | `/knowledge` | FAQ・ナレッジ記事の一覧・登録・編集・削除（`VITE_FEATURE_KNOWLEDGE=true` 時） |
| レポート | `/reports` | ステータス別・優先度別・カテゴリ別チケット統計（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_ticket`）

### カスタムテーブル（`pac code add-data-source` で追加）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_ticket` | サポートチケット（件名・説明・申請者・担当者・カテゴリ・優先度・ステータス・期限・解決日） |
| `{prefix}_knowledge` | ナレッジ記事（タイトル・内容・カテゴリ・作成者・ステータス・タグ）（`VITE_FEATURE_KNOWLEDGE=true` 時） |

### システムテーブル（プレフィックス不要）

| テーブル論理名 | 用途 |
|---|---|
| `systemuser` | ログインユーザー ID 解決 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_KNOWLEDGE=true`（.env） | ナレッジベースページを有効化 |
| `VITE_FEATURE_REPORTS=true`（.env） | レポートページを有効化 |
| `src/index.css` の CSS 変数 | カラーテーマを変更 |

### プレフィックス変更時の作業

`PUBLISHER_PREFIX` を変更する場合（例: `geek` → `myco`）:

1. `.env` の `PUBLISHER_PREFIX` と `VITE_PUBLISHER_PREFIX` を同じ値に設定
2. サービス層・ページ層はプレフィックスを動的構築済みのため変更不要

## セットアップ手順

### 1. 環境変数の設定

```bash
# 共通 .env.example（standard/references）を .env にコピー（共通変数を入力）
cp ../../../standard/references/.env.example .env
# このサンプル固有の変数を .env に追記（.env.example 参照）
```

### 2. Dataverse テーブルの作成

```bash
python scripts/setup_dataverse.py
```

### 3. データソースの追加

```bash
python scripts/toggle_table_lang.py en

pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_ticket
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_knowledge

python scripts/toggle_table_lang.py jp
```

### 4. アプリ初期化・開発・デプロイ

```bash
pac code init -env ${ENV_ID} -n "ヘルプデスクポータル"
npm install
npm run dev      # ローカル開発
npm run deploy   # ビルド + pac code push
```

## 機能フラグ詳細

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_KNOWLEDGE` | `false` | ナレッジベースページがナビに表示される（FAQ・技術記事の管理） |
| `VITE_FEATURE_REPORTS` | `false` | レポートページがナビに表示される（ステータス・優先度・カテゴリ別統計） |

## このサンプルに含まれないもの

| ファイル | 理由 |
|---|---|
| `.power/` | `pac code init` が生成する |
| `src/generated/` | `pac code add-data-source` が生成する |
| `power.config.json` | `pac code init` が環境ごとに生成する |
| `.env` | 環境固有。`.env.example` を参照 |
| `node_modules/` | `npm install` で復元 |

## ファイル構成

```
src/
├── config.ts                    ← アプリ名・ナビ構成・機能フラグ（カスタマイズ起点）
├── types/
│   └── dataverse.ts             ← チケット・ナレッジ型定義
├── services/
│   └── dataverse-service.ts     ← Dataverse CRUD（プレフィックス動的）
├── hooks/
│   └── use-dataverse.ts         ← TanStack Query フック群
└── pages/
    ├── dashboard.tsx             ← KPI・グラフ・最近のチケット
    ├── tickets.tsx               ← チケット CRUD
    ├── knowledge.tsx             ← ナレッジベース CRUD（VITE_FEATURE_KNOWLEDGE）
    └── reports.tsx               ← 統計レポート（VITE_FEATURE_REPORTS）
```

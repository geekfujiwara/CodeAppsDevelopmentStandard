# geek-pm — プロジェクト管理ポータル

プロジェクト台帳・タスク管理・メンバー管理・レポートを一元化した Code Apps サンプル実装。
メンバー管理とレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（進行中プロジェクト・完了タスク・遅延タスク・今週締切）+ ステータス別棒グラフ + 優先度別円グラフ + 最近のタスク |
| プロジェクト | `/projects` | プロジェクトの一覧・登録・編集・削除。ステータス・優先度フィルター付き |
| タスク | `/tasks` | タスクの一覧・登録・編集・削除。プロジェクト・ステータス・優先度フィルター + 進捗バー表示 |
| メンバー | `/members` | プロジェクトメンバーの管理（`VITE_FEATURE_MEMBERS=true` 時） |
| レポート | `/reports` | プロジェクト完了率・ステータス別タスク数・担当者別一覧（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_project`）

### カスタムテーブル（`pac code add-data-source` で追加）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_project` | プロジェクト台帳（プロジェクト名・説明・開始日・終了日・ステータス・優先度・オーナー・部門） |
| `{prefix}_task` | タスク管理（タスク名・プロジェクトルックアップ・担当者・開始日・期限・完了日・ステータス・優先度・進捗率） |
| `{prefix}_member` | プロジェクトメンバー（メンバー名・プロジェクトルックアップ・役割・メール・参加日）（`VITE_FEATURE_MEMBERS=true` 時） |

### システムテーブル（プレフィックス不要）

| テーブル論理名 | 用途 |
|---|---|
| `systemuser` | ログインユーザー ID 解決 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_MEMBERS=true`（.env） | メンバー管理ページを有効化 |
| `VITE_FEATURE_REPORTS=true`（.env） | レポートページを有効化 |
| `src/index.css` の CSS 変数 | カラーテーマを変更 |

### プレフィックス変更時の作業

`PUBLISHER_PREFIX` を変更する場合（例: `geek` → `myco`）:

1. `.env` の `PUBLISHER_PREFIX` と `VITE_PUBLISHER_PREFIX` を同じ値に設定
2. サービス層・ページ層はプレフィックスを動的構築済みのため変更不要

## セットアップ手順

### 1. 環境変数の設定

```bash
# ルート .env.example を .env にコピー（共通変数を入力）
cp ../../.env.example .env
# このサンプル固有の変数を .env に追記（.env.example 参照）
```

### 2. Dataverse テーブルの作成

```bash
python scripts/setup_dataverse.py
```

### 3. データソースの追加

```bash
python scripts/toggle_table_lang.py en

pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_project
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_task
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_member

python scripts/toggle_table_lang.py jp
```

### 4. アプリ初期化・開発・デプロイ

```bash
pac code init -env ${ENV_ID} -n "プロジェクト管理ポータル"
npm install
npm run dev      # ローカル開発
npm run deploy   # ビルド + pac code push
```

## 機能フラグ詳細

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_MEMBERS` | `false` | メンバー管理ページがナビに表示される（プロジェクトメンバーの登録・管理） |
| `VITE_FEATURE_REPORTS` | `false` | レポートページがナビに表示される（プロジェクト完了率・タスク統計） |

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
│   └── dataverse.ts             ← プロジェクト・タスク・メンバー型定義
├── services/
│   └── dataverse-service.ts     ← Dataverse CRUD（プレフィックス動的）
├── hooks/
│   └── use-dataverse.ts         ← TanStack Query フック群
└── pages/
    ├── dashboard.tsx             ← KPI・グラフ・最近のタスク
    ├── projects.tsx              ← プロジェクト台帳 CRUD
    ├── tasks.tsx                 ← タスク管理 CRUD
    ├── members.tsx               ← メンバー管理（VITE_FEATURE_MEMBERS）
    └── reports.tsx               ← レポート・集計（VITE_FEATURE_REPORTS）
```

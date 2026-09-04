# geek-hr — 人事管理ポータル

社員台帳・組織図・採用管理・評価管理を一元化した Code Apps サンプル実装。
採用管理と評価管理は機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（在籍人数・今月入社・採用中ポジション・評価件数）+ 部門別人数グラフ + 雇用形態別円グラフ + 最近の入社一覧 |
| 社員台帳 | `/employees` | 社員の一覧・登録・編集・削除。在籍状況・雇用形態フィルター付き |
| 組織図 | `/organization` | 在籍中の社員を部門別カードで表示（読み取り専用） |
| 採用管理 | `/recruitment` | 採用ポジション + 候補者の管理（`VITE_FEATURE_RECRUITMENT=true` 時） |
| 評価管理 | `/evaluations` | 社員の期末評価記録（スター評価）（`VITE_FEATURE_EVALUATION=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_employee`）

### カスタムテーブル（`npx pa app add data-source` で追加）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_employee` | 社員台帳（氏名・部門・役職・雇用形態・入社日・在籍状況） |
| `{prefix}_recruitment` | 採用ポジション（`VITE_FEATURE_RECRUITMENT=true` 時） |
| `{prefix}_candidate` | 採用候補者、`{prefix}_recruitment` へのルックアップ付き |
| `{prefix}_evaluation` | 社員評価記録、`{prefix}_employee` へのルックアップ付き（`VITE_FEATURE_EVALUATION=true` 時） |

### システムテーブル（プレフィックス不要）

| テーブル論理名 | 用途 |
|---|---|
| `systemuser` | ログインユーザー ID 解決 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_RECRUITMENT=true`（.env） | 採用管理ページを有効化 |
| `VITE_FEATURE_EVALUATION=true`（.env） | 評価管理ページを有効化 |
| `src/index.css` の CSS 変数 | カラーテーマを変更 |

### プレフィックス変更時の作業

`PUBLISHER_PREFIX` を変更する場合（例: `geek` → `myco`）:

1. `.env` の `PUBLISHER_PREFIX` と `VITE_PUBLISHER_PREFIX` を同じ値に設定
2. `src/types/dataverse.ts` のフィールド名コメントを更新（実際のフィールドはサービス層で動的構築済み）
3. サービス層・ページ層はプレフィックスを動的構築済みのため変更不要

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

npm install --no-audit --no-fund
npx pa auth status
npx pa auth switch --account {UPN}
npx pa app init --environment-id ${ENV_ID} --display-name "人事管理ポータル"
npx pa app add data-source --connector shared_commondataserviceforapps \
  --connection-ref ${CONNECTION_REFERENCE_LOGICAL_NAME} \
  --solution-id ${SOLUTION_ID} \
  --org-url ${DATAVERSE_URL} \
  --non-interactive

python scripts/toggle_table_lang.py jp
```

### 4. 開発・デプロイ

```bash
npm run dev      # ローカル開発
npm run deploy -- --solution-id ${SOLUTION_ID}   # 初回: ビルド + pa app push
```

## 機能フラグ詳細

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_RECRUITMENT` | `false` | 採用管理ページがナビに表示される（採用ポジション・候補者管理） |
| `VITE_FEATURE_EVALUATION` | `false` | 評価管理ページがナビに表示される（社員評価のスター評価記録） |

## このサンプルに含まれないもの

| ファイル | 理由 |
|---|---|
| `.power/` | `npx pa app init` が生成する |
| `src/generated/` | `npx pa app add data-source` が生成する |
| `power.config.json` | `npx pa app init` が環境ごとに生成する |
| `.env` | 環境固有。`.env.example` を参照 |
| `node_modules/` | `npm install` で復元 |

## ファイル構成

```
src/
├── config.ts                    ← アプリ名・ナビ構成・機能フラグ（カスタマイズ起点）
├── types/
│   └── dataverse.ts             ← 社員・採用・候補者・評価型定義
├── services/
│   └── dataverse-service.ts     ← Dataverse CRUD（プレフィックス動的）
├── hooks/
│   └── use-dataverse.ts         ← TanStack Query フック群
└── pages/
    ├── dashboard.tsx             ← KPI・グラフ・最近の入社
    ├── employees.tsx             ← 社員台帳 CRUD
    ├── organization.tsx          ← 部門別組織図（読み取り専用）
    ├── recruitment.tsx           ← 採用管理（VITE_FEATURE_RECRUITMENT）
    └── evaluations.tsx           ← 評価管理（VITE_FEATURE_EVALUATION）
```

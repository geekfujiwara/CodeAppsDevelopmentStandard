# geek-asset — 資産管理ポータル

IT機器・備品の台帳管理・貸出管理・廃棄申請・棚卸を一元化した Code Apps サンプル実装。
廃棄管理と棚卸は機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（総資産数・貸出中・延滞返却・廃棄申請中）+ カテゴリ別資産数グラフ + ステータス別円グラフ + 最近登録された資産 |
| 資産台帳 | `/assets` | 資産の一覧・登録・編集・削除。カテゴリ・ステータスフィルター付き |
| 貸出管理 | `/loans` | 貸出記録の管理・返却処理（延滞バッジ付き） |
| 廃棄管理 | `/disposal` | 廃棄申請の作成・承認・廃棄完了ワークフロー（`VITE_FEATURE_DISPOSAL=true` 時） |
| 棚卸 | `/inventory` | 棚卸記録の作成・管理（確認済み/不明/紛失）（`VITE_FEATURE_INVENTORY=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_asset`）

### カスタムテーブル（`pac code add-data-source` で追加）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_asset` | 資産台帳（資産名・資産番号・カテゴリ・ステータス・場所・部門・購入日・購入価格） |
| `{prefix}_loan` | 貸出記録（資産名・借用者・貸出日・返却期限・返却日・ステータス） |
| `{prefix}_disposal` | 廃棄申請（資産名・廃棄日・理由・ステータス）（`VITE_FEATURE_DISPOSAL=true` 時） |
| `{prefix}_inventory_check` | 棚卸記録（資産名・棚卸日・結果・確認者）（`VITE_FEATURE_INVENTORY=true` 時） |

### システムテーブル（プレフィックス不要）

| テーブル論理名 | 用途 |
|---|---|
| `systemuser` | ログインユーザー ID 解決 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_DISPOSAL=true`（.env） | 廃棄管理ページを有効化 |
| `VITE_FEATURE_INVENTORY=true`（.env） | 棚卸ページを有効化 |
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

pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_asset
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_loan
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_disposal
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_inventory_check

python scripts/toggle_table_lang.py jp
```

### 4. アプリ初期化・開発・デプロイ

```bash
pac code init -env ${ENV_ID} -n "資産管理ポータル"
npm install
npm run dev      # ローカル開発
npm run deploy   # ビルド + pac code push
```

## 機能フラグ詳細

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_DISPOSAL` | `false` | 廃棄管理ページがナビに表示される（廃棄申請・承認・完了ワークフロー） |
| `VITE_FEATURE_INVENTORY` | `false` | 棚卸ページがナビに表示される（資産棚卸記録・結果管理） |

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
│   └── dataverse.ts             ← 資産・貸出・廃棄・棚卸型定義
├── services/
│   └── dataverse-service.ts     ← Dataverse CRUD（プレフィックス動的）
├── hooks/
│   └── use-dataverse.ts         ← TanStack Query フック群
└── pages/
    ├── dashboard.tsx             ← KPI・グラフ・最近の資産
    ├── assets.tsx                ← 資産台帳 CRUD
    ├── loans.tsx                 ← 貸出管理・返却処理
    ├── disposal.tsx              ← 廃棄申請ワークフロー（VITE_FEATURE_DISPOSAL）
    └── inventory.tsx             ← 棚卸記録管理（VITE_FEATURE_INVENTORY）
```

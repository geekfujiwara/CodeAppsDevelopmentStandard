# geek-inventory — 在庫管理ポータル

商品マスタ・入出庫管理・発注管理・レポートを一元化した Code Apps サンプル実装。
発注管理とレポートは機能フラグで段階的に有効化できます。
入出庫登録時に商品の現在庫数を自動更新します。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（商品数・在庫切れ・在庫少・今月入庫数）+ カテゴリ別在庫棒グラフ + カテゴリ別商品数円グラフ + 在庫アラートテーブル |
| 商品マスタ | `/products` | 商品の一覧・登録・編集・削除。商品名・商品コード・カテゴリ検索付き |
| 入出庫管理 | `/stock-movements` | 入庫・出庫・棚卸調整の一覧・登録・編集・削除。登録時に現在庫数を自動更新 |
| 発注管理 | `/orders` | 発注の一覧・登録・編集・削除（`VITE_FEATURE_ORDERS=true` 時） |
| レポート | `/reports` | 在庫状況サマリー・月別入出庫数・商品別入出庫履歴（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_product`）

### カスタムテーブル（`pac code add-data-source` で追加）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_product` | 商品マスタ（商品名・商品コード・カテゴリ・単位・単価・現在庫数・最低在庫数・備考） |
| `{prefix}_stock_movement` | 入出庫記録（件名・商品ルックアップ・区分・数量・日付・理由・備考） |
| `{prefix}_order` | 発注管理（件名・商品ルックアップ・仕入先・発注数量・発注日・入荷予定日・ステータス・備考）（`VITE_FEATURE_ORDERS=true` 時） |

### テーブル間の関連

| 関連 | 説明 |
|---|---|
| `{prefix}_stock_movement.{prefix}_product_id` → `{prefix}_product` | 入出庫記録から商品へのルックアップ |
| `{prefix}_order.{prefix}_product_id` → `{prefix}_product` | 発注から商品へのルックアップ |

### システムテーブル（プレフィックス不要）

| テーブル論理名 | 用途 |
|---|---|
| `systemuser` | ログインユーザー ID 解決 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_ORDERS=true`（.env） | 発注管理ページを有効化 |
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

pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_product
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_stock_movement
# VITE_FEATURE_ORDERS=true の場合のみ
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_order

python scripts/toggle_table_lang.py jp
```

### 4. アプリ初期化・開発・デプロイ

```bash
pac code init -env ${ENV_ID} -n "在庫管理ポータル"
npm install
npm run dev      # ローカル開発
npm run deploy   # ビルド + pac code push
```

## 機能フラグ詳細

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_ORDERS` | `false` | 発注管理ページがナビに表示される（発注の一覧・登録・編集・削除） |
| `VITE_FEATURE_REPORTS` | `false` | レポートページがナビに表示される（在庫状況サマリー・月別入出庫数・商品別履歴） |

## 在庫数の自動更新について

入出庫記録を**新規登録**すると、選択した商品の現在庫数が自動更新されます：

| 区分 | 更新ルール |
|---|---|
| 入庫 | 現在庫数 + 数量 |
| 出庫 | 現在庫数 - 数量（0 以下にならない） |
| 棚卸調整 | 数量で直接上書き |

> **注意**: 編集・削除時は在庫数の自動更新を行いません。手動で商品マスタの現在庫数を更新してください。

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
│   └── dataverse.ts             ← MovementType・OrderStatus 型定義
├── services/
│   └── dataverse-service.ts     ← Dataverse CRUD（プレフィックス動的）
├── hooks/
│   └── use-dataverse.ts         ← TanStack Query フック群
└── pages/
    ├── dashboard.tsx             ← KPI・グラフ・在庫アラート
    ├── products.tsx              ← 商品マスタ CRUD
    ├── stock-movements.tsx       ← 入出庫管理 CRUD（在庫数自動更新）
    ├── orders.tsx                ← 発注管理 CRUD（VITE_FEATURE_ORDERS）
    └── reports.tsx               ← 統計レポート（VITE_FEATURE_REPORTS）
```

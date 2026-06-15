# geek-sales — 営業支援ポータル

顧客管理・商談管理・パイプライン・テリトリー管理と Copilot Analytics を一体化した
Code Apps サンプル実装。Power Automate AI フロー連携と Copilot Studio 分析ダッシュボードを
機能フラグで段階的に有効化できます。

> **新規テーマの雛形には使わない。**
> 新しいテーマは `.github/` を取得後、**@GeekPowerCode** に scaffold を依頼すること。

---

## 含まれる機能

### 営業管理

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | テンプレート起動確認画面（カスタマイズの出発点） |
| 顧客 | `/customers` | 顧客台帳の一覧・作成・編集・削除 |
| 顧客詳細 | `/customers/:id` | 顧客に紐づく商談・活動履歴の詳細表示 |
| 商談 | `/opportunities` | 商談の一覧・作成・編集・AI インサイト表示 |
| 商談詳細 | `/opportunities/:id` | 商談詳細・ステージ進捗バー |
| パイプライン | `/pipeline` | ステージ別カンバンビュー |
| テリトリー | `/territory` | 担当エリア別集計・ニュース生成（`VITE_FEATURE_AI_FLOW=true` 時） |
| 活動履歴 | `/activities` | 訪問・電話・メール等の活動ログ |

### Copilot Analytics（`VITE_FEATURE_COPILOT=true` 時にナビに表示）

| ページ | パス | 説明 |
|---|---|---|
| Copilot ダッシュボード | `/copilot-dashboard` | 会話数・解決率・アウトカム分布グラフ |
| 会話 | `/conversations` | エージェント会話の一覧・チャット履歴閲覧 |
| エージェント管理 | `/agent-management` | Copilot Studio エージェント一覧・ステータス |

---

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_customer`）

### カスタムテーブル（`pac code add-data-source` で追加）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_customer` | 顧客台帳 |
| `{prefix}_opportunity` | 商談 |
| `{prefix}_activity` | 活動履歴 |
| `{prefix}_territory` | テリトリー |
| `{prefix}_newsinsight` | テリトリーニュース（AI 生成） |
| `{prefix}_incident` | インシデント（`dataSourcesInfo.ts` に手動追加） |
| `{prefix}_conversationsummary` | Copilot 会話サマリー（`VITE_FEATURE_COPILOT=true` 時） |

### システムテーブル（プレフィックス不要）

| テーブル論理名 | 用途 |
|---|---|
| `systemuser` | ログインユーザー ID 解決 |
| `bot` | Copilot Studio エージェント一覧 |
| `conversationtranscript` | 会話トランスクリプト本文 |

---

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_COPILOT=true`（.env） | Copilot Analytics ページを有効化 |
| `VITE_FEATURE_AI_FLOW=true`（.env） | AI フロー連携を有効化 |
| `styles/index.pcss` | カラーテーマを変更（design-templates.md 参照） |

### プレフィックス変更時の作業

`PUBLISHER_PREFIX` を変更する場合（例: `geek` → `myco`）:

1. `.env` の `PUBLISHER_PREFIX` と `VITE_PUBLISHER_PREFIX` を同じ値に設定
2. `src/types/` のフィールド名を一括置換（`geek_` → `myco_`）
3. サービス層・ページ層はプレフィックスを動的構築済みのため変更不要

---

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

pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_customer
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_opportunity
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_activity
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_territory
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_newsinsight

# Copilot Analytics 利用時のみ
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_conversationsummary

python scripts/toggle_table_lang.py jp
```

### 4. アプリ初期化・開発・デプロイ

```bash
pac code init -env ${ENV_ID} -n "営業支援ポータル"
npm install
npm run dev      # ローカル開発
npm run deploy   # ビルド + pac code push
```

---

## 機能フラグ詳細

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_COPILOT` | `false` | Copilot Analytics ページがナビに表示される（BOT_ID 設定必須） |
| `VITE_FEATURE_AI_FLOW` | `false` | メール下書き生成・アポイント提案・テリトリーニュース生成が有効になる（Power Automate フロー設定必須） |

---

## このサンプルに含まれないもの

| ファイル | 理由 |
|---|---|
| `.power/` | `pac code init` が生成する。手で作成しない |
| `src/generated/` | `pac code add-data-source` が生成する |
| `power.config.json` | `pac code init` が環境ごとに生成する |
| `.env` | 環境固有。`.env.example` を参照 |
| `node_modules/` | `npm install` で復元 |

---

## ファイル構成

```
src/
├── config.ts                         ← アプリ名・ナビ構成・機能フラグ（カスタマイズ起点）
├── types/
│   ├── dataverse.ts                  ← 顧客・商談・活動・テリトリー型定義
│   ├── incident.ts                   ← インシデント型定義
│   └── copilot-analytics.ts          ← 会話サマリー型定義
├── services/
│   ├── dataverse-service.ts          ← Dataverse CRUD（プレフィックス動的）
│   ├── ai-flow-service.ts            ← Power Automate AI フロー呼び出し
│   └── copilot-analytics-service.ts  ← Copilot Analytics データ取得
├── hooks/
│   ├── use-dataverse.ts              ← TanStack Query フック群
│   └── use-copilot-analytics.ts      ← Copilot Analytics フック
└── pages/                            ← 各業務画面（営業・Copilot Analytics）
```

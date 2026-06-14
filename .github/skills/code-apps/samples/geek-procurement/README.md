# geek-procurement — 購買依頼管理ポータル

購買依頼の申請・承認・発注追跡・仕入先管理を一元化した Code Apps サンプル実装。
仕入先管理とレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（申請中・承認済み・今月購買合計・緊急依頼）+ カテゴリ別棒グラフ + ステータス別円グラフ + 最近の依頼 |
| 購買依頼 | `/requests` | 依頼の一覧・登録・編集・削除。ステータス・優先度フィルター付き。合計金額自動計算 |
| 仕入先管理 | `/vendors` | 仕入先マスタ・評価管理（`VITE_FEATURE_VENDORS=true` 時） |
| レポート | `/reports` | ステータス別サマリー・カテゴリ別購買金額・部門別集計（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_purchase_request` | 購買依頼（件名・カテゴリ・依頼者・部門・品目名・数量・単価・合計金額・仕入先・優先度・ステータス・希望納期） |
| `{prefix}_vendor` | 仕入先マスタ（仕入先名・業種・担当者・メール・電話・評価）（`VITE_FEATURE_VENDORS=true` 時） |

## ステータスフロー

`下書き` → `申請中` → `承認済み` → `発注済み` → `受領完了`（または `却下`）

## セットアップ手順

```bash
cp ../../.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_purchase_request
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_vendor
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "購買依頼管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_VENDORS` | `false` | 仕入先管理ページを有効化（評価★1〜★5） |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

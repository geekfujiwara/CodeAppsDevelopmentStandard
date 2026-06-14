# geek-contract — 契約台帳管理ポータル

締結済み契約の台帳管理・期限アラート・取引先管理を一元化した Code Apps サンプル実装。
取引先管理とレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（有効契約数・今月期限・3ヶ月以内期限・自動更新あり）+ 種別棒グラフ + ステータス円グラフ + 期限アラート一覧 |
| 契約台帳 | `/contracts` | 契約の一覧・登録・編集・削除。ステータス・種別フィルター付き |
| 取引先管理 | `/counterparties` | 取引先マスタの管理（`VITE_FEATURE_COUNTERPARTIES=true` 時） |
| レポート | `/reports` | 種別別サマリー・ステータス別件数・今後12ヶ月期限一覧（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_contract` | 契約台帳（件名・契約番号・取引先・種別・開始日・終了日・自動更新・ステータス・金額） |
| `{prefix}_counterparty` | 取引先マスタ（取引先名・会社種別・担当者・メール・電話）（`VITE_FEATURE_COUNTERPARTIES=true` 時） |

## セットアップ手順

```bash
cp ../../.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_contract
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_counterparty
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "契約台帳管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_COUNTERPARTIES` | `false` | 取引先管理ページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

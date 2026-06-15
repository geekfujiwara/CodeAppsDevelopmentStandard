# geek-maintenance — 設備保全管理ポータル

設備マスタ・作業指示・点検スケジュール・レポートを一元化した Code Apps サンプル実装。
点検スケジュールとレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（稼働中設備・修理中・未完了作業・今週予定）+ 作業種別棒グラフ + 設備ステータス円グラフ + 最近の作業指示 |
| 設備マスタ | `/equipment` | 設備の一覧・登録・編集・削除。ステータスフィルター付き |
| 作業指示 | `/work-orders` | 作業指示の一覧・登録・編集・削除。種別・ステータス・優先度フィルター付き |
| 点検スケジュール | `/schedules` | 定期点検スケジュールの管理（`VITE_FEATURE_SCHEDULE=true` 時） |
| レポート | `/reports` | 設備別作業履歴・月別作業件数・カテゴリ別設備状況（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_equipment` | 設備マスタ（設備名・コード・カテゴリ・場所・メーカー・モデル・設置日・ステータス） |
| `{prefix}_work_order` | 作業指示（件名・設備ルックアップ・作業種別・優先度・ステータス・担当者・予定日・完了日・作業内容） |
| `{prefix}_schedule` | 点検スケジュール（件名・設備ルックアップ・点検種別・周期・次回点検日）（`VITE_FEATURE_SCHEDULE=true` 時） |

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_equipment
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_work_order
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_schedule
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "設備保全管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_SCHEDULE` | `false` | 点検スケジュール管理ページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

# geek-training — 研修管理ポータル

研修カタログの管理・受講申込・修了追跡を一元化した Code Apps サンプル実装。
コースの募集状況を矢羽（Stage Path）と定員プログレスバーで可視化し、修了率・満足度を集計します。
受講記録の横断管理とレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（募集中コース・今月の申込・修了者数・修了率）+ 分野別コース数グラフ + 受講ステータス円グラフ + 開催予定コース |
| 研修コース | `/courses` | コースの一覧・登録・編集・削除。ステータス・形式フィルター付き。行クリックで詳細へ |
| コース詳細 | `/courses/:id` | サマリーヘッダー（定員プログレスバー付き）+ ステータス矢羽 + 受講者の追加/修了/満足度記録 |
| 受講記録 | `/enrollments` | 全コースの受講記録を横断表示。ワンクリック修了（`VITE_FEATURE_ENROLLMENTS=true` 時） |
| レポート | `/reports` | 分野別修了率・部門別受講数・月別申込数・コース別満足度（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_course`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_course` | 研修コース（コース名・分野・講師・形式・ステータス・開催日・時間・定員・概要） |
| `{prefix}_enrollment` | 受講記録（受講者名・コースID・部門・ステータス・申込日・修了日・満足度★1〜5）。コース 1 件に複数の受講記録が紐づく |

## ステータスと受講フロー

- コースステータス: `募集中` → `満席` → `終了`（詳細画面の矢羽クリックで変更）
- 受講ステータス: `申込` → `受講中` → `修了`（または `キャンセル`）。「修了」ボタンで修了日を自動記録
- 定員に対する申込数（キャンセル除く）をプログレスバーで表示

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_course
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_enrollment
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "研修管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_ENROLLMENTS` | `false` | 受講記録の横断管理ページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/types/dataverse.ts` の `COURSE_FORMAT_*` | 研修形式の追加・変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

# geek-event — イベント管理ポータル

社内イベント・セミナーの企画・参加登録・出欠管理を一元化した Code Apps サンプル実装。
**月間カレンダー**でイベントを俯瞰し、空いている日のクリックからそのまま新規作成できます。
参加者 CSV 出力とレポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| 月間カレンダー（date-fns のみ・イベントチップ・空セルクリックで新規作成） | [calendar-pattern.md](../../references/calendar-pattern.md) |
| CSV エクスポート（UTF-8 BOM・OptionSet ラベル変換） | [csv-export-pattern.md](../../references/csv-export-pattern.md) |
| ステージ矢羽（中止を negativeValue で赤表示） | [stage-path-pattern.md](../../references/stage-path-pattern.md) |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（開催予定・今月の開催・参加登録・出席率）+ 分野別棒グラフ + 登録ステータス円グラフ + 開催予定イベント |
| カレンダー | `/calendar` | 月間グリッドでイベントを俯瞰（ステータス色チップ・凡例付き）。イベントクリックで詳細へ、空セルクリックでその日付を初期値に新規作成 |
| イベント | `/events` | イベントの一覧・登録・編集・削除。ステータスフィルター付き。行クリックで詳細へ |
| イベント詳細 | `/events/:id` | サマリーヘッダー（定員プログレスバー付き）+ ステータス矢羽 + 参加者の登録/出席記録 + 参加者 CSV 出力（`VITE_FEATURE_CSV_EXPORT=true` 時） |
| レポート | `/reports` | 分野別サマリー・月別開催数・イベント別出席率（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_event`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_event` | イベント（イベント名・分野・会場・主催者・ステータス・開催日・定員・概要） |
| `{prefix}_registration` | 参加登録（参加者名・イベントID・部門・ステータス・登録日）。イベント 1 件に複数の登録が紐づく |

## ステータスと参加フロー

- イベントステータス: `募集中` → `満席` → `終了`（`中止` は矢羽の negativeValue として赤表示）
- 参加ステータス: `登録` → `出席` / `欠席`（または `キャンセル`）。「出席」ボタンでワンクリック記録
- 定員に対する登録数（キャンセル除く）をプログレスバーで表示

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_event
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_registration
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "イベント管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_CSV_EXPORT` | `false` | イベント詳細に「参加者 CSV 出力」ボタンを表示（Excel 日本語対応） |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/components/month-calendar.tsx` の `MAX_CHIPS_PER_DAY` | カレンダー 1 日あたりの表示チップ数を変更 |
| `src/types/dataverse.ts` の `EVENT_STATUS_*` | ステータス区分の追加・変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

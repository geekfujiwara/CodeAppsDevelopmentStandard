# geek-quote — 見積・請求管理ポータル

見積の作成・明細管理・受注追跡と請求管理を一元化した Code Apps サンプル実装。
明細行から小計・消費税・合計を自動計算し、帳票風の見積書プレビューを備えます。
請求管理とレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（進行中見積・今月の受注金額・受注率・期限間近）+ 月別見積金額グラフ + ステータス円グラフ + 直近の見積 |
| 見積 | `/quotes` | 見積の一覧・登録・編集・削除。ステータスフィルター付き。行クリックで詳細へ |
| 見積詳細 | `/quotes/:id` | サマリーヘッダー + ステータス矢羽（クリックで変更可）+ 明細行の追加/編集/削除（金額自動計算）+ 見積書プレビュー |
| 請求 | `/invoices` | 請求の一覧・登録・編集・削除。支払期限超過バッジ付き（`VITE_FEATURE_INVOICES=true` 時） |
| レポート | `/reports` | ステータス別サマリー・取引先別受注金額・月別受注率（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_quote`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_quote` | 見積（件名・見積番号・取引先・ステータス・発行日・有効期限・小計・消費税・合計・備考） |
| `{prefix}_quote_line` | 見積明細（品目名・見積ID・数量・単価・金額）。見積 1 件に複数の明細が紐づく |
| `{prefix}_invoice` | 請求（件名・請求番号・取引先・見積ID・ステータス・発行日・支払期限・請求金額）（`VITE_FEATURE_INVOICES=true` 時） |

## 金額の自動計算

- 明細行の金額 = 数量 × 単価（明細保存時に計算）
- 見積の小計 = 明細金額の合計、消費税 = 小計 × 10%（`src/config.ts` の `TAX_RATE`）、合計 = 小計 + 消費税
- 明細の追加・編集・削除のたびに見積レコードへ小計・消費税・合計を patch して同期

## 見積 → 請求のフロー

`下書き` → `送付済み` → `受注`（または `失注`）

- 詳細画面の矢羽クリックでステータスを変更
- `受注` かつ `VITE_FEATURE_INVOICES=true` のとき「請求を作成」ボタンが表示され、見積の内容から請求レコード（支払期限: 30日後）を生成

## 見積書プレビューと PDF メール送信

詳細画面の「見積書プレビュー」で帳票風レイアウト（宛先・見積金額・明細・小計/消費税/合計・備考）を確認できます。
PDF 化してメール送信する場合は Power Automate 連携の [mail-pdf パターン](../../references/mail-pdf.md) を組み合わせてください。

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_quote
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_quote_line
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_invoice
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "見積・請求管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_INVOICES` | `false` | 請求管理ページと「請求を作成」ボタンを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更（見積書プレビューの発行元表示にも使用） |
| `src/config.ts` の `TAX_RATE` | 消費税率を変更（デフォルト 10%） |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

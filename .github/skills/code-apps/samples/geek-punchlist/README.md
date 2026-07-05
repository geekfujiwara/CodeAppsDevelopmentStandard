# geek-punchlist — 竣工検査ポータル（建設業・是正指摘管理）

建設業の代表的な内部プロセスである **竣工検査の指摘事項（パンチリスト）と是正の追跡** を管理する Code Apps サンプル実装。
指摘 → 是正中 → 是正済 → 確認済 をワンクリックで送り、**場所 × 分類のクロス集計マトリクス**で指摘の集中箇所を可視化します。
現場マスタとレポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| クロス集計マトリクス（ヒート色付きピボット表・合計行/列） | [cross-tab-pattern.md](../../references/cross-tab-pattern.md) |
| ワンクリック・ステータス送り（遷移マップによる次状態ボタン） | 本サンプル `types/dataverse.ts` の `NEXT_STATUS` + `items.tsx` の `handleAdvance` |
| 期限超過バッジ（未完了 × 期限切れの強調） | 本サンプル `items.tsx` の `isOverdue` |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（竣工検査中の現場・未完了指摘・期限超過・完了率）+ 分類別棒グラフ + ステータス円グラフ + 期限の近い未完了指摘 |
| 指摘事項 | `/items` | 指摘の登録・編集・削除。現場/ステータス/キーワードで絞り込み。「是正開始 → 是正完了 → 確認」のワンクリック送り・期限超過バッジ |
| マトリクス | `/matrix` | 場所 × 分類のクロス集計。色が濃いセルほど指摘が集中。現場・対象（未完了のみ/すべて）で絞り込み |
| 現場マスタ | `/sites` | 現場の登録・編集（現場代理人・竣工予定日・ステータス）（`VITE_FEATURE_SITES=true` 時） |
| レポート | `/reports` | 業者別未完了件数（期限超過は赤）・ステータスサマリー・現場別完了率（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_site`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_site` | 現場マスタ（現場名・現場代理人・ステータス・竣工予定日） |
| `{prefix}_punch_item` | 指摘事項（指摘内容・現場ID・場所・分類・担当業者・ステータス・指摘日・是正期限・詳細）。現場 1 件に複数の指摘が紐づく |

## 是正フロー

`指摘` → `是正中` → `是正済` → `確認済`

- 一覧の「是正開始 / 是正完了 / 確認」ボタンで次の状態へワンクリック送り（遷移は `NEXT_STATUS` マップで定義）
- 是正期限を過ぎた未完了指摘には赤い「超過」バッジを表示
- 完了率 = 確認済 ÷ 全指摘。現場別完了率レポートで引渡し可否の判断材料にする

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_site
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_punch_item
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "竣工検査ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_SITES` | `false` | 現場マスタページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/types/dataverse.ts` の `NEXT_STATUS` | 是正フローの段階・ボタンラベルを変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `src/components/cross-tab.tsx` の `heatColor` | マトリクスのヒート色を変更 |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

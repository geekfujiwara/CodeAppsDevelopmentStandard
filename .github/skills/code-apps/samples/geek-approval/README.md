# geek-approval — 稟議申請ポータル

稟議・汎用申請の作成・承認・却下を一元化した Code Apps サンプル実装。
承認ステージを矢羽（Stage Path）で可視化し、課長承認 → 部長承認の 2 段階承認フローを備えます。
レポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（承認待ち・今月の申請・今月の申請金額・緊急の承認待ち）+ 種別別棒グラフ + ステージ別円グラフ + 直近の申請 |
| 申請一覧 | `/requests` | 申請の一覧・登録・編集・削除。ステージ・優先度フィルター付き。行クリックで詳細へ |
| 申請詳細 | `/requests/:id` | サマリーヘッダー + 承認ステージ矢羽（Stage Path）+ 申請/承認/差戻し/却下の操作 + 承認履歴 |
| 承認箱 | `/approvals` | 承認待ちの申請を一覧表示し、承認者名・コメント付きでその場で承認・差戻し・却下 |
| レポート | `/reports` | ステージ別サマリー・種別別金額・月別申請件数・部門別集計（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_approval_request`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_approval_request` | 稟議申請（件名・種別・申請者・部門・金額・承認ステージ・優先度・申請日・申請内容・備考） |
| `{prefix}_approval_step` | 承認履歴（ステップ名・申請ID・承認者・判定・コメント・判定日）。申請 1 件に複数の履歴が紐づく |

## 承認フロー

```
下書き → 課長承認待ち → 部長承認待ち → 承認済み
              │               │
              ├─ 差戻し → 下書き
              └─ 却下  → 却下（終端）
```

- 「申請する」で `下書き` → `課長承認待ち` に進む
- 承認・差戻し・却下の判定時に、承認者名・コメントを `{prefix}_approval_step` に記録してからステージを更新
- 承認ステージは詳細画面の矢羽（[stage-path パターン](../../references/stage-path-pattern.md)）で可視化。却下は `negativeValue` として赤表示

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_approval_request
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_approval_step
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "稟議申請ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化（ステージ別・種別別・月別・部門別の集計） |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `src/types/dataverse.ts` の `REQUEST_STAGE_*` | 承認段階の追加・変更（3 段階承認にする等。`setup_dataverse.py` の OptionSet も合わせて変更） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

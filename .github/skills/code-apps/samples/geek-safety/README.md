# geek-safety — 安全衛生ポータル

ヒヤリハット・事故報告の収集と是正措置の追跡を一元化した Code Apps サンプル実装。
報告のステータス（報告済み → 対応中 → 是正完了）を矢羽（Stage Path）で可視化します。
是正措置とレポートは機能フラグで段階的に有効化できます。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（今月の報告・未解決の重大案件・対応中・未解決全体）+ 種別別棒グラフ + 重大度円グラフ + 直近の報告 |
| ヒヤリハット報告 | `/incidents` | 報告の一覧・登録・編集・削除。重大度・ステータスフィルター付き。行クリックで詳細へ |
| 報告詳細 | `/incidents/:id` | サマリーヘッダー + ステータス矢羽（クリックで変更可）+ 状況詳細/原因 + 是正措置の管理 |
| 是正措置 | `/actions` | 全報告の是正措置を横断表示。期限超過バッジ・ワンクリック完了（`VITE_FEATURE_ACTIONS=true` 時） |
| レポート | `/reports` | 重大度別サマリー・種別別/月別報告件数・拠点別集計（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_incident`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_incident` | ヒヤリハット・事故報告（件名・拠点/場所・種別・重大度・ステータス・報告者・発生日・状況詳細・原因・備考） |
| `{prefix}_corrective_action` | 是正措置（措置内容・報告ID・担当者・ステータス・期限）。報告 1 件に複数の措置が紐づく（`VITE_FEATURE_ACTIONS=true` 時） |

## 重大度とステータス

- 重大度: `ヒヤリハット` / `軽微` / `重大` / `重大災害`（重大以上はダッシュボードで強調）
- 報告ステータス: `報告済み` → `対応中` → `是正完了`（詳細画面の矢羽クリックで変更）
- 是正措置ステータス: `未着手` → `対応中` → `完了`（期限超過は赤バッジ表示）

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_incident
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_corrective_action
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "安全衛生ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_ACTIONS` | `false` | 是正措置ページと報告詳細内の是正措置管理を有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/types/dataverse.ts` の `SEVERITY_*` | 重大度区分の追加・変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

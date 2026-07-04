# geek-kaizen — 改善提案ポータル

改善提案（カイゼン）の起票から検討・採用・実施までを**ドラッグ＆ドロップのカンバン**で見える化する Code Apps サンプル実装。
新規提案は**ウィザードフォーム**（基本情報 → 提案内容 → 確認の 3 ステップ）で入力します。
いいね（投票）とレポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| カンバン D&D（楽観的更新・戻りアニメーション対策） | [reactflow-patterns.md パターン0](../../references/reactflow-patterns.md) |
| ウィザードフォーム（ステップ分割・確認画面） | [wizard-form-pattern.md](../../references/wizard-form-pattern.md) |
| 分野の色相ハッシュ配色（カード左端ストライプ） | `src/lib/category-color.ts` |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（今月の提案・検討中・採用率・実施済み累計）+ 分野別棒グラフ + ステータス円グラフ + 注目の提案 |
| カンバン | `/board` | 提案 → 検討中 → 採用 → 実施済み → 見送り の 5 列。ドラッグでステータス変更（楽観的更新 + 失敗時ロールバック）。カードクリックで内容確認 |
| 提案一覧 | `/suggestions` | 一覧・検索・編集・削除。新規はウィザード（3 ステップ）、編集は通常フォーム。いいねボタン（`VITE_FEATURE_VOTING=true` 時） |
| レポート | `/reports` | 分野別採用率・部門別提案数・月別提案数（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_suggestion`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_suggestion` | 改善提案（タイトル・分野・提案者・部門・ステータス・いいね数・提案日・提案内容・期待効果） |

## ステータスフロー

`提案` → `検討中` → `採用` → `実施済み`（または `見送り`）— カンバンのドラッグ＆ドロップで変更

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_suggestion
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "改善提案ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_VOTING` | `false` | いいねボタン・いいね数列・注目提案のいいね順表示を有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/types/dataverse.ts` の `KANBAN_COLUMNS` | カンバン列（ステータス区分）の追加・変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `src/pages/suggestions.tsx` の `WIZARD_STEPS` | ウィザードのステップ構成を変更 |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

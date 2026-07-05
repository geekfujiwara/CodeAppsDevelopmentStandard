# geek-quality — 品質検査ポータル（製造業・生産ライン検査）

製造業の代表的な内部プロセスである **生産ラインの品質検査と不良分析** を管理する Code Apps サンプル実装。
検査記録（ライン・品目・ロット・検査数）に不良を記録すると不良数・歩留まりが自動計算され、
**不良分類パレート図**で重点対策対象（累積 80%）を一目で特定できます。
レポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| パレート図（累積構成比・80% 基準線・重点分類の強調色） | [pareto-chart-pattern.md](../../references/pareto-chart-pattern.md) |
| ステージ矢羽（計画 → 実施中 → 完了） | [stage-path-pattern.md](../../references/stage-path-pattern.md) |
| 子レコード合計の親への自動同期（不良数量 → 検査記録の不良数） | 本サンプル `inspection-detail.tsx` の `syncDefectQty` |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（今月の検査・平均歩留まり・今月の不良数・要注意ライン）+ 不良分類パレート図 + ライン別歩留まり + 直近の検査 |
| 検査記録 | `/inspections` | 検査の計画・一覧・編集・削除。歩留まりバッジ（99+/95+/95未満で色分け）。行クリックで詳細へ |
| 検査詳細 | `/inspections/:id` | サマリーヘッダー（歩留まり表示）+ ステータス矢羽 + 不良記録の追加/編集（分類・数量・処置・原因）→ 不良数を自動同期 |
| レポート | `/reports` | 不良分類パレート図・ライン別集計・処置別不良数量・月別不良率（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_inspection`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_inspection` | 検査記録（件名・ライン・品目・ロット番号・検査員・ステータス・実施日・検査数・不良数・所見） |
| `{prefix}_defect` | 不良記録（不良内容・検査ID・分類・数量・処置・原因）。検査 1 件に複数の不良が紐づく |

## 歩留まりと不良分析の仕組み

- **不良数の自動同期**: 不良記録の追加・編集・削除のたびに数量合計を検査記録の `不良数` へ patch
- **歩留まり** = (検査数 − 不良数) ÷ 検査数 × 100（小数 1 桁）。95% 未満は赤で強調（しきい値は `src/config.ts` の `YIELD_WARNING_THRESHOLD`）
- **平均歩留まり**は検査回数の単純平均ではなく **Σ良品 ÷ Σ検査数**（母数の異なる検査を正しく合算）
- **パレート図**: 不良分類ごとの数量を降順に並べ、累積構成比の折れ線と 80% 基準線を重ねる。累積 80% までの分類は赤色で強調され、対策の優先順位が視覚化される
- **処置**: 不良ごとに `手直し` / `廃棄` / `特別採用` を記録し、レポートで処置別数量を集計

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_inspection
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_defect
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "品質検査ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `YIELD_WARNING_THRESHOLD` | 要注意ラインのしきい値（デフォルト 95%）を変更 |
| 不良分類 | 自由文字列（フォームのプレースホルダーに例示）。固定リスト化する場合は Picklist 化して `setup_dataverse.py` を変更 |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

# geek-haccp — 衛生管理ポータル（飲食・HACCP）

飲食業（外食・給食・食品加工）の代表的な内部プロセスである **HACCP に基づく温度・衛生の日常点検** を管理する Code Apps サンプル実装。
点検項目ごとに **管理基準（上下限）** を定め、測定値が基準内かを **しきい値ゲージ** でその場に可視化し、逸脱時は是正措置を記録します。
点検項目マスタとレポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| しきい値ゲージ（基準レンジに対する測定値の位置を横バー表示・適合/逸脱を色分け・片側規格対応） | [threshold-gauge-pattern.md](../../references/threshold-gauge-pattern.md) |
| 判定ロジックの純粋関数分離（`judgeThreshold` を UI から切り離してテスト・再利用可能に） | 本サンプル `src/lib/threshold.ts` |
| 項目 × 時間帯 のクロス集計ヒートマップ（逸脱の集中を色濃度で表現） | [cross-tab-pattern.md](../../references/cross-tab-pattern.md) |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（本日の測定件数・本日の適合率・本日の逸脱・是正未記入の逸脱）+ カテゴリ別 適合/逸脱 積み上げ棒 + 判定別円グラフ + 直近の逸脱一覧 |
| 測定記録 | `/measurements` | 測定値の登録・一覧・編集・削除。フォームでは点検項目を選ぶとしきい値ゲージがリアルタイムに判定を表示。逸脱行はハイライト |
| 点検項目 | `/checkpoints` | 点検項目マスタ（カテゴリ・単位・管理基準の上下限）。「標準項目を投入」で HACCP の代表的な項目を一括登録（`VITE_FEATURE_CHECKPOINTS=true` 時） |
| レポート | `/reports` | 点検項目別 適合率（低い順）+ 項目 × 時間帯 逸脱ヒートマップ（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_checkpoint`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_checkpoint` | 点検項目マスタ（項目名・カテゴリ・単位・下限値・上限値）。管理基準を定義 |
| `{prefix}_measurement` | 測定記録（記録名・点検項目ID・測定値・測定日・時間帯・点検者・是正措置）。項目 1 件に複数の測定が紐づく |

## 判定ロジック

- 判定は `src/lib/threshold.ts` の純粋関数 `judgeThreshold(value, min, max)` に集約。UI から独立しているため単体テスト・他アプリへの流用が容易
- `value < min` → **下限逸脱**、`value > max` → **上限逸脱**、範囲内 → **適合**、値なし → **未測定**
- 片側だけの規格（加熱は下限のみ、冷蔵は上限のみ）は一方を空欄にする。両方空欄なら常に「適合」
- 温度は氷点下（冷凍 -18℃ 等）を扱うため、`min_value` / `max_value` / `value` は負値を許可する Decimal 列

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_checkpoint
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_measurement
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "衛生管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_CHECKPOINTS` | `false` | 点検項目マスタページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/types/dataverse.ts` の `STANDARD_CHECKPOINTS` | 「標準項目を投入」で登録される初期点検項目と管理基準を変更 |
| `src/types/dataverse.ts` の `CATEGORY_*` / `TIME_SLOT_*` | カテゴリ・時間帯の区分を変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `src/lib/threshold.ts` の `judgeThreshold` | 判定基準（許容差・警告帯など）のロジックを拡張 |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

# geek-store — 店舗運営ポータル（小売業・臨店チェック）

小売業の代表的な内部プロセスである **臨店チェック（SV・エリアマネージャーによる店舗巡回監査）** を管理する Code Apps サンプル実装。
標準チェックリストの一括生成 → 合格/不合格/対象外 のワンクリック判定 → スコア自動計算・店舗別集計までを一気通貫で扱います。
店舗マスタとレポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| チェックリスト採点（判定トグル・スコア自動計算・テンプレート一括生成） | [checklist-scoring-pattern.md](../../references/checklist-scoring-pattern.md) |
| ステージ矢羽（予定 → 実施中 → 完了） | [stage-path-pattern.md](../../references/stage-path-pattern.md) |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（営業中店舗・今月の臨店・平均スコア・要改善店舗）+ 地域別店舗数グラフ + 臨店ステータス円グラフ + 直近の臨店 |
| 臨店チェック | `/audits` | 臨店の一覧・計画・編集・削除。店舗（マスタから選択）・巡回担当・実施日を登録。スコアバッジ（90+/70+/70未満で色分け） |
| 臨店詳細 | `/audits/:id` | 標準チェックリスト（11 項目）の一括生成 + カテゴリ別のチェック項目に 合格/不合格/対象外 をワンクリック判定 + スコア/進捗の自動計算 + 指摘コメント + ステータス矢羽 |
| 店舗マスタ | `/stores` | 店舗の登録・編集（地域・店長・営業ステータス）（`VITE_FEATURE_STORES=true` 時） |
| レポート | `/reports` | 店舗別平均スコア（低い順）・カテゴリ別不合格率・月別臨店数（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_store`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_store` | 店舗マスタ（店舗名・地域・店長・ステータス）（`VITE_FEATURE_STORES=true` 時に管理画面あり） |
| `{prefix}_store_audit` | 臨店チェック（件名・店舗ID・巡回担当・ステータス・実施日・スコア・所感） |
| `{prefix}_audit_item` | チェック項目（項目名・臨店ID・カテゴリ・判定・コメント）。臨店 1 件に複数項目が紐づく |

## スコアリングの仕組み

- **判定**: 各項目を `合格` / `不合格` / `対象外` から選択（同じボタンをもう一度押すと `未確認` に戻る）
- **スコア** = 合格 ÷（合格 + 不合格）× 100。`対象外` は分母に含めない
- **進捗** = 判定済み ÷ 全項目。`未確認` が残っている間は 100% にならない
- 判定を変えるたびにスコアを再計算し、臨店レコードの `スコア` 列へ自動同期（一覧・ダッシュボード・レポートで利用）
- 標準チェックリストは `src/types/dataverse.ts` の `STANDARD_CHECKLIST` で定義（清掃・衛生 / 陳列・売場 / 接客 / 安全）

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_store
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_store_audit
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_audit_item
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "店舗運営ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_STORES` | `false` | 店舗マスタページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/types/dataverse.ts` の `STANDARD_CHECKLIST` | 標準チェックリストの項目・カテゴリを自社基準に変更 |
| `src/lib/checklist.ts` | スコア計算ロジック（重み付け等）の変更 |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

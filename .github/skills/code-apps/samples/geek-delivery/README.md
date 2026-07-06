# geek-delivery — 配送管理ポータル（物流・運輸）

物流・運輸業の代表的な内部プロセスである **配送便の運行管理と配達トラッキング** を管理する Code Apps サンプル実装。
配送先（経由地）を**縦タイムライン**で順序どおりに表示し、配達完了 / 不在 / 持ち戻り をワンクリックで記録します。
車両マスタとレポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| 縦タイムライン/ステッパー（done/current/problem/pending の状態付き経由地表示） | [timeline-stepper-pattern.md](../../references/timeline-stepper-pattern.md) |
| ステージ矢羽（計画 → 運行中 → 完了） | [stage-path-pattern.md](../../references/stage-path-pattern.md) |
| 子レコード進捗の親への集計（配達済み件数 → 便の進捗バー） | 本サンプル `route-detail.tsx` の `handledCount` / progress |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（本日の運行便・配達成功率・不在/持ち戻り・点検期限間近）+ 配達ステータス円グラフ + 車両稼働状況 + 直近の配送便 |
| 配送便 | `/routes` | 便の計画・一覧・編集・削除。配達進捗（対応済/全件）を一覧に表示。行クリックで詳細へ |
| 配送便詳細 | `/routes/:id` | サマリーヘッダー（進捗バー）+ ステータス矢羽 + 配送タイムライン（順序どおりに経由地表示・配達完了/不在/持ち戻りをワンクリック記録） |
| 車両マスタ | `/vehicles` | 車両の登録・編集（車種・担当ドライバー・点検期限）。点検期限間近バッジ（`VITE_FEATURE_VEHICLES=true` 時） |
| レポート | `/reports` | ドライバー別配達実績（成功率）・車両別運行数・日別配達完了数（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_vehicle`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_vehicle` | 車両マスタ（車両名/ナンバー・車種・担当ドライバー・ステータス・点検期限） |
| `{prefix}_delivery_route` | 配送便（便名・車両ID・ドライバー・ステータス・運行日・備考） |
| `{prefix}_stop` | 配送先（配送先名・配送便ID・順序・エリア/住所・予定時刻・配達ステータス・備考）。便 1 件に複数の配送先が紐づく |

## 配達フロー

- 配送便ステータス: `計画` → `運行中` → `完了`（詳細画面の矢羽クリックで変更）
- 配達ステータス: 各配送先を `未配達` から `配達完了` / `不在` / `持ち戻り` へワンクリック記録（同じ結果を再クリックで未配達に戻す）
- タイムラインは順序（`seq`）どおりに上から表示。配達完了=チェック、不在/持ち戻り=バツ、最初の未配達=現在地として強調
- 便の進捗バー = 対応済み（配達完了・不在・持ち戻り）÷ 全配送先

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_vehicle
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_delivery_route
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_stop
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "配送管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_VEHICLES` | `false` | 車両マスタページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `INSPECTION_WARNING_DAYS` | 点検期限の注意喚起日数（デフォルト 30 日）を変更 |
| `src/types/dataverse.ts` の `STOP_STATUS_*` | 配達結果の区分を変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

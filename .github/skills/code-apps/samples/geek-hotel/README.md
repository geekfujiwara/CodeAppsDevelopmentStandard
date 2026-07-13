# geek-hotel — 客室管理ポータル（ホテル）

ホテル・宿泊業の代表的な内部プロセスである **客室の清掃・整備ステータス管理（ハウスキーピング）** を扱う Code Apps サンプル実装。
フロント・清掃・整備の各担当が客室の状況をひと目で共有できるよう、**階ごとの客室ボード**（ステータスグリッド）を中核に据えています。
セルをクリックして状況を更新すると、清掃・整備の記録が自動で残ります。客室マスタとレポートは機能フラグで段階的に有効化できます。

**このサンプルが実証するデザインパターン**

| パターン | 参照 |
|---|---|
| ルームグリッド/ステータスボード（カテゴリでグループ化した対象を状況で色分けした格子で俯瞰・クリックで操作） | [room-grid-pattern.md](../../references/room-grid-pattern.md) |
| 操作に連動した子レコードの自動生成（状況変更 → 清掃記録の作成） | 本サンプル `board.tsx` の `handleSetStatus` |
| 状況の色体系を一元管理（セル/バッジ/グラフで同じ配色を再利用） | 本サンプル `src/types/dataverse.ts` の `ROOM_STATUS_*` |

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/dashboard` | KPI カード（要対応=清掃/点検待ち・本日の清掃完了・整備中・稼働率）+ 状況別円グラフ + 階別状況内訳 + 直近の清掃/整備記録 |
| 客室ボード | `/board` | 階ごとの客室ステータスグリッド（状況で色分け）。セルクリックで状況変更ダイアログを開き、担当者入力・状況更新。「清掃済」「整備中」への変更で清掃記録を自動作成 |
| 客室マスタ | `/rooms` | 客室の登録・編集・削除（部屋番号・階・タイプ・定員・状況）。「標準客室を投入」でデモ用の客室を一括登録（`VITE_FEATURE_ROOMS=true` 時） |
| レポート | `/reports` | 担当者別作業実績（完了/差し戻し）・作業区分別件数・客室タイプ別稼働（`VITE_FEATURE_REPORTS=true` 時） |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_room`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_room` | 客室マスタ（部屋番号・階・客室タイプ・定員・状況・清掃担当・備考） |
| `{prefix}_cleaning_log` | 清掃記録（記録名・客室ID・記録日・作業区分・担当者・結果・備考）。客室 1 室に複数の記録が紐づく |

## 客室ステータス

| 状況 | 意味 | 用途 |
|---|---|---|
| 清掃待ち | チェックアウト後・未清掃 | 要対応 KPI の分子 |
| 清掃中 | 清掃作業中 | — |
| 清掃済 | 清掃完了・次の受入可 | 変更時に清掃記録（清掃・完了）を自動作成 |
| 点検待ち | 清掃後の点検待ち | 要対応 KPI の分子 |
| 滞在中 | 宿泊客が滞在中 | 稼働率の分子 |
| 整備中 | 故障・メンテナンスで貸出不可 | 変更時に清掃記録（整備・完了）を自動作成 |

- ボードのセル配色・一覧バッジ・グラフの色は `src/types/dataverse.ts` の `ROOM_STATUS_CELL` / `ROOM_STATUS_BADGE` / `ROOM_STATUS_HEX` に一元化。状況を増減するときはここと `setup_dataverse.py` の OptionSet を合わせて変更する

## セットアップ手順

```bash
cp ../../../standard/references/.env.example .env
python scripts/setup_dataverse.py
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_room
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_cleaning_log
python scripts/toggle_table_lang.py jp
pac code init -env ${ENV_ID} -n "客室管理ポータル"
npm install && npm run dev
```

## 機能フラグ

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_ROOMS` | `false` | 客室マスタページを有効化 |
| `VITE_FEATURE_REPORTS` | `false` | レポートページを有効化 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/types/dataverse.ts` の `STANDARD_ROOMS` | 「標準客室を投入」で登録される客室（階・タイプ・初期状況）を変更 |
| `src/types/dataverse.ts` の `ROOM_STATUS_*` | 客室状況の区分・配色を変更（`setup_dataverse.py` の OptionSet も合わせて変更） |
| `src/pages/board.tsx` の `taskTypeForStatus` | 状況変更時に清掃記録を残す条件・作業区分を変更 |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

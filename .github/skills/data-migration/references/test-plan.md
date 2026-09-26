# data-migration テスト計画

## 1. 方針

Unit はローカルだけで完結する（HTTP・SQL はモック）。Live は data-platform の評価環境を使い、課金と書き込みは承認後に実行する。
サンプルは [samples/cold-chain](samples/cold-chain/)（4 表・22 行、正解 1 行が一意に決まる）。

## 2. Unit テスト

| ID | 対象 | 観点 | 期待結果 | 自動化 |
|---|---|---|---|---|
| DM-U-001 | profile | 型推定 | 整数・小数・日時・文字列を判定 | `test_profile_source.py` |
| DM-U-002 | profile | キー候補 | 一意かつ非 NULL の列だけを候補にする | 同上 |
| DM-U-003 | profile | 外部キー候補 | 値が他表のキー集合に含まれる列を候補にする | 同上 |
| DM-U-004 | profile | JSON 入力 | JSON 配列と JSON Lines を読める | 同上 |
| DM-U-005 | profile | BOM / 日本語 | UTF-8 BOM 付き CSV の列名を正しく読む | 同上 |
| DM-U-006 | mapping | Databricks 命名 | snake_case、予約語・不正文字を正規化 | `test_build_mapping.py` |
| DM-U-007 | mapping | Dataverse 命名 | `{prefix}_` 付き小文字、entitySet・navigationProperty の下書き | 同上 |
| DM-U-008 | mapping | ロード順 | 親 → 子のトポロジカル順、循環はエラー | 同上 |
| DM-U-009 | plan | 業務キー重複 | 検証エラー、計画を出力しない（終了コード 2） | `test_migrate_data.py` |
| DM-U-010 | plan | 必須列 NULL | 検証エラー | 同上 |
| DM-U-011 | plan | 型変換失敗 | 行番号と値を含むエラー | 同上 |
| DM-U-012 | plan | 参照整合性 | 親に無い外部キー値をエラー | 同上 |
| DM-U-013 | plan | 識別子インジェクション | `stores; DROP TABLE x` のような識別子を拒否 | 同上 |
| DM-U-014 | plan | hash | ソース 1 文字の変更で planHash が変わる | 同上 |
| DM-U-015 | apply | hash 不一致 | 書き込みを 1 件も行わない | 同上 |
| DM-U-016 | apply | Databricks | `MERGE` がパラメーター化され、値が SQL 文字列に埋め込まれない | 同上 |
| DM-U-017 | apply | Databricks | 1 ステートメントのパラメーターが 1,000 個以内になるよう分割 | 同上 |
| DM-U-018 | apply | Dataverse | 代替キー upsert の URL で `'` をエスケープし URL エンコード | 同上 |
| DM-U-019 | apply | Dataverse | Lookup を `@odata.bind` の代替キー参照で送る | 同上 |
| DM-U-020 | apply | Dataverse | 代替キー未定義で `blocked` | 同上 |
| DM-U-021 | apply | Lakehouse | create → append → flush → Load Table（Overwrite） | 同上 |
| DM-U-022 | verify | 件数・キー一致 | `verified` | 同上 |
| DM-U-023 | verify | 欠落キー / 余分キー | `failed`、`missingKeys` / `extraKeys` を報告 | 同上 |
| DM-U-024 | verify | Lakehouse | テーブル存在は `verified`、件数は `not-tested` | 同上 |

## 3. Live テスト（書き込み・承認必須）

| ID | 投入先 | 手順 | 期待結果 |
|---|---|---|---|
| DM-L-001 | Databricks | cold-chain を `plan` → `apply` | 4 表 22 行 |
| DM-L-002 | Databricks | 同じ `apply` を再実行 | 行数不変（冪等） |
| DM-L-003 | Databricks | `verify` | 全表 `verified` |
| DM-L-004 | Databricks | data-platform `verify_platform.py --check databricks-sql` | 正解 1 行（投入データでセマンティック層が成立） |
| DM-L-005 | Dataverse | dataverse スキルで 4 表 + 代替キー作成後に `apply` | 22 行、Lookup が親に解決 |
| DM-L-006 | Dataverse | `verify` | 全表 `verified` |
| DM-L-007 | Fabric Lakehouse | `apply` | Load Table 操作が `Succeeded`、4 テーブル存在 |
| DM-L-008 | Fabric Lakehouse | `verify` | テーブル存在 `verified`、件数 `not-tested` の明示 |

## 4. 合格基準

- Unit はすべて成功。
- DM-L-001〜004 が `verified`。Dataverse / Lakehouse は環境があれば実施し、無ければ `not-tested` と理由を記録する。
- 失敗時に部分投入が起きた場合でも、再実行で冪等に回復できる（Databricks / Dataverse）。

## 5. 実施記録（2026-09-25、評価用 Databricks workspace の新規スキーマ）

| ID | 結果 | 証跡 |
|---|---|---|
| Unit 25 件 | `verified` | `python -m unittest discover -s tests` |
| DM-L-001 | `verified` | 4 表 22 行、各表 1 ステートメント |
| DM-L-002 | `verified` | 再実行後も件数不変（3 / 4 / 12 / 3） |
| DM-L-003 | `verified` | 全表で欠落・余分・値不一致 0 |
| DM-L-004 | `verified` | data-platform の metric view・正解 SQL・Genie が正解 1 行 |
| DM-L-005〜008 | `not-tested` | Dataverse 環境・Active な Fabric capacity を使わない回のため |

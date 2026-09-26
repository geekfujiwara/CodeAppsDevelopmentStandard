# data-migration 異常系・トラブルシュート

## 1. plan が終了コード 2 で止まる

`errors[].rule` を確認する。

| rule | 原因 | 対処 |
|---|---|---|
| `required` | 必須列または業務キーが空 | ソースを修正するか、`required: false` に変更（業務キーは不可） |
| `type:<type>` | 宣言型に変換できない値 | ソースを修正するか、type を `string` に変更 |
| `maxLength:<n>` | 文字列が長すぎる | `maxLength` を見直す（Dataverse は列定義と一致させる） |
| `duplicate-key` | 業務キーの重複 | 重複を解消する。業務キーの選び方を見直す |
| `reference:<table>` | 親に存在しない外部キー値 | 親データを追加するか、子データを修正する |
| `missing-column` | mapping の source 列がファイルに無い | 列名（BOM・大文字小文字・空白）を確認する |

## 2. apply が「ソースが plan 作成後に変更されています」で止まる

- 原因: plan 後にソースファイルを編集した（改行コードの変更も含む）。
- 対処: `plan` を再実行し、新しい `planHash` で承認を取り直す。

## 3. Dataverse で `blocked`（代替キー未定義）

- 原因: 業務キー列に代替キーが無い。代替キーが無いと冪等な upsert ができない。
- 対処: dataverse スキルで代替キーを作成し、`Active` になってから再実行する（作成直後はインデックス構築中）。
- 恒久対策済み: `DataverseWriter.prepare()` が投入前にすべてのテーブルの代替キーを確認する。

## 4. Dataverse の Lookup が 400 になる

- 原因: `navigationProperty` が Lookup のスキーマ名（大文字小文字を区別）と一致しない。
- 対処: `EntityDefinitions(LogicalName='<table>')/ManyToOneRelationships` の `ReferencingEntityNavigationPropertyName` を確認して mapping を修正する。

## 5. Dataverse の値が一致しない / 日本語が化ける

- `$filter` や URL に `+` を含む値を生で入れると空白扱いになる。スクリプトはキー値を URL エンコードしている。
- 日本語本文は `application/json; charset=utf-8` で送る（共通 `Api` が付与）。

## 6. Databricks の MERGE が失敗する

- `[DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE]`: 同じ業務キーが複数行ある。plan の `duplicate-key` 検証で検出される。
- 既存テーブルの列型が mapping と違う: `CREATE TABLE IF NOT EXISTS` は既存テーブルを変更しない。列型を揃えるか新しいテーブル名にする。

## 7. Fabric Load Table が失敗する

- capacity が `Paused` → data-platform の `manage_compute.py start --target fabric`。
- テーブル名が `^(?=[0-9]*[a-zA-Z_])[a-zA-Z0-9_]{1,256}$` に合わない → mapping の target を修正（plan で検出）。
- OneLake への書き込みが 403 → Storage audience のトークンと workspace の Contributor 以上が必要。
- Load Table は preview API。応答形状の変化に備え、`verify` でテーブル存在を必ず確認する。

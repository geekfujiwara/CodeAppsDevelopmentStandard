# マッピング契約（mapping.json）

`build_mapping.py` が下書きを出力し、利用者がレビューして確定する。`migrate_data.py` はこのファイルだけを正とする。

```json
{
  "schemaVersion": "1.0",
  "target": {
    "kind": "databricks",
    "catalog": "main",
    "schema": "cold_chain"
  },
  "tables": [
    {
      "source": "stores.csv",
      "target": "stores",
      "key": "store_id",
      "columns": [
        {"source": "store_id", "target": "store_id", "type": "string", "required": true, "maxLength": 20},
        {"source": "store_name", "target": "store_name", "type": "string", "required": true}
      ],
      "relationships": []
    },
    {
      "source": "freezers.csv",
      "target": "freezers",
      "key": "freezer_id",
      "columns": [
        {"source": "freezer_id", "target": "freezer_id", "type": "string", "required": true},
        {"source": "store_id", "target": "store_id", "type": "string", "required": true}
      ],
      "relationships": [
        {"column": "store_id", "references": {"table": "stores", "column": "store_id"}}
      ]
    }
  ]
}
```

## target

| kind | 必須キー | 補足 |
|---|---|---|
| `databricks` | `catalog`, `schema` | 接続は `.env` の `DATABRICKS_HOST` / `DATABRICKS_WAREHOUSE_ID` |
| `dataverse` | `publisherPrefix` | 接続は `.env` の `DATAVERSE_URL`。テーブルは dataverse スキルで作成済みであること |
| `fabric-lakehouse` | `workspaceId`, `lakehouseId` | `Files/{folder}/{table}.csv` にアップロードして Load Table |

## tables[]

| キー | 説明 |
|---|---|
| `source` | ソースファイル名（`--source-dir` からの相対） |
| `target` | 投入先テーブル名。Dataverse は論理名（例 `{prefix}_store`） |
| `entitySet` | Dataverse のみ。エンティティセット名（例 `{prefix}_stores`）。省略時は `target + "s"` |
| `key` | 業務キーの **ソース列名**。Dataverse では同名の代替キーが必要 |
| `columns[]` | `source` / `target` / `type` / `required` / `maxLength` |
| `relationships[]` | `column`（子のソース列）→ `references.table`（親テーブルの `target`）/ `references.column`（親の業務キー列） |

Dataverse の Lookup は `relationships[].navigationProperty`（例 `{prefix}_storeid`）を指定すると
`{navigationProperty}@odata.bind` で親の代替キーへバインドする。

## type

| type | Databricks | Dataverse | Lakehouse（CSV 経由） |
|---|---|---|---|
| `string` | `STRING` | 1 行テキスト | 文字列 |
| `integer` | `BIGINT` | 整数 | 推論 |
| `decimal` | `DOUBLE` | 浮動小数 / 10 進 | 推論 |
| `boolean` | `BOOLEAN` | はい/いいえ | 推論 |
| `date` | `DATE` | 日付のみ | 推論 |
| `datetime` | `TIMESTAMP` | 日付と時刻（UTC ISO 8601） | 推論 |

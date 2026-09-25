# Azure Databricks リファレンス

## 使う場面

- ストリーミング、Spark によるデータエンジニアリング、機械学習、大容量の履歴分析。
- Unity Catalog で統制した SQL 指標（metric view）を、Genie で自然言語から問い合わせる。
- 既存の Databricks 資産（notebook・job・Delta テーブル）がある。

## 構成要素と作成方法

| 要素 | 作成 | API |
|---|---|---|
| workspace（Premium） | `deploy_platform.py`（ARM） | `Microsoft.Databricks/workspaces@2024-05-01` |
| managed RG | **Databricks が作成** | 事前作成すると workspace が壊れる |
| Unity Catalog catalog | 新規 workspace で自動作成（workspace 名の catalog） | ― |
| Serverless PRO SQL warehouse | `deploy_platform.py`（post step） | `POST /api/2.0/sql/warehouses` |
| テーブル・データ | data-migration | SQL Statement Execution API（`MERGE`） |
| view / metric view / コメント | `configure_semantics.py` | 同上 |
| Genie space | `configure_semantics.py` | `POST /api/2.0/genie/spaces`（`serialized_space` version 2） |

## metric view

- YAML 1.1。`fields`（`dimensions` は互換の同義語）と `measures`。問い合わせは `MEASURE()` を使う。
- ディメンション経由の多段 join は列解決に失敗することがある。**join 済み view を `source` にする**。
- バッククォートで始まる式は YAML でクォートが必要。`configure_semantics.py` はすべての値を二重引用符で出力する。

## Genie

- 会話: `POST /api/2.0/genie/spaces/{id}/start-conversation` → `GET .../messages/{messageId}` を `COMPLETED` までポーリング。
- 結果: `GET .../attachments/{attachmentId}/query-result`。
- `FAILED` / `CANCELLED` / `QUERY_RESULT_EXPIRED` は失敗として扱う。

## managed MCP（Public Preview）

| サーバー | URL |
|---|---|
| Genie Agent | `https://<host>/api/2.0/mcp/genie/{genie_space_id}` |
| Databricks SQL | `https://<host>/api/2.0/mcp/sql` |
| Unity Catalog functions | `https://<host>/api/2.0/mcp/functions/{catalog}/{schema}/{function}` |

認証は Entra トークン（Azure Databricks 第一者 resource app）。Unity Catalog の権限が利用者ごとに適用される。

Genie Agent MCP のツールは **非同期**（実測 2026-09-25）:

| ツール | 引数 | 返り値 |
|---|---|---|
| `query_space_{space_id}` | `query`（必須）, `conversation_id` | `structuredContent.status`（例 `ASKING_AI`）と `conversationId` / `messageId` |
| `poll_response_{space_id}` | `conversation_id`, `message_id` | `COMPLETED` で `content.queryAttachments[].statement_response.result.data_array[].values[]` |

`query_space` の応答だけでは回答が入っていない。`verify_platform.py --check databricks-genie-mcp` は `COMPLETED` までポーリングして行を正解と比較する。
エージェントの指示（instructions）にも「`poll_response` を完了まで呼ぶ」ことを書く。

## コスト

- SQL warehouse は `auto_stop_mins=10`。検証後は `manage_compute.py stop --target databricks`。
- managed RG の NAT Gateway・Public IP・Storage は warehouse 停止後も課金される。

## 参考（Microsoft Learn）

- [metric view YAML 構文](https://learn.microsoft.com/azure/databricks/metric-views/data-modeling/syntax)
- [managed MCP サーバー](https://learn.microsoft.com/azure/databricks/generative-ai/mcp/managed-mcp)
- [SQL Statement Execution API](https://learn.microsoft.com/azure/databricks/dev-tools/sql-execution-tutorial)

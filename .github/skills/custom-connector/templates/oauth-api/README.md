# OAuth（Entra ID）API のカスタム コネクタ定義（テンプレート）

| ファイル | 役割 |
|---|---|
| `connector/apiDefinition.swagger.json` | OpenAPI 2.0。`paths` に操作を書く。`operationId` が Code Apps の生成サービスのメソッド名になる |
| `connector/apiProperties.json` | 認証設定（`identityProvider: aad`、スコープに `offline_access`） |

`{{NAME}}` は [`deploy_connector.py`](../../scripts/deploy_connector.py) が置き換える。

| 値 | 由来 |
|---|---|
| `API_APP_ID` / `API_SCOPE` | `configure_connector_oauth.py` の出力ファイル（自動） |
| `TENANT_ID` | `--tenant-id` か `.env` |
| `API_HOST` / `CONNECTOR_TITLE` / `PUBLISHER` | `--var NAME=VALUE` |

- `host` にはホスト名だけを書く（`https://` やパスは `schemes` と `basePath`）
- クライアントは API アプリ自身（client = resource）。API 側の認可は [SKILL.md](../../SKILL.md) の Step 2 に従う

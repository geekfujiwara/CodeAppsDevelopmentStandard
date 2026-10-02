# Speech トークン発行 Function（テンプレート）

Code Apps から Azure AI Speech に直接 WebSocket でつなぐための**短期トークン**を発行する Azure Functions と、
Code Apps から呼ぶためのカスタム コネクタ定義。構成の考え方は
[azure-infra のトークン ブローカー パターン](../../../azure-infra/references/token-broker.md)。

| ルート | 認可 | 応答 |
|---|---|---|
| `GET` / `POST /api/speech/token` | Entra ID の委任トークン（下記） | `{ token, region, expiresAt, expiresInSeconds }`、`Cache-Control: no-store` |

- 受信: JWKS で署名検証（RS256・audience 2 形式・発行元 v1/v2・`exp` 必須）のあと、`authorizeClaims()` で認可する
  - 委任トークン（`scp` と `oid` がある）であること。アプリ専用トークンは拒否
  - `scp` に `REQUIRED_SCOPE` がある（CLI など別クライアント）、**または** `appid`/`azp` が `TRUSTED_CLIENT_IDS` に含まれる
    （カスタム コネクタは API アプリ自身をクライアントにした v1 トークンを送り、`scp` は `User.Read` になるため）
  - 拒否時は `ver` / `aud` / `scp` / `appid` だけをログに出す
- 送信: Managed Identity で `https://cognitiveservices.azure.com/.default` を取り、`/sts/v1.0/issueToken` で 10 分トークンを発行
- 発行したトークンは 9 分で失効扱いにし、失効 60 秒前から再発行する（同時要求は 1 本にまとめる）。トークンの値はログに出さない

## アプリ設定

| 名前 | 値 |
|---|---|
| `ENTRA_TENANT_ID` | テナント ID |
| `API_AUDIENCE` | `api://<api-app-id>` |
| `REQUIRED_SCOPE` | 公開したスコープ名（既定 `Speech.Token`） |
| `TRUSTED_CLIENT_IDS` | 公開スコープが無くても受け付けるクライアント（カンマ区切り）。省略時は API アプリ自身（= カスタム コネクタ） |
| `SPEECH_ENDPOINT` | `https://<custom-subdomain>.cognitiveservices.azure.com/`（カスタム サブドメイン必須） |
| `SPEECH_REGION` | 例: `japaneast`（クライアントへ返す） |

Function の Managed Identity には **Foundry User** を付ける（スコープと反映の注意は [認証とロール](../../references/auth.md)）。

## コネクタ定義（`connector/`）

custom-connector スキルの [`deploy_connector.py`](../../../custom-connector/scripts/deploy_connector.py) で作成する。
`{{FUNCTION_HOST}}` / `{{CONNECTOR_TITLE}}` / `{{PUBLISHER}}` は `--var` で渡し、`API_APP_ID` / `API_SCOPE` / `TENANT_ID` は自動で入る。
クライアント シークレットは一時ファイルにだけ差し込まれる。接続の作成は custom-connector の `create_connection.py`。

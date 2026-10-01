# Speech トークン発行 Function（テンプレート）

Code Apps から Azure AI Speech に直接 WebSocket でつなぐための**短期トークン**を発行する Azure Functions と、
Code Apps から呼ぶためのカスタム コネクタ定義。構成の考え方は
[azure-infra のトークン ブローカー パターン](../../../azure-infra/references/token-broker.md)。

| ルート | 認可 | 応答 |
|---|---|---|
| `GET` / `POST /api/speech/token` | Entra ID の委任トークン（`scp` に `REQUIRED_SCOPE`） | `{ token, region, expiresAt, expiresInSeconds }`、`Cache-Control: no-store` |

- 受信: JWKS で署名検証（RS256・audience 2 形式・発行元 v1/v2・`exp` 必須・`scp` 必須・`oid` 必須）。失敗は 401
- 送信: Managed Identity で `https://cognitiveservices.azure.com/.default` を取り、`/sts/v1.0/issueToken` で 10 分トークンを発行
- 発行したトークンは 9 分で失効扱いにし、失効 60 秒前から再発行する（同時要求は 1 本にまとめる）。トークンの値はログに出さない

## アプリ設定

| 名前 | 値 |
|---|---|
| `ENTRA_TENANT_ID` | テナント ID |
| `API_AUDIENCE` | `api://<api-app-id>` |
| `REQUIRED_SCOPE` | 公開したスコープ名（既定 `Speech.Token`） |
| `SPEECH_ENDPOINT` | `https://<custom-subdomain>.cognitiveservices.azure.com/`（カスタム サブドメイン必須） |
| `SPEECH_REGION` | 例: `japaneast`（クライアントへ返す） |

Function の Managed Identity には、Speech リソースの範囲で **Foundry User** を付ける
（理由は [realtime-speech の認証リファレンス](../../references/auth.md)）。

## コネクタ定義（`connector/`）

`{{FUNCTION_HOST}}` などのプレースホルダーは
[`deploy_token_connector.py`](../../scripts/deploy_token_connector.py) がデプロイ時に置換し、
クライアント シークレットは一時ファイルにだけ差し込む。

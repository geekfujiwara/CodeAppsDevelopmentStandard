# 短期トークン発行（トークン ブローカー）パターン

ブラウザから Azure のサービスへ**直接**つなぐ必要がある（WebSocket のストリーミングなど、コネクタで中継できない）が、
長期の資格情報はブラウザに渡したくない場合の構成。Function が Managed Identity でサービスの**短期トークン**を発行し、
Code Apps はそれを**カスタム コネクタ**経由で受け取る。

```
Code Apps ──(カスタム コネクタ / 利用者の委任 OAuth)──▶ Function（JWT 検証）──(Managed Identity)──▶ サービスの STS
    │                                                       └─ 短期トークンをキャッシュして返す
    └──(短期トークン)──▶ サービスへ WebSocket 直結（CSP の connect-src に追加）
```

| 判断 | 理由 |
|---|---|
| コネクタ経由でトークンを取る | コネクタ呼び出しは postMessage 経由なので CSP の追加が不要。Code Apps から Function へ直接 `fetch` すると `connect-src` の追加が要る |
| Function の HTTP は公開、認可はコード側の JWT 検証 | コネクタ（SaaS）から到達できる必要がある。関数キーは使わない |
| ストレージは非公開（Private Endpoint） | テナントのポリシーに準拠する。Function は VNet 統合で到達する |

具体的な実装（Azure AI Speech 用の Function テンプレートとコネクタ定義）は
[realtime-speech スキル](../../realtime-speech/SKILL.md) にある。

## 手順

### Step 1: Entra ID に API を公開する

[mcp-server の `configure_entra_api.py`](../../mcp-server/scripts/configure_entra_api.py) を流用する。スコープ名は用途に合わせる。

```powershell
$env:MCP_API_APP_ID = "<api-app-id>"; $env:MCP_API_SCOPE_VALUE = "<Service>.Token"
python .github/skills/mcp-server/scripts/configure_entra_api.py
```

### Step 2: Function の基盤を作る

Flex Consumption + システム割り当て Managed Identity。共有キー禁止・公衆アクセス禁止のストレージでは、
**作成時に** VNet 統合を指定しないと `your app will not start` で作成できない（→ [troubleshooting](troubleshooting.md)）。

1. VNet、Private Endpoint 用サブネット、委任付きサブネット（`Microsoft.App/environments`）を作る
2. ストレージの **blob と queue** に Private Endpoint と Private DNS ゾーン（`privatelink.blob/queue.core.windows.net`）を作る
3. `az functionapp create ... --flexconsumption-location <region> --deployment-storage-auth-type SystemAssignedIdentity --assign-identity '[system]' --vnet <vnet> --subnet <delegated-subnet>`
4. `AzureWebJobsStorage` を ID ベース接続へ切り替える:
   `python .github/skills/mcp-server/scripts/configure_function_storage.py --app <app> --account <storage>`

### Step 3: Managed Identity にデータ ロールを付ける

対象サービスの**トークン発行操作**を含むデータ ロールを、サービス リソースの範囲で付ける。
ロール名だけで判断せず、`az role definition list --name "<role>" --query "[0].permissions[0].dataActions"` で中身を確認する。

- 付与・変更の反映には数分かかる（実測 2〜6 分）。反映前は発行が 401 になる。待ってから再試行する
- 発行操作の dataAction だけを持つカスタム ロールでは足りない場合がある（Speech の実例は realtime-speech を参照）

### Step 4: Function を実装する

受信トークンの検証は [mcp-server の認証モデル](../../mcp-server/references/auth-model.md) に加え、次を必ず行う。

| 検証 | 理由 |
|---|---|
| `scp` に公開したスコープがあること | アプリ専用トークン（`scp` なし）を拒否し、利用者の委任トークンだけを通す |
| `oid` があること | 誰に発行したかをログに残す（トークンの値はログに出さない） |
| 応答に `Cache-Control: no-store` | 中継や端末にトークンを残さない |
| 発行済みトークンを寿命の手前までキャッシュし、同時要求は 1 本にまとめる | 発行 API の呼び出し回数と遅延を減らす（実測: キャッシュ応答 73 ms） |
| 応答に残り秒数（`expiresInSeconds`）を含める | 端末の時計がずれていても、クライアントが更新時刻を正しく計算できる |

### Step 5: デプロイして実測する

```powershell
python .github/skills/mcp-server/scripts/deploy_mcp_function.py --project <path> --app <app> --route <route>
```

`deploy_mcp_function.py` はルートを POST で確認するため、ルートは GET と POST の両方を受け付ける。
認証なしで 401、`az account get-access-token --scope api://<api-app-id>/<scope>` のトークンで 200 を確認する。

### Step 6: カスタム コネクタを作る

1. OAuth クライアントとシークレットを用意する（保存先は `.gitignore` 済みの `.secrets/`。**Git リポジトリ内で実行**する）:
   `python .github/skills/mcp-server/scripts/configure_connector_oauth.py --audience api://<api-app-id> --scope <scope> --secret-out .secrets/<name>.json`
2. OpenAPI（`securityDefinitions` は `oauth2` / `accessCode`）と `apiProperties.json`（`identityProvider: aad`、`scopes` に `offline_access`）を
   `pac connector create --solution-unique-name <solution>` で作成する。シークレットは一時ファイルにだけ差し込む
3. コネクタ固有のリダイレクト URI を追加する:
   `python .github/skills/mcp-server/scripts/add_connector_redirect_uri.py --audience api://<api-app-id> --redirect-uri https://global.consent.azure-apim.net/redirect/<connector-internal-id から shared_ を除いた値>`
4. DLP でホストを分類する（未分類だとツールがブロック扱いになる場合がある）:
   `python .github/skills/admin/scripts/set_dlp_custom_connector.py --policy <policy> --host <app>.azurewebsites.net --classification General`

### Step 7: Code Apps に追加する

1. 利用者本人がコネクタの接続を作成する（OAuth の同意は代行できない）
2. `setup_connection_reference.py --api-id <shared_...> --connection-id <id>` で接続参照を作る
3. `pa app add data-source --connector <shared_...> --connection-ref <logical-name> --solution-id <id>`
4. 生成サービスは遅延読み込みにし、未追加でもビルドできるようにする（[code-apps の業務テンプレートの方式](../../code-apps/SKILL.md)）

## 検証状況（2026-10）

| 項目 | 状況 |
|---|---|
| Step 1〜6（Function の 401 / 200、キャッシュ、発行トークンでのサービス利用） | 検証済み |
| Step 7（Code Apps からコネクタ経由で取得） | **未検証**（利用者による接続作成待ち） |

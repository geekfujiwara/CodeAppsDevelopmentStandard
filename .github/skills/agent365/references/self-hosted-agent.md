# 自己ホスト エージェント（agentUser チャットを動かす唯一の構成）

Agent 365 の agentUser（同僚アイデンティティ）が Teams で**実際に応答する**ための構成。
2026-08-04 に実機で疎通確認済み。

> Foundry ホストの `activityprotocol` エンドポイントでは**動かない**。
> Agent 365 が送るトークンは `aud` = ブループリント appId / `azp` =
> `5a807f24-c9de-44ee-a3a7-329e88a00ffc` で、Foundry 側はこれを
> 401 `Error parsing client JWT` で拒否し、受理 audience を変更する手段が無い。
> 自前ホストなら `TokenValidation:Audiences` にブループリント appId を足すだけで受理できる。

## 全体像

```mermaid
flowchart LR
    F["Agent 365 ブループリント"] -->|messaging endpoint| S["App Service<br/>Agents SDK アプリ<br/>/api/messages"]
    F --> G["agenticUser.json"]
    G --> E["Teams manifest<br/>manifestVersion: devPreview"]
    E -->|M365 管理センターで手動アップロード| T["Agent template"]
    T --> N["Instance = agentUser SP"]
    N -->|Teams チャット| S
    S -->|返信: FMI トークン交換| N
    B["Azure Bot (UAMI)"] --- S
```

## 手順

### 1. Azure リソースを作る

```powershell
python scripts/provision_selfhost.py --write .env
```

作られるもの（すべて冪等）:

| リソース | 役割 | 備考 |
|---|---|---|
| ユーザー割り当てマネージド ID | Azure Bot の ID | `msaAppType=UserAssignedMSI` |
| Azure Bot + MsTeams チャネル | Teams チャネル登録 | `az bot create` は廃止 API 版のため `az rest --method PUT`（`api-version=2022-09-15`）を使う。`acceptedTerms=True` は **PUT でのみ**保持される |
| App Service プラン + Web アプリ | Agents SDK アプリの実行環境 | Linux / `DOTNETCORE:8.0`。**B1 以上 + Always On**（スクリプトが自動で有効化する） |

- **Free / Shared（F1・D1）は使えない。** Always On が無いため、リクエストが 20 分来ないと
  アプリがアンロードされ、**`BackgroundService` が丸ごと止まる**。受信トレイ監視（B6）も
  定期配信（B11）も在席同期（B12）も動かなくなる。`provision_selfhost.py` は F1/D1 を指定すると
  エラーで止まる。既存環境を上げる場合:

  ```powershell
  az appservice plan update -g $env:AZURE_RESOURCE_GROUP -n <plan> --sku B1
  az webapp config set -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME --always-on true
  ```

- リージョンによっては VM クォータが 0 で作成に失敗する（eastus2 / japaneast / eastus で遭遇）。
  `--location westus2` などで回避する。
- 出力の `AGENT_MESSAGING_ENDPOINT`（`https://<app>.azurewebsites.net/api/messages`）を
  ブループリントに登録する（SKILL.md Step 6）。

### 2. Agents SDK アプリを実装する

.NET の場合の最小構成。

```
<agent-name>.csproj   PackageReference: Microsoft.Agents.Hosting.AspNetCore, Microsoft.Agents.Authentication.Msal
Program.cs            AddAgent<EchoAgent>() / AddAgentAspNetAuthentication(Configuration)
                      MapAgentRootEndpoint() / MapAgentApplicationEndpoints(requireAuth: !IsDevelopment())
EchoAgent.cs          AgentApplication 派生
appsettings.json      下記の agentic 設定
```

`[MessageRoute(isAgenticOnly: true)]` は**必須ではない**。ルート絞り込み用の属性であり、
トークン経路の判定とは無関係（判定は `activity.Recipient.Role`）。
素の `OnActivity(ActivityTypes.Message, ...)` でも agentic 応答できることを確認済み。

### 3. `appsettings.json` を agentic 対応にする

公式サンプル [`Agents-for-net/src/samples/AgenticAI`](https://github.com/microsoft/Agents-for-net/tree/main/src/samples/AgenticAI) 準拠。

```json
{
  "Connections": {
    "ServiceConnection": {
      "Settings": {
        "AuthType": "ClientSecret",
        "AuthorityEndpoint": "https://login.microsoftonline.com/${AZURE_TENANT_ID}",
        "ClientId": "${A365_AGENT_BLUEPRINT_ID}",
        "Scopes": [ "5a807f24-c9de-44ee-a3a7-329e88a00ffc/.default" ]
      }
    }
  },
  "ConnectionsMap": [ { "ServiceUrl": "*", "Connection": "ServiceConnection" } ],
  "TokenValidation": {
    "Enabled": true,
    "Audiences": [ "${A365_AGENT_BLUEPRINT_ID}", "${AZURE_BOT_MSA_APP_ID}" ],
    "TenantId": "${AZURE_TENANT_ID}"
  }
}
```

| 設定 | 値 | 理由 |
|---|---|---|
| `AuthType` | **confidential client 必須**（`ClientSecret` / `certificate` / `FederatedCredentials`） | agentic トークン取得は `.WithFmiPath()` を使い、これは `IConfidentialClientApplication` にしか無い。`UserManagedIdentity` は `IManagedIdentityApplication` を返すため**原理的に動かない** |
| `ClientId` | **ブループリント appId** | Bot の `msaAppId` ではない |
| `Scopes` | `5a807f24-c9de-44ee-a3a7-329e88a00ffc/.default` | Messaging Bot API Application（固定値） |
| `TokenValidation:Audiences` | ブループリント appId ＋ Bot の `msaAppId` | 前者が Agent 365 の 401 を解消する要 |

Bot の appId とブループリント appId を別コネクションに分けたい場合は
`ConnectionSettings.AlternateBlueprintConnectionName` で 2 コネクション構成にできる
（`activity.Recipient.Role` が agentic のときだけ切り替わる）。

### 4. クライアント シークレットを注入する

**`appsettings.json` にシークレットを書かない。** App Service のアプリ設定に入れる
（ASP.NET Core の構成階層は `__` 区切りで環境変数にマップされる）。

```powershell
# --append を必ず付ける（既存資格情報を消さないため）。標準出力に平文で出るので変数のまま渡す
$sec = az ad app credential reset --id $env:A365_AGENT_BLUEPRINT_ID --append `
         --display-name "$env:AGENT_NAME-agent" --years 1 --query password -o tsv
az webapp config appsettings set -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME `
  --settings "Connections__ServiceConnection__Settings__ClientSecret=$sec"
Remove-Variable sec
```

### 5. デプロイする

```powershell
Remove-Item .\publish -Recurse -Force -ErrorAction SilentlyContinue
dotnet publish -c Release -o .\publish
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory("$PWD\publish", "$PWD\publish.zip")
az webapp deploy -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME `
  --src-path .\publish.zip --type zip --track-status false --timeout 600000
az webapp restart -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME
```

`--track-status false` は必須（付けないとハングする）。デプロイ後は必ず restart。
既存の `publish` フォルダに重ねて発行すると `MSB3021 ... Access denied` で失敗するのに
処理は先へ進み、**古い zip をデプロイしてしまう**。発行前の削除を省略しない。
`az webapp deploy` の 502 は Kudu の一過性エラーで、同じ zip のリトライで通る。
詳細は [agent-brain.md](agent-brain.md) §4。

### 6. インスタンス SP に同意を付与する（最後の関門）

Teams で無応答なら**ほぼここ**。インスタンスを作り直すたびに新しい SP ができるため、
**インスタンスごとに必要**。

```powershell
python scripts/grant_agent_instance_consent.py --instance-name "<インスタンス表示名>"
az webapp restart -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME
```

詳細と誤診しやすい `AADSTS82001` の扱いは [troubleshooting.md](troubleshooting.md) #19。

### 7. 疎通確認

```powershell
# 1. アプリが起動しているか
(Invoke-WebRequest -Uri "https://$env:AGENT_WEBAPP_NAME.azurewebsites.net/" -SkipHttpErrorCheck).StatusCode  # 200

# 2. ログを流しながら Teams でエージェントにメッセージを送る
az webapp log tail -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME
```

Teams に応答が返れば完了。ログの読み方:

| ログ | 意味 |
|---|---|
| `FMI Path: <guid>` を伴う `api://AzureAdTokenExchange/.default` が成功 | agentic トークン交換は正常。`<guid>` がインスタンス ID |
| `AADSTS82001 ... not permitted to request app-only tokens` | **無視してよい**（agentic アプリの仕様） |
| `AADSTS65001 ... has not consented` | 手順 6 が未実施 |
| `Only IConfidentialClientApplication ... is supported for Agentic.` | 手順 3 の `AuthType` が confidential client になっていない |

# Foundry ホスト方式（参考情報。実装には使わない）

> **このスキルの実装フローでは Foundry ホスト方式を使わない。**
> Foundry の `activityprotocol` を Agent 365 の agentUser エンドポイントに指定すると、
> Agent 365 が送るトークンが **401 で拒否され、Teams で話しかけても応答が返ってこない**（無反応）。
> 受理する audience を変更する手段が無く、回避策も存在しない
> （[troubleshooting.md](troubleshooting.md) #17）。
> デジタルな同僚を作るなら [SKILL.md](../SKILL.md) の自己ホスト フロー
> （[self-hosted-agent.md](self-hosted-agent.md)）を使う。
>
> 本ファイルは「なぜ動かないのか」「どこまでならできるのか」を残すための**参考情報**であり、
> ここの手順を正常系に混ぜない。同じ理由で `create_blueprint.py` / `create_instance.py` /
> `deploy.py` / `discover_foundry_context.py` も正常系では使わない。

エージェントの実装を自分で書かず、Foundry の `activityprotocol` エンドポイントを
Azure Bot のメッセージング エンドポイントにする方式。
**「アプリとしてインストールした bot への DM」だけが動く。**

## 現在できること / できないこと

| 目的 | 現状 |
|---|---|
| Teams に通常 bot として直接チャットさせる | 可能。下記の Bot Service + Foundry `activityprotocol` + `BotServiceRbac` PATCH が必要 |
| Agent 365 の agentUser としてチャットさせる | 不可。Agent 365 の `aud` / `azp` を Foundry `activityprotocol` 側が受理できない |
| Foundry エージェントを agentUser の頭脳として使う | 自己ホスト App Service を置き、Agent 365 activity を受けて Foundry `activityprotocol` / Agents API へ読替する中間サービスが必要 |

つまり、SKILL.md の正常系でデプロイする対象は **Agents SDK アプリ（App Service）**であり、
Foundry エージェントではない。Foundry エージェントを使う場合も、Agent 365 から見える
messaging endpoint は中間サービスまたは自己ホスト App Service の `/api/messages` にする。

## 1. Azure Bot を作る

Bot の `msaAppId` には**エージェントのインスタンス ID の client id** を使う。

```powershell
az bot create --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_BOT_NAME `
  --app-type SingleTenant --appid $env:INSTANCE_IDENTITY_CLIENT_ID --tenant-id $env:AZURE_TENANT_ID `
  --endpoint "$env:FOUNDRY_PROJECT_ENDPOINT/agents/$env:AGENT_NAME/endpoint/protocols/activityprotocol?api-version=2025-11-15-preview" `
  --sku S1
az bot msteams create --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_BOT_NAME
```

`az bot create` は廃止済み API 版を使うことがある。失敗する場合は
`az rest --method PUT ... api-version=2022-09-15` に置き換える
（[self-hosted-agent.md](self-hosted-agent.md) の `provision_selfhost.py` が同じ処理を行う）。

## 2. エージェント オブジェクトに認可スキームを追加する（必須）

`az bot create` だけでは、Foundry ポータルの「Teams と Microsoft 365 に対して発行する」ボタンが
裏側で行っている**エージェント オブジェクト自体への `activity` プロトコル + `BotServiceRbac`
認可スキームの追加**が行われない。これが無いと Teams で bot に直接メッセージしても
**無反応（サインイン カードすら出ない）**になる。

```http
PATCH {FOUNDRY_PROJECT_ENDPOINT}/agents/{AGENT_NAME}?api-version=v1
Content-Type: application/merge-patch+json
Foundry-Features: AgentEndpoints=V1Preview

{
  "agent_endpoint": {
    "protocol_configuration": { "responses": {}, "activity": {} },
    "authorization_schemes": [ { "type": "Entra" }, { "type": "BotServiceRbac" } ]
  }
}
```

`az account get-access-token` でトークンを取得し `Invoke-RestMethod` 等で送る。

- `BotServiceRbac` は**委任(delegated)認可**。メッセージ送信者本人が Teams 上で
  OAuthCard（"User Sign-in" → "Open sign-in link" → "Open Foundry login"）による
  サインインを一度完了する必要がある（送信者が Foundry プロジェクトへの RBAC 権限
  ＝ Foundry User / Foundry Agent Consumer 等を持っていることが前提）。
- 適用後、直接 bot チャットが動作することを実機確認済み。
- 参考: Microsoft Learn `agents/how-to/publish-copilot`（Publish ボタンの REST 相当手順）。

## 3. 既知の未解決事項

`POST {FOUNDRY_PROJECT_ENDPOINT}/agents/{name}/microsoft365/publish?api-version=v1`
（ポータルの "Publish to Teams and M365 Copilot" の REST 相当）は毎回
`502 upstream_dependency_failed` で失敗する。RBAC は原因ではない（呼び出し元は
サブスクリプション Owner）。回避策は無く、自己ホスト方式を使う。

# アーキテクチャ — 2 種類のブループリントと公開経路

## 1. 「ブループリント」は 2 種類ある（最頻出の混同）

| | Foundry マネージド ID ブループリント | Agent 365 エージェント ID ブループリント |
|---|---|---|
| 何の設計図か | エージェントが Azure リソースへアクセスするための**マネージド ID** | インストールごとに払い出す**Entra Agent ID** |
| 識別子 | 名前（例: `your-agent`）。`.env` の `BLUEPRINT_ID` | GUID。`.env` の `A365_AGENT_BLUEPRINT_ID` |
| 作成方法 | `python scripts/create_blueprint.py --name <name>` | `a365 setup blueprint -n <name> --no-endpoint` |
| API | Foundry データプレーン REST `/managedAgentIdentityBlueprints`（`api-version=v1`） | Agent 365 CLI（Entra + Agent 365 サービス） |
| 参照先 | `agent.yaml` の `blueprint_reference` | `teams/agenticUser.template.json` の `agentIdentityBlueprintId` |
| 共有可否 | `lifecycle=Manual` なら複数エージェントで共有可。`Auto` は所有エージェント専用 | インストール単位でインスタンスを払い出す |

**両者は無関係**。Foundry 側のブループリントを作っても Agent 365 のインスタンス化は起きないし、
その逆も成立しない。名前が似ているだけなので、変数名でも常に区別する。

## 2. インスタンスが作られない典型原因

`copilotAgents.customEngineAgents[]` の `functionsAs` の既定値は `agentOnly`
（= 通常のエージェントとしてインストールされるだけ = 全員が同じ 1 体を共有）。
インストールごとに専用の Entra Agent ID を持たせるには、manifest に次の 2 つが**両方**必要。

```jsonc
"copilotAgents": {
  "customEngineAgents": [
    {
      "id": "${INSTANCE_IDENTITY_CLIENT_ID}",
      "type": "bot",
      "functionsAs": "agenticUserOnly",          // ← devPreview のみ
      "agenticUserTemplateId": "${AGENT_NAME}-agentic-user"
    }
  ]
},
"agenticUserTemplates": [                         // ← GA 1.25+ / devPreview
  { "id": "${AGENT_NAME}-agentic-user", "file": "agenticUser.json" }
]
```

## 3. manifest スキーマの選び方

| 目的 | `manifestVersion` | `$schema` | 備考 |
|---|---|---|---|
| インスタンス化エージェント | `devPreview` | `.../teams/vDevPreview/MicrosoftTeams.schema.json` | `functionsAs` / `agenticUserTemplateId` は **devPreview にしか無い**（GA 1.25〜1.29 には存在しない） |
| 共有エージェント | `1.22` | `.../teams/v1.22/MicrosoftTeams.schema.json` | `agenticUserTemplates` と agentic-user 系プロパティを削除する |

`scripts/build_teams_package.py` は `A365_AGENT_BLUEPRINT_ID` の有無でこの 2 つを自動で切り替える。

### agenticUser.json のスキーマ（検証済み）

`https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.AgenticUser.schema.json`

- 必須: `id` / `schemaVersion`（`"0.1.0-preview"`）/ `agentIdentityBlueprintId`（GUID）
- 任意: `communicationProtocol`（`"activityProtocol"`）
- `additionalProperties: false`（余計なキーを足すと検証エラー）

## 4. 正常系の公開経路（自己ホスト）

```mermaid
flowchart LR
    S["App Service<br/>Agents SDK アプリ<br/>/api/messages"] --> B["Azure Bot Service<br/>msaAppId = UAMI client id"]
    B --> D["MSTeams チャネル"]
    D --> E["Teams アプリ manifest<br/>botId = msaAppId"]
    F["Agent 365 ブループリント<br/>agentBlueprintId"] --> G["agenticUser.json"]
    F -->|messaging endpoint| S
    G --> E
    E --> H["M365 管理センターで手動アップロード<br/>Agent template"]
    H --> I["agentUser インスタンス"]
    I -->|Teams / M365 Copilot チャット| S
```

agentUser チャットで Agent 365 が呼び出す endpoint は、自前 App Service の `/api/messages`。
Foundry エージェントのデプロイや Foundry `activityprotocol` URL は、この正常系には含めない。

```
https://<app>.azurewebsites.net/api/messages
```

### 4-2. Foundry ホスト経路は参考扱い

Foundry の `activityprotocol` エンドポイントを Azure Bot の endpoint にする方式は、
通常 bot への直接チャットだけが対象。agentUser チャットは動かない。
Agent 365 が送るトークンは `aud` = ブループリント appId / `azp` =
`5a807f24-c9de-44ee-a3a7-329e88a00ffc` で、Foundry の `activityprotocol` エンドポイントは
これを 401 `Error parsing client JWT` で拒否する（受理 audience を変更する手段が無い）。

Foundry エージェントを agentUser の頭脳として使いたい場合は、Agent 365 の activity を受ける
自己ホスト App Service / 中間サービスを置き、そこで Foundry `activityprotocol` または Agents API へ
リクエストを読替する。

```mermaid
flowchart LR
    A["Agent 365 agentUser activity"] --> S["自己ホスト App Service<br/>/api/messages"]
    S -->|読替| F["Foundry activityprotocol<br/>または Agents API"]
    F -->|結果| S
    S -->|agentUser として返信| A
```

| 要素 | 要件 |
|---|---|
| App Service の `TokenValidation:Audiences` | **ブループリント appId** と Bot の appId の両方 |
| `Connections:*:Settings:AuthType` | **confidential client 必須**（`ClientSecret` 等）。マネージド ID 不可 |
| 同 `ClientId` | **ブループリント appId** |
| 同 `Scopes` | `["5a807f24-c9de-44ee-a3a7-329e88a00ffc/.default"]` |
| インスタンス SP | Messaging Bot API への `AgentData.ReadWrite` 同意が**インスタンスごとに**必要 |

詳細は [troubleshooting.md](troubleshooting.md) #17〜#19、手順は [self-hosted-agent.md](self-hosted-agent.md)（SKILL.md Step 6）。

## 5. バージョニングと配信

- 挙動・プロンプトだけの変更なら **Agents SDK アプリを App Service へ再デプロイ**すればよく、
  Teams アプリの再登録は不要。
- **Teams アプリ manifest の内容（名前・説明・アイコン・スコープ）を変えた場合は
  `python scripts/build_teams_package.py` で ZIP を再ビルドし、M365 管理センターで
  Agent template を更新する必要がある**。この際 `version` を必ず上げる。
- Foundry エージェントを別途使う場合の `deploy.py` / `agents.create_version` は、参考構成または
  中間サービスの背後で使う頭脳の更新であり、Agent 365 の messaging endpoint そのものではない。

## 6. なぜポータル自動操作をしないか

- Foundry のエージェント操作は `azure-ai-projects` SDK で完結する。
- SDK の操作グループに無い API（ブループリント）も、認証済みクライアントの
  `AIProjectClient.send_request(HttpRequest(...))` で REST を直接叩ける。
- ブラウザ自動化は壊れやすく CI で再現できないため、最終手段としても採用しない。

# Foundry Autopilot（Foundry ホストで agentUser を持たせる）

Foundry の**ホスト エージェント**（コンテナー）を **Autopilot** として Microsoft 365 に発行すると、
採用（hire）したインスタンスごとに **Entra の agent user アカウント**が払い出される。
自己ホスト方式と同じく、**自分のメールアドレス・予定表・OneDrive・Teams プレゼンス・組織図上の上司**を持つ。

> [foundry-hosted-bot.md](foundry-hosted-bot.md) に書かれている 401 / 502 は
> **`activityprotocol` エンドポイントを Azure Bot に直結する旧経路**の話。
> 本ファイルの Autopilot 経路はそれとは別物で、実機で成立することを確認済み。

## 1. 自己ホストとの使い分け

| 観点 | 自己ホスト（[self-hosted-agent.md](self-hosted-agent.md)） | **Foundry Autopilot**（本ファイル） |
|---|---|---|
| 実行基盤 | App Service（自分で運用） | Foundry hosted agent（コンテナーをマネージドで実行） |
| agentUser アカウント | あり | **あり**（インスタンスごと） |
| Azure Bot リソース | 自分で作る | 不要（発行時に Foundry 側が構成） |
| M365 ツール | Graph を自分で叩く | **Agent 365 の MCP サーバー**（Mail / Calendar / Teams / Word / Excel / OneDrive）を委任トークンで利用 |
| スケール・面倒 | 自分で見る | Foundry が見る |
| 前提 | Agent 365 ライセンス | Agent 365 ライセンス + **Frontier preview** |
| 向き | 機能ブロック B1〜B17 をフルに作り込む | **素早く「自分のアカウントを持つ同僚」を立てる**、M365 標準ツール中心 |

どちらを選んでも agentUser は手に入る。**作り込みの自由度が要るなら自己ホスト、
M365 の標準ツールで足りるなら Autopilot** が速い。

## 2. 前提（欠けていると必ず途中で失敗する）

| 前提 | 確認方法 |
|---|---|
| Frontier preview program に登録済み | M365 管理センター |
| Agent 365 のライセンス席に空きがある（**1 インスタンス = 1 席**） | `scripts/publish_foundry_autopilot.py --check` |
| 承認できる管理者がいる（`Global Administrator` または `AI Administrator`） | 事前確認の質問 5 |
| サブスクリプション / RG で `Owner`（または `Contributor` + `Role Based Access Control Administrator`） | `az role assignment list` |
| Foundry アカウントが hosted agents 対応リージョンにある | [Learn: hosted agent quickstart](https://learn.microsoft.com/azure/foundry/agents/quickstarts/quickstart-hosted-agent) |

Docker は**不要**。イメージは ACR Tasks（`az acr build`）でクラウド ビルドする。

## 3. 経路の全体像

```
Foundry project
  └─ agent version（kind=hosted, digital_worker_type=m365）   ← 3-1
       └─ agent_endpoint に BotServiceRbac を PATCH           ← 3-2
            └─ POST microsoft365/publish（publishAsAutopilot） ← 3-3
                 └─ M365 管理センターで承認                    ← 3-4
                      └─ Teams で hire → agentUser が誕生      ← 3-5
```

3-1〜3-3 は [`scripts/publish_foundry_autopilot.py`](../scripts/publish_foundry_autopilot.py) が行う。
3-4・3-5 は管理センター / Teams の UI 操作（下記 §6）。

### 3-1. agent version を作る

旧経路との違いはこの 3 点。**どれか 1 つ欠けると agentUser にならない。**

| 要素 | 値 |
|---|---|
| リクエスト ヘッダー | `Foundry-Features: DigitalWorker=V1Preview` |
| ボディ | `"digital_worker_type": "m365"` |
| ボディ | `agent_endpoint.protocol_configuration.activity.enable_m365_public_endpoint = true` |

```http
POST {FOUNDRY_PROJECT_ENDPOINT}/agents/{AGENT_NAME}/versions?api-version={FOUNDRY_API_VERSION}
Foundry-Features: DigitalWorker=V1Preview

{
  "definition": {
    "kind": "hosted",
    "image": "{ACR_LOGIN_SERVER}/{IMAGE_NAME}:{IMAGE_TAG}",
    "cpu": "2", "memory": "4Gi",
    "container_protocol_versions": [{ "protocol": "activity_protocol", "version": "v1" }],
    "environment_variables": { "ModelDeployment": "{AZURE_OPENAI_DEPLOYMENT}", "...": "..." }
  },
  "agent_endpoint": {
    "protocols": ["activity"],
    "protocol_configuration": { "activity": { "enable_m365_public_endpoint": true } }
  },
  "digital_worker_type": "m365"
}
```

応答の `status` が `active` になるまでポーリングする（通常 30 秒以内）。
併せて返る値を控える。

| 応答フィールド | 用途 |
|---|---|
| `instance_identity.client_id` | この principal に **Foundry User** ロールを与える（3-2 の前に必須） |
| `blueprint.client_id` | 管理センターの承認要求と突き合わせる |
| `blueprint_reference.blueprint_id` | 同上 |

### 3-2. `BotServiceRbac` を PATCH する

`agent_endpoint` に認可スキームを追加する。これが無いと Teams から無反応になる。

```http
PATCH {FOUNDRY_PROJECT_ENDPOINT}/agents/{AGENT_NAME}?api-version={FOUNDRY_API_VERSION}
Foundry-Features: DigitalWorker=V1Preview

{ "agent_endpoint": {
    "protocols": ["activity"],
    "protocol_configuration": { "activity": { "enable_m365_public_endpoint": true } },
    "authorization_schemes": [{ "type": "BotServiceRbac" }] } }
```

### 3-3. Autopilot として M365 に発行する

```http
POST {FOUNDRY_PROJECT_ENDPOINT}/agents/{AGENT_NAME}/microsoft365/publish?api-version={FOUNDRY_API_VERSION}

{
  "agentDisplayName": "{AGENT_DISPLAY_NAME}",
  "publishAsAutopilot": true,
  "publishScope": "Tenant",
  "appVersion": "1.0.0",
  "canRespondWithoutMention": true,
  "shortDescription": "...", "fullDescription": "...",
  "developerName": "...", "developerWebsiteUrl": "...",
  "privacyUrl": "...", "termsOfUseUrl": "...",
  "optionalPermissionScopes": [ { "resourceAppId": "...", "scopes": ["..."] } ]
}
```

`publishAsAutopilot: true` が **agentUser を持つ「デジタルな同僚」**にするフラグ。
これを省くと、アカウントを持たない通常の共有エージェントとして発行される。

応答の `teamsAppId` / `titleId` を控える。成功しても**まだ誰も使えない**（承認待ち）。

## 4. `optionalPermissionScopes` に何を書くか

Agent 365 の MCP サーバーは**単一の resource app**（`ea9ffc3e-8a23-4a7d-836d-234d7c7565c1`。
全テナント共通の第一者アプリ）配下のスコープとして要求する。

| スコープ | 用途 |
|---|---|
| `McpServers.Mail.All` | メールの読み書き・送信 |
| `McpServers.Calendar.All` | 予定表 |
| `McpServers.Teams.All` | Teams チャット / チャネルへの投稿 |
| `McpServers.OneDriveSharepoint.All` | ファイル |
| `McpServers.Word.All` / `McpServers.Excel.All` | 文書・ブックの操作 |

> **全テナント共通ではない resource app を書くと発行が 400 で落ちる。**
> 例: Azure DevOps MCP（`2a72489c-aab2-4b65-b93a-a91edccf33b8`）は ADO を使っていない
> テナントには servicePrincipal が無く、`dependency_error: Resource app '...' does not exist in the tenant`
> になる。`publish_foundry_autopilot.py` は送信前に Graph の `servicePrincipals` を引いて
> **存在しない resourceAppId を検出して除外**する（[troubleshooting.md](troubleshooting.md) #72）。

## 5. スクリプトで実行する

```powershell
# 前提だけ確認（Azure リソースも M365 も変更しない）
python .github/skills/ai-teammate/scripts/publish_foundry_autopilot.py --check

# agent version 作成 → ロール付与 → BotServiceRbac PATCH → Autopilot 発行
python .github/skills/ai-teammate/scripts/publish_foundry_autopilot.py --execute

# 送信するボディだけ見たい（既定は dry-run）
python .github/skills/ai-teammate/scripts/publish_foundry_autopilot.py
```

必要な値は [.env.example](.env.example) の `=== Foundry Autopilot ===` 節を参照。

## 6. 承認と採用（UI 操作）

1. **承認**: M365 管理センター → **エージェント** → **すべてのエージェント** → **要求**
   （`https://admin.cloud.microsoft/#/agents/all/requested`）。
   対象 blueprint（状態 `Pending activate`）→ **要求を承認してアクティブ化**。
   ウィザードで 公開範囲（誰が hire できるか）→ ポリシー テンプレートの適用 →
   **管理者の同意を付与**（§4 のスコープ）→ 完了。
   - 実行ロール: `Global Administrator` または `AI Administrator`。
2. **採用（hire）**: Teams → **アプリ** → **Agents for your team** → 対象 → **インスタンスを作成**。
   名前（32 文字以内）・エイリアス・ドメイン・**上司（manager）**を指定する。
   数分で agent user アカウントが払い出され、本人から DM が届く。組織図にも並ぶ。
3. **確認**: Teams で会話 → 払い出されたメールアドレス宛にメール送信 → 返信が来ることを見る。

## 7. 再発行（バージョンを上げる）

同じ `appVersion` で `microsoft365/publish` を再送すると
`UserError: version already exists` になる。イメージを差し替えたら
**新しい agent version を作ってから発行する**（`appVersion` も上げる）。

## 8. 頭脳を GitHub Copilot SDK に差し替える（任意）

公式サンプルの中身は **Foundry Responses API を 1 回呼ぶだけ**で、複数手順の作業は苦手。
**GitHub Copilot SDK**（`github-copilot-sdk`。Copilot CLI と同じランタイムをライブラリとして使う）を
頭脳に据えると、計画立案・シェル / Python 実行・ファイル操作・多段ツール呼び出しが入る。
モデルは BYOK プロバイダーとして**同じ Foundry デプロイ**を向くので、別枠のモデル費用は増えない。

```python
from copilot import CopilotClient, PermissionHandler, ProviderConfig, ToolSet

session = await client.create_session(
    session_id=session_id,
    provider=ProviderConfig(
        type="azure", base_url=FOUNDRY_PROJECT_ENDPOINT,
        wire_api="responses", bearer_token=<https://ai.azure.com/.default のトークン>,
    ),
    model=<ModelDeployment>,
    mcp_servers={ "mcp_MailServer": {
        "type": "http", "url": "...",
        "headers": {"Authorization": f"Bearer {委任トークン}"} } },
    available_tools=ToolSet().add_builtin("*").add_mcp("*"),
    system_message={"mode": "replace", "content": instructions},
    on_permission_request=PermissionHandler.approve_all,
)
```

| 論点 | やること |
|---|---|
| Agent 365 の MCP | Responses API の `{"type":"mcp", server_url, headers}` を `{"type":"http", url, headers}` に読み替えて `mcp_servers` に渡す。委任トークンはそのまま使えるので**ユーザーの権限のまま**動く |
| トークンの失効 | 委任トークンは 1 時間程度で切れる。**セッションはトークンごと**にキャッシュし、変わったら作り直す（古いセッションは失効トークンを使い続ける） |
| 同時実行 | SDK のセッションは 1 ターンずつ。Teams / M365 Copilot は activity をまとめて投げてくるので、**ターンを直列化**しないと idle 待ちでデッドロックする |
| ランタイム | `CopilotClient.start()` が初回に GitHub Releases からランタイムを取りに行く。**Dockerfile でビルド時に取得**しておく（下記） |

```dockerfile
ENV COPILOT_CLI_EXTRACT_DIR=/opt/copilot-runtime
RUN python -m copilot download-runtime
```

> **コンテナーの環境変数名に `AGENT_` / `FOUNDRY_` の接頭辞は使えない。**
> プラットフォーム予約で、agent version の作成が `invalid_payload` で 400 になる
> （[troubleshooting.md](troubleshooting.md) #73）。切り替えフラグの名前もこれを避ける。

差し替え後は**新しい agent version を作るだけ**でよい。`agent_endpoint.version_selector` は
既定で `@latest` に 100% 流すので、再発行（`microsoft365/publish`）は要らない。

## 9. 参考

- Learn: `azure/foundry/agents/concepts/autopilot-overview`
- Learn: `azure/foundry/agents/concepts/agent-365-integration`
- Learn: `azure/foundry/agents/how-to/agent-365`（Quickstart: Build your first autopilot）
- サンプル: `microsoft-foundry/foundry-samples` → `samples/python/foundry-autopilot-agent`

# 自前 MCP Server を Cowork プラグインのコネクタにする

Cowork プラグインの `agentConnectors` は **remote MCP server** を指すため、Dataverse MCP だけでなく
[mcp-server スキル](../../mcp-server/SKILL.md) で構築した **自前 MCP Server（Azure Functions）** も
そのままコネクタとして登録できる。基幹 DB・ファイルサーバー・業務 API など **Dataverse に無いデータ**を
Cowork から扱いたい場合に使う。

> **前提**: MCP Server 側が **Streamable HTTP 準拠**であること
> （通知に 202・本文なし／`protocolVersion` は `2025-03-26` 以降／GET は 405）。
> `python .github/skills/mcp-server/scripts/verify_mcp_server.py --app <app>` が
> 「Streamable HTTP 準拠 OK」を返す状態にしてから本手順に入る。

## Dataverse MCP との違い（ここだけが変わる）

| 項目 | Dataverse MCP | 自前 MCP Server |
|---|---|---|
| MCP URL | `https://<org>.crm.dynamics.com/api/mcp` | `https://<app>.azurewebsites.net/api/mcp` |
| トークンの audience | Dataverse 自身（ファーストパーティ） | **自前 API の `api://<api-app-id>`** |
| Entra の委任権限 | Dynamics CRM の `mcp.tools` | **自前 API の公開スコープ（例 `MCP.Access`）** |
| OAuth registration の Base URL | `https://<org>.crm.dynamics.com` | `https://<app>.azurewebsites.net` |
| OAuth registration の Scope | `https://<org>.crm.dynamics.com/.default,offline_access` | `api://<api-app-id>/.default,offline_access` |
| `allowedmcpclients` への登録 | **必要**（Step 4） | **不要**（Dataverse を経由しないため） |
| ツール定義 JSON | `dataverse-mcp-tools.json`（read_query 等） | `tools/list` の実測結果から生成 |

それ以外（manifest の書式・`referenceId` の Base64 規約・zip 構成・管理センターからの公開手順）は
SKILL.md の Step 6〜10 とまったく同じ。

## 手順

### 1. MCP Server 側のスコープを確認する

自前 MCP Server は `configure_entra_api.py` で API アプリにスコープを公開済みのはず。
`.env` の値を確認する（mcp-server スキルの `.env` と同じ名前を使う）。

```
MCP_API_APP_ID={your-api-app-id}
MCP_API_AUDIENCE=api://{your-api-app-id}
MCP_API_SCOPE_VALUE=MCP.Access
```

### 2. Cowork 用の OAuth クライアントアプリに、自前 API の委任権限を付ける

Cowork は Enterprise Token Store 経由で**クライアントアプリとして**トークンを取得する。
SKILL.md Step 3 で作った OAuth クライアントアプリ（`COWORK_OAUTH_CLIENT_ID`）に、
Dynamics CRM の `mcp.tools` ではなく **自前 API のスコープ**を静的に付与する。

```powershell
python .github/skills/cowork/scripts/setup_entra_oauth_graph.py `
  --display-name "MyApp-Cowork-CustomMCP-OAuth" `
  --api-audience "api://<api-app-id>" --api-scope "MCP.Access"
```

> `--api-audience` を指定すると Dynamics CRM の `mcp.tools` の代わりに、指定 API の該当スコープを
> `requiredResourceAccess` に登録する。Dataverse MCP と自前 MCP の**両方**を同じプラグインで使う場合は
> 両方指定する（`--api-audience` は繰り返し指定可能）。

続いて、MCP Server 側の API アプリでこのクライアントを**事前承認**しておくと同意画面を減らせる。

```powershell
$env:MCP_PREAUTH_CLIENT_IDS = "<COWORK_OAUTH_CLIENT_ID>"
python .github/skills/mcp-server/scripts/configure_entra_api.py
```

> テナントがユーザー同意を制限している場合は、SKILL.md Step 3 と同様に
> `https://login.microsoftonline.com/<TENANT_ID>/adminconsent?client_id=<COWORK_OAUTH_CLIENT_ID>`
> で管理者同意を得る。

### 3. `allowedmcpclients` の登録は不要

自前 MCP Server は Dataverse を経由しないため、SKILL.md **Step 4 はスキップ**する
（Dataverse MCP も併用する場合のみ、Dataverse 側の分として実施する）。

### 4. Teams 開発者ポータルの OAuth client registration

SKILL.md Step 5 と同じ画面。値だけ差し替える。

| フィールド | 値 |
|---|---|
| Base URL | `https://<app>.azurewebsites.net`（**`/api/mcp` は付けない**） |
| Client ID / secret | `.env` の `COWORK_OAUTH_CLIENT_ID` / `COWORK_OAUTH_CLIENT_SECRET` |
| Authorization / Token / Refresh endpoint | `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/{authorize,token,token}` |
| Scope | `api://<api-app-id>/.default,offline_access`（**カンマ区切り**） |
| Enable PKCE | 有効 |

> MCP Server が複数ある場合（例: 基幹 DB 用とファイルサーバー用）でも、**API アプリを 1 つに集約**していれば
> registration は 1 つでよい（Base URL はいずれかの MCP Server を指定し、実際の接続先は manifest の
> `mcpServerUrl` が決める）。API アプリを分けた場合は registration も分ける。

### 5. ツール定義 JSON を実測から作る

`mcpToolDescription` は必須で、**実際の `tools/list` と名前が一致していなければツールが認識されない**。
推測で書かず、実測結果から作る。

```powershell
python .github/skills/mcp-server/scripts/verify_mcp_server.py --app <app>
```

出力された `tools/list -> [...]` のツール名をそのまま使う。

```json
{
  "tools": [
    { "name": "list_categories", "description": "分類の一覧を取得する。",
      "annotations": { "readOnlyHint": true, "title": "List Categories" } },
    { "name": "search_documents", "description": "キーワードで文書を検索する。",
      "annotations": { "readOnlyHint": true, "title": "Search Documents" } }
  ]
}
```

### 6. manifest.json に自前 MCP を追加する

`agentConnectors` は複数書けるので、Dataverse MCP と自前 MCP を**併載**できる。

```jsonc
"agentConnectors": [
  {
    "id": "backend-mcp",
    "displayName": "部品業務システム MCP",
    "description": "部品マスタ・在庫・過去問い合わせを MCP 経由で参照する。",
    "toolSource": {
      "remoteMcpServer": {
        "mcpServerUrl": "https://<app>.azurewebsites.net/api/mcp",
        "mcpToolDescription": { "file": "backend-mcp-tools.json" },
        "authorization": {
          "type": "OAuthPluginVault",
          "referenceId": "__COWORK_OAUTH_REGISTRATION_ID__"
        }
      }
    }
  }
]
```

- ツール定義 JSON は**コネクタごとに別ファイル**にし、zip のルートに含める。
- コネクタが複数ある場合は、`description` に**どのコネクタをどの用途で使うか**を明記する
  （「手順書の検索は『ファイルサーバー MCP』を使う」等）。エージェントはこの説明でツールを選ぶため、
  曖昧だと誤ったコネクタを呼ぶ。
- registration を分けた場合は `referenceId` のプレースホルダーもコネクタごとに分け、
  `build_agent_package.ps1` の注入対象に追加する。

### 7. 以降は SKILL.md と同じ

Step 7（zip ビルド）→ Step 8（管理センターからアップロード）→ Step 9（初回同意）→ Step 10（更新）。

## つまずきやすい点

| 症状 | 原因 | 対処 |
|---|---|---|
| Cowork でコネクタが反応しない（エラーも出ない） | 自前 API スコープへの管理者同意が未完了 | `adminconsent` URL で同意を得る |
| 同意は通るが MCP が 401 | registration の Scope が Dataverse のままか、audience 違い | Scope を `api://<api-app-id>/.default,offline_access` にする |
| 接続自体が確立しない（curl では成功する） | MCP Server が Streamable HTTP 非準拠 | `verify_mcp_server.py` で 3 点を実測して修正（→ [mcp-server troubleshooting](../../mcp-server/references/troubleshooting.md)） |
| 読み取りは動くが一部ツールだけ無反応 | `mcpToolDescription` にそのツール名が無い | `tools/list` の実測結果と突き合わせる（→ troubleshooting #15） |

## 関連

- [mcp-server スキル](../../mcp-server/SKILL.md) — MCP Server の構築
- [Copilot Studio への登録](../../mcp-server/references/copilot-studio-registration.md) — 同じ MCP Server を Copilot Studio でも使う場合
- [Configure authentication for MCP and API plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication)

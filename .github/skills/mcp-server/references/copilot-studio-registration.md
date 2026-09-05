# Copilot Studio に自前 MCP Server を登録する

Copilot Studio が対応するのは **Streamable トランスポートのみ**（SSE は 2025 年 8 月で廃止）。
登録前に [protocol.md](protocol.md) の「Streamable HTTP の必須要件」を満たしていること。

登録方式は 2 つある。

| 方式 | 内容 | 使いどころ |
|---|---|---|
| MCP オンボーディング ウィザード | Copilot Studio の **ツール > ツールの追加 > 新しいツール > Model Context Protocol** でサーバー URL と認証を入力 | 単発・手早く繋ぐ |
| **カスタム コネクタ（OpenAPI）** | `x-ms-agentic-protocol: mcp-streamable-1.0` を持つ swagger を Power Apps にインポート | **定義をコード管理したい場合。既定はこちら** |

> **M365 Copilot（Cowork）から使いたい場合**は本手順ではなく、Cowork プラグインの
> `agentConnectors.remoteMcpServer` として登録する →
> [cowork/references/custom-mcp-connector.md](../../cowork/references/custom-mcp-connector.md)。
> **同じ MCP Server を両方に登録できる**（API アプリを 1 つに集約しておけば、実装は増えず登録が 2 系統になるだけ）。

## Step 1: OpenAPI 定義を用意する

`swagger: '2.0'` で、MCP エンドポイントの POST 操作 1 つだけを定義する。
`x-ms-agentic-protocol` が MCP として扱うためのマーカーで、これが無いと通常の REST 操作になる。

```yaml
swagger: '2.0'
info:
  title: <サーバー表示名>
  description: >-
    このサーバーが何を答えられるかを書く。複数の MCP Server を 1 エージェントに束ねる場合は
    「別の用途では〇〇サーバーを使うこと」まで書く。オーケストレーターはこの説明で選択する。
  version: 1.0.0
host: <function-app>.azurewebsites.net
basePath: /
schemes:
  - https
paths:
  /api/mcp:
    post:
      summary: <サーバー表示名>
      operationId: InvokeMCP
      x-ms-agentic-protocol: mcp-streamable-1.0
      responses:
        '200':
          description: Success
securityDefinitions:
  oauth2_auth:
    type: oauth2
    flow: accessCode
    authorizationUrl: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
    tokenUrl: https://login.microsoftonline.com/common/oauth2/v2.0/token
    scopes:
      ${MCP_API_AUDIENCE}/${MCP_API_SCOPE_VALUE}: MCP サーバーへのアクセス
security:
  - oauth2_auth:
      - ${MCP_API_AUDIENCE}/${MCP_API_SCOPE_VALUE}
```

> `tools/list` の中身は書かない。ツール一覧は接続後に MCP サーバーから動的に取得され、
> サーバー側で増減させると Copilot Studio に自動反映される。

## Step 2: Entra アプリ登録にコネクタ用 OAuth 設定を追加する

カスタムコネクタは認可コードフローで動くため、API アプリ登録に固定のリダイレクト URI と
クライアントシークレットが必要になる。

```powershell
python .github/skills/mcp-server/scripts/configure_connector_oauth.py `
  --audience $env:MCP_API_AUDIENCE --secret-out .secrets/connector-oauth.json
```

このスクリプトは以下を行う。

1. リダイレクト URI `https://global.consent.azure-apim.net/redirect` を追加する（全カスタムコネクタ共通の固定値）。
2. クライアントシークレットを発行する。
3. 自分自身のスコープへの委任アクセスを `requiredResourceAccess` に追加し、同意を成立させる。

> **シークレットは標準出力に出さず**、`--secret-out` のファイルにだけ書き出す。
> 出力先は必ず `.gitignore` 対象のパスにする。

## Step 3: カスタム コネクタを作成する

Power Apps（make.powerapps.com）＞ **カスタム コネクタ** ＞ **新しいカスタム コネクタ** ＞
**OpenAPI ファイルをインポート** で Step 1 の YAML を読み込み、セキュリティ タブで以下を設定する。

| 項目 | 値 |
|---|---|
| 認証タイプ | OAuth 2.0 |
| ID プロバイダー | Azure Active Directory |
| クライアント ID / クライアント シークレット | Step 2 の出力ファイルの値 |
| リソース URL | `${MCP_API_AUDIENCE}` |
| スコープ | `${MCP_API_SCOPE_VALUE}` |

ブラウザ操作は VS Code 統合ブラウザで自動化する。開始前に `AskUserQuestion` で使用する
Microsoft Edge プロファイルを確認し、回答前はポータルを開かない
（→ [ブラウザ自動化方針](../../standard/references/browser-automation.md)）。

## Step 4: エージェントにツールとして追加する

Copilot Studio でエージェントを開き、**ツール > ツールの追加** から作成したコネクタを選び、
接続を作成して追加する。追加後に再公開する。

- **生成オーケストレーションが有効**でないと MCP は使えない。
- 複数の MCP Server を 1 エージェントに束ねる場合は、エージェントの指示文にも
  「どの質問でどのサーバーを使うか」を明記する。コネクタの `description` だけでは選択を誤ることがある。

## Step 5: 実測で確認する

Copilot Studio のテスト ペインで、各サーバーの `list_*` 系ツールが呼ばれることを確認する。
ツールが呼ばれない場合は、まず [verify_mcp_server.py](../scripts/verify_mcp_server.py) を実行して
サーバー側の Streamable HTTP 準拠を切り分ける（サーバーが原因か、登録が原因かを先に確定させる）。

## 参考リンク

- [Connect your agent to an existing MCP server](https://learn.microsoft.com/microsoft-copilot-studio/mcp-add-existing-server-to-agent)
- [Extend your agent with Model Context Protocol](https://learn.microsoft.com/microsoft-copilot-studio/agent-extend-action-mcp)

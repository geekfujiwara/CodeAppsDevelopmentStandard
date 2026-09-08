# Copilot Studio に自前 MCP Server を登録する

Copilot Studio が対応するのは **Streamable HTTP** のみ。登録前に [protocol.md](protocol.md) の
要件を満たし、[verify_mcp_server.py](../scripts/verify_mcp_server.py) で `tools/call` まで成功させる。

| 方式 | 使いどころ |
|---|---|
| **MCP オンボーディングウィザード（推奨）** | Copilot Studio 内で Server URL と認証を入力して追加する通常経路 |
| カスタムコネクタ（OpenAPI） | 定義をコード管理し、複数環境へ同じ OpenAPI を配布する場合 |

> M365 Copilot（Cowork）から使う場合は、Cowork プラグインの `agentConnectors.remoteMcpServer` として
> 別途登録する。→ [custom-mcp-connector.md](../../cowork/references/custom-mcp-connector.md)

## 推奨: MCP オンボーディングウィザード

### Step 1: OAuth クライアントを準備する

Entra アプリ登録に委任スコープを公開した後、認可コードフロー用の Client secret を作成する。

```powershell
python .github/skills/mcp-server/scripts/configure_entra_api.py
python .github/skills/mcp-server/scripts/configure_connector_oauth.py `
  --audience $env:MCP_API_AUDIENCE `
  --secret-out .secrets/connector-oauth.json
```

`.secrets/connector-oauth.json` は Client secret を含むため、必ず `.gitignore` 対象にする。
スクリプトは ignore されていない出力先と既存ファイルへの上書きを、secret 発行前に拒否する。
既存ファイルがある場合はその secret を再利用し、期限切れ等で意図的に更新するときだけ
`--rotate-secret` を付ける。新形式の出力は credential の `keyId` も保存し、更新成功後に旧credentialを削除する。
旧形式のファイルに `keyId` がない場合は警告に従い、Entra 管理センターで旧credentialを手動削除する。
このスクリプトが登録する共通 URI `https://global.consent.azure-apim.net/redirect` だけでは、
オンボーディングウィザードが生成する**パス付き Redirect URI**には一致しない。Step 4 で追加する。

### Step 2: MCP Server ごとの入力ガイドを生成する

入力値を探し回らずに済むよう、Server ごとにコピペ用 MD を生成する。MD には Client secret が入るため、
**生成前に出力先を `.gitignore` へ追加する**。生成スクリプトは ignore されていなければ中断する。

```gitignore
mcp-servers/example-files-mcp/copilot-studio-connection.md
```

```powershell
python .github/skills/mcp-server/scripts/generate_copilot_studio_guide.py `
  --server-name example-files-mcp `
  --server-description "社内文書を検索して内容を取得します。" `
  --server-url "https://func-example-files-mcp.azurewebsites.net/api/mcp" `
  --display-name "文書 MCP 接続" `
  --tenant-id $env:ENTRA_TENANT_ID `
  --audience $env:MCP_API_AUDIENCE `
  --secret-file .secrets/connector-oauth.json `
  --output mcp-servers/example-files-mcp/copilot-studio-connection.md
```

- 複数 Server を登録するときは、**1 Server = 1 MD** に分ける。
- `Server name` は `^[A-Za-z0-9.\-]{1,64}$`、つまり英字・数字・ハイフン・ドットだけにする。
  日本語や空白を使うと、`POST .../connectors/apim` が内部名の検証で 400 を返す。
- `Server description` には「何を取得できるか」と「どの質問で使うか」を書く。
- `Display name (optional)` は接続作成画面で使う、人が判別しやすい名前にする。

### Step 3: Add MCP server を入力する

ブラウザ操作前に [ブラウザ自動化方針](../../standard/references/browser-automation.md) に従って
使用する Edge プロファイルを確認し、同じプロファイルを最後まで使う。

1. Copilot Studio で対象エージェントを開く。
2. **Tools > Add a tool > New tool > Model Context Protocol** を開く。
3. 生成した MD から次を貼り付ける。

| 画面の項目 | 値 |
|---|---|
| Server name | 英数字の Server 名 |
| Server description | 用途の説明 |
| Server URL | `https://<function-app>.azurewebsites.net/api/mcp` |
| Authentication | `OAuth 2.0` |
| Configuration type | `Manual` |
| Client ID | Entra アプリの Client ID |
| Client secret | Step 1 で発行した値 |
| Authorization URL | `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize` |
| Token URL | `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token` |
| Refresh token URL | Token URL と同じ |
| Scopes | `api://<app-id>/<scope> offline_access`。対話同意では `/.default` を使わない。`offline_access` を省くとリフレッシュトークンが発行されず、アクセストークンの期限切れ（既定 60〜90 分）ごとに手動再接続が必要になる |

4. **Add** を選択する。`POST .../connectors/apim` が 400 の場合は、ブラウザ開発者ツールの
   **Network > connectors/apim > Response** を確認する。Initiator の JavaScript スタックだけでは原因は分からない。

### Step 4: コネクタ固有 Redirect URI を登録する

コネクタ作成後に callback URL が表示されたら、その値を使う。接続時に `AADSTS50011` が出た場合は、
エラー本文の `redirect URI '...'` を**完全一致のまま**使う。Request Payload や Client secret は共有しない。

```powershell
python .github/skills/mcp-server/scripts/add_connector_redirect_uri.py `
  --audience $env:MCP_API_AUDIENCE `
  --redirect-uri "https://global.consent.azure-apim.net/redirect/<connector-id>"
```

このスクリプトは既存の Web redirect URI を保持し、追加後に Graph で再取得して検証する。
Client secret は作成・ローテーションしない。入力ガイドにも URI を残す場合は、Step 2 のコマンドへ
`--redirect-uri` を加えて再生成する。

### Step 5: 接続を作成してエージェントへ追加する

1. **Select a connection** で対象コネクタの **Create** を選ぶ。
2. 生成 MD の `Display name (optional)` を貼り付ける。
3. 組織アカウントでサインインする。Step 4 の URI 追加直後は、接続ダイアログを一度閉じて開き直す。
4. 接続が `Connected` になったら **Add to agent** を選ぶ。
5. MCP Server の詳細で接続を選び、表示される場合は **Confirm** を選ぶ。
6. エージェントを再公開する。

生成オーケストレーションを有効にする。複数 Server を追加するときは、各 description と
エージェントの Instructions の両方に、どの質問でどの Server を使うかを書く。

### Step 6: テストする

テストペインで Server ごとの質問を実行し、期待した Server の `tools/list` と `tools/call` が呼ばれること、
実データが回答へ反映されることを確認する。ツールが呼ばれない場合は、登録問題と Server 問題を分けるため
`verify_mcp_server.py` を再実行する。

接続が `Connected` のはずなのに Edit 画面で `HTTP 401` が出る場合は、DLP やアプリ登録を疑う前に
`diagnose_connector_token.py` で「未接続」「トークン失効（要再認証）」「aud/iss 不一致」を切り分ける。
→ [troubleshooting.md](troubleshooting.md)

## 代替: OpenAPI からカスタムコネクタを作る

定義をコード管理する場合は `swagger: '2.0'` で MCP の POST 操作だけを定義し、Power Apps の
**Custom connectors > Import OpenAPI file** から作成する。

```yaml
swagger: '2.0'
info:
  title: Example MCP
  description: 社内データを検索して取得する MCP Server
  version: 1.0.0
host: func-example-mcp.azurewebsites.net
basePath: /
schemes: [https]
paths:
  /api/mcp:
    post:
      summary: Example MCP
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
      api://<app-id>/MCP.Access: MCP Server へのアクセス
security:
  - oauth2_auth:
      - api://<app-id>/MCP.Access
```

`tools/list` の内容は OpenAPI に書かない。接続後に MCP Server から動的に取得される。

## 参考リンク

- [Connect your agent to an existing MCP server](https://learn.microsoft.com/microsoft-copilot-studio/mcp-add-existing-server-to-agent)
- [Extend your agent with Model Context Protocol](https://learn.microsoft.com/microsoft-copilot-studio/agent-extend-action-mcp)

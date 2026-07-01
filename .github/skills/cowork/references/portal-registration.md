# Teams 開発者ポータル OAuth client registration（Step 5 詳細）

[SKILL.md](../SKILL.md) の Step 5 で入力するフィールドの詳細。
[dev.teams.microsoft.com/tools](https://dev.teams.microsoft.com/tools) → Tools →
**OAuth client registration** → New（**SSO client registration ではない**）。

| フィールド | 値 |
|---|---|
| Registration name | `Dataverse MCP OAuth (<org>)` |
| Base URL | `https://<org>.crm.dynamics.com`（**`/api/mcp` は付けない**。MCP URL は manifest 側に書く） |
| Client ID | `.env` の `COWORK_OAUTH_CLIENT_ID` |
| Client secret | `.env` の `COWORK_OAUTH_CLIENT_SECRET`（**画面に直接貼る／質問ツール禁止**） |
| Authorization endpoint | `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/authorize` |
| Token endpoint | `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token` |
| Refresh endpoint | `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token` |
| Scope | `https://<org>.crm.dynamics.com/.default offline_access`（`.default` で静的権限＝`mcp.tools`、`offline_access` でリフレッシュトークン） |
| Enable PKCE | 有効（推奨） |
| Restrict usage by org | `My organization only`（単一テナント）／`Any Microsoft 365 Organization`（複数テナント配布時） |
| Restrict usage by app | `Any Teams app`（**ストア検証が通るまではこちら**。公開・疎通確認後に Existing Teams app へ切替可） |

Save すると **OAuth client registration ID** が発行される。これを `.env` の
`COWORK_OAUTH_REGISTRATION_ID` に保存する。

> **referenceId の値**: OAuth 方式では発行された **registration ID をそのまま** `referenceId` に使う
> （SSO 方式のような `Base64("<tenantId>##<regId>")` 変換は不要）。

> **シークレット入力の注意**: Client secret 欄は**平文表示**で、Playwright の
> スナップショット/スクショに写り得る。`.env` からの投入は PowerShell `Set-Clipboard` +
> ブラウザ `Ctrl+V` で行い（値をチャットに出さない）、疎通確認後は**ローテーション**する。
> 手順は [troubleshooting.md #17](troubleshooting.md) を参照。

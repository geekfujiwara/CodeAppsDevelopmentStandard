# Entra OAuth クライアント作成の手動手順（Azure CLI）

[SKILL.md](../SKILL.md) の Step 3 は [scripts/setup_entra_oauth_graph.py](../scripts/setup_entra_oauth_graph.py)（推奨・デバイスコード不要）
または [scripts/setup_entra_oauth.ps1](../scripts/setup_entra_oauth.ps1) で自動化する。
スクリプトを使わず**手で作る**場合の同等コマンドを以下に示す。

```powershell
$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;$env:PATH"
az login --use-device-code --tenant <TENANT_ID> --allow-no-subscriptions --only-show-errors

# 1. アプリ登録（リダイレクト URI は固定値2つ）
$appId = az ad app create --display-name "Cowork-DataverseMCP-OAuth" `
  --web-redirect-uris `
    "https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect" `
    "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect" `
  --sign-in-audience AzureADMyOrg --query appId -o tsv

# 2. Dynamics CRM の委任権限 mcp.tools を付与（Dataverse MCP 専用スコープ）
az ad app permission add --id $appId `
  --api 00000007-0000-0000-c000-000000000000 `
  --api-permissions a4c5bee6-25ff-4bb5-b926-b7eb8062ae7a=Scope --only-show-errors

# 3. クライアントシークレットを作成（OAuth 認可コードフローに必須）→ .env に保存
$secret = az ad app credential reset --id $appId --display-name "cowork-oauth" `
  --years 2 --query password -o tsv
# .env の COWORK_OAUTH_CLIENT_ID / COWORK_OAUTH_CLIENT_SECRET に書き込む（Git にコミットしない）
(Get-Content .env) `
  -replace '^COWORK_OAUTH_CLIENT_ID=.*', "COWORK_OAUTH_CLIENT_ID=$appId" `
  -replace '^COWORK_OAUTH_CLIENT_SECRET=.*', "COWORK_OAUTH_CLIENT_SECRET=$secret" |
  Set-Content .env
```

## ポイント

- SSO と違い `Expose an API`（スコープ公開）も `preAuthorizedApplications` 事前承認も**不要**。
  認可コードフローは Dynamics CRM の委任スコープ `mcp.tools` を直接同意するため。
- API 権限は **`mcp.tools` のみ**でよい（`user_impersonation` は不要）。OAuth registration の scope を
  `.default` にすることで、このアプリに静的設定された `mcp.tools` が要求される。
- **シークレットは機密**。`.env` は `.gitignore` で除外する。スキルや manifest には絶対に書かない。

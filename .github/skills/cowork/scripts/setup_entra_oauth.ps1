<#
.SYNOPSIS
  Cowork プラグイン用の Entra OAuth クライアントアプリを作成・構成する（汎用）。

.DESCRIPTION
  OAuth 2.0 認可コードフローで Dataverse MCP に接続するための Entra アプリを作成し、
  以下を構成する:
    1. アプリ登録（Teams の固定リダイレクト URI ×2）
    2. Dynamics CRM の委任権限 mcp.tools を付与
    3. クライアントシークレットを作成
    4. Client ID / Secret を .env に書き込む（COWORK_OAUTH_CLIENT_ID / COWORK_OAUTH_CLIENT_SECRET）

  値はパラメータまたは .env から取得する。az CLI が必要。
  シークレットは標準出力に表示せず、.env のみに保存する（.env は .gitignore で除外すること）。

.PARAMETER TenantId
  対象テナント ID。未指定時は .env の TENANT_ID。

.PARAMETER DisplayName
  作成するアプリの表示名。既定 "Cowork-DataverseMCP-OAuth"。

.PARAMETER EnvPath
  書き込む .env のパス。既定はリポジトリルートの .env。

.PARAMETER SecretYears
  シークレットの有効年数。既定 2。

.EXAMPLE
  ./setup_entra_oauth.ps1
  ./setup_entra_oauth.ps1 -DisplayName "Contoso-Cowork-OAuth" -TenantId <GUID>
#>
[CmdletBinding()]
param(
    [string]$TenantId,
    [string]$DisplayName = "Cowork-DataverseMCP-OAuth",
    [string]$EnvPath,
    [int]$SecretYears = 2
)

$ErrorActionPreference = "Stop"

# ---- .env 解決 ----
function Resolve-EnvPath {
    param([string]$Explicit)
    if ($Explicit) { return $Explicit }
    $dir = $PSScriptRoot
    while ($dir) {
        $candidate = Join-Path $dir ".env"
        if (Test-Path $candidate) { return $candidate }
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    throw ".env が見つかりません。-EnvPath で明示してください。"
}

function Get-EnvValue {
    param([string]$Path, [string]$Key)
    $line = Select-String -Path $Path -Pattern "^$Key=" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { return ($line.Line -replace "^$Key=", "").Trim() }
    return ""
}

function Set-EnvValue {
    param([string]$Path, [string]$Key, [string]$Value)
    $content = Get-Content $Path
    if ($content -match "^$Key=") {
        ($content -replace "^$Key=.*", "$Key=$Value") | Set-Content $Path
    } else {
        Add-Content -Path $Path -Value "$Key=$Value"
    }
}

$envFile = Resolve-EnvPath -Explicit $EnvPath
if (-not $TenantId) { $TenantId = Get-EnvValue -Path $envFile -Key "TENANT_ID" }
if (-not $TenantId) { throw "TenantId 未指定。-TenantId か .env の TENANT_ID を設定してください。" }

# ---- az CLI 解決 ----
$azWbin = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin"
if (Test-Path $azWbin) { $env:PATH = "$azWbin;$env:PATH" }
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw "az CLI が見つかりません。" }

# Dynamics CRM (Dataverse) の固定 ID
$DYNAMICS_CRM_APP = "00000007-0000-0000-c000-000000000000"
$MCP_TOOLS_SCOPE  = "a4c5bee6-25ff-4bb5-b926-b7eb8062ae7a"  # Dynamics CRM /mcp.tools

Write-Host "== az ログイン確認 ($TenantId) =="
$null = az account show 2>$null
if ($LASTEXITCODE -ne 0) {
    az login --use-device-code --tenant $TenantId --allow-no-subscriptions --only-show-errors | Out-Null
}

Write-Host "== 1. アプリ登録: $DisplayName =="
$appId = az ad app create --display-name $DisplayName `
    --web-redirect-uris `
        "https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect" `
        "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect" `
    --sign-in-audience AzureADMyOrg --query appId -o tsv
if (-not $appId) { throw "アプリ作成に失敗しました。" }
Write-Host "   appId=$appId"

Write-Host "== 2. Dynamics CRM 委任権限 mcp.tools を付与 =="
az ad app permission add --id $appId `
    --api $DYNAMICS_CRM_APP `
    --api-permissions "$MCP_TOOLS_SCOPE=Scope" --only-show-errors | Out-Null

Write-Host "== 3. クライアントシークレット作成（$SecretYears 年） =="
$secret = az ad app credential reset --id $appId --display-name "cowork-oauth" `
    --years $SecretYears --query password -o tsv 2>$null
if (-not $secret) { throw "シークレット作成に失敗しました。" }

Write-Host "== 4. .env に書き込み ($envFile) =="
Set-EnvValue -Path $envFile -Key "COWORK_OAUTH_CLIENT_ID" -Value $appId
Set-EnvValue -Path $envFile -Key "COWORK_OAUTH_CLIENT_SECRET" -Value $secret

Write-Host ""
Write-Host "✅ 完了:" -ForegroundColor Green
Write-Host "   COWORK_OAUTH_CLIENT_ID=$appId"
Write-Host "   COWORK_OAUTH_CLIENT_SECRET=（.env に保存。表示は省略）"
Write-Host ""
Write-Host "次のステップ:"
Write-Host "  - python register_mcp_client.py  で Client ID を Dataverse 許可 MCP クライアントに登録"
Write-Host "  - Teams 開発者ポータルで OAuth client registration を作成（scope=.default offline_access）"

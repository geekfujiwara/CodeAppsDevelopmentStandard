param(
  # Speech リソース（カスタム サブドメイン必須）。未指定なら .env の SPEECH_RESOURCE_GROUP / SPEECH_ACCOUNT_NAME
  [string]$ResourceGroup = $env:SPEECH_RESOURCE_GROUP,
  [string]$AccountName = $env:SPEECH_ACCOUNT_NAME,
  # 10 分の STS トークンを使う（既定は約 60〜90 分有効な aad#{resourceId}#{entraToken} 形式）
  [switch]$Sts,
  # クリップボードを使わず標準出力へ返す（自動テスト用。画面に表示しないよう変数で受け取ること）
  [switch]$Raw
)
# 診断・検証用に Speech の認可トークンを取得する。本番のアプリはトークン発行コネクタから取得する
$ErrorActionPreference = "Stop"
if (-not $ResourceGroup -or -not $AccountName) { throw "-ResourceGroup / -AccountName（または .env の SPEECH_RESOURCE_GROUP / SPEECH_ACCOUNT_NAME）が必要です" }
$account = az cognitiveservices account show -n $AccountName -g $ResourceGroup --query "{id:id,endpoint:properties.endpoint,subdomain:properties.customSubDomainName}" -o json | ConvertFrom-Json
if (-not $account.subdomain) { throw "カスタム サブドメインが未設定です。Entra ID 認証にはカスタム サブドメインが必要です" }
$entra = az account get-access-token --resource https://cognitiveservices.azure.com --query "{token:accessToken,expiresOn:expiresOn}" -o json | ConvertFrom-Json

if ($Sts) {
  $token = Invoke-RestMethod -Method Post -Uri ($account.endpoint.TrimEnd('/') + "/sts/v1.0/issueToken") -Headers @{ Authorization = "Bearer $($entra.token)" } -ContentType "application/x-www-form-urlencoded" -Body ""
  $validity = "10 分有効"
} else {
  $token = "aad#$($account.id)#$($entra.token)"
  $validity = "有効期限 $($entra.expiresOn)"
}

if ($Raw) {
  $token
  exit 0
}
Set-Clipboard -Value $token
Write-Output "Speech トークン（$validity）をクリップボードにコピーしました。値は表示しません。"

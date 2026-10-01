<#
.SYNOPSIS
  セキュアな Web × ストレージ構成 (案 A) の Private Endpoint インフラを段階構築する。

.DESCRIPTION
  publicNetworkAccess=Disabled / 共有キー禁止のテナントで、Private Endpoint 経由アクセス +
  VNet 統合 Function App + linked backend を構築する。実値は引数または .env から取得する（固有名は含まない）。

  パラメータは references/.env.example 参照。-Stage で段階実行（ポリシー起因の失敗を切り分けるため推奨）。

  ⚠ ARM 書込に MFA 必須。事前に `. ./ensure_az_mfa.ps1 ; Assert-AzMfa -Interactive` で MFA を確保する。

.EXAMPLE
  ./setup_private_endpoint.ps1 -Stage 1 -Rg my-rg -Region japaneast -Vnet my-vnet `
     -DataStorage mydata -FuncStorage myfuncsa -FunctionApp myfunc -Frontend myswa
#>
param(
  [ValidateSet('1','2','3','4','5','6','7','8','all')] [string]$Stage = 'all',
  [string]$Rg           = $env:RG,
  [string]$Region       = $env:REGION,
  [string]$Vnet         = $env:VNET,
  [string]$PeSubnet     = ($env:PE_SUBNET   ?? 'snet-pe'),
  [string]$FuncSubnet   = ($env:FUNC_SUBNET ?? 'snet-func'),
  [string]$DataStorage  = $env:DATA_STORAGE,
  [string]$FuncStorage  = $env:FUNC_STORAGE,
  [string]$FunctionApp  = $env:FUNCTION_APP,
  [string]$Frontend     = $env:FRONTEND,
  [string]$DnsLink      = ($env:DNS_LINK ?? 'link-blob'),
  [string]$DnsZone      = 'privatelink.blob.core.windows.net'
)

$ErrorActionPreference = 'Stop'
try { $PSNativeCommandUseErrorActionPreference = $true } catch {}

foreach ($n in 'Rg','Region','Vnet','DataStorage','FuncStorage','FunctionApp','Frontend') {
  if (-not (Get-Variable $n -ValueOnly)) { throw "パラメータ -$n (または .env) が未設定です。" }
}

# MFA セッション確保（同ディレクトリの ensure_az_mfa.ps1）
. "$PSScriptRoot/ensure_az_mfa.ps1"; Assert-AzMfa

function Section($n, $t) { Write-Host "`n===== [Stage $n] $t =====" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  ✓ $m" -ForegroundColor Green }
# 関数引数は $Stage と大文字小文字で衝突しないよう $target を使う
function Should([string]$target) { return ($Stage -eq 'all' -or $Stage -eq $target) }

$dataId = az storage account show -n $DataStorage -g $Rg --query id -o tsv

if (Should '1') {
  Section 1 "サブネット ($Vnet)"
  az network vnet subnet create -g $Rg --vnet-name $Vnet -n $PeSubnet --address-prefixes 10.0.1.0/24 -o none
  az network vnet subnet update -g $Rg --vnet-name $Vnet -n $PeSubnet --private-endpoint-network-policies Disabled -o none
  az network vnet subnet create -g $Rg --vnet-name $Vnet -n $FuncSubnet --address-prefixes 10.0.2.0/24 --delegations Microsoft.App/environments -o none
  Ok "$PeSubnet / $FuncSubnet"
}

if (Should '2') {
  Section 2 'Private DNS zone + link'
  az network private-dns zone create -g $Rg -n $DnsZone -o none
  az network private-dns link vnet create -g $Rg -z $DnsZone -n $DnsLink -v $Vnet -e false -o none
  Ok 'DNS zone + link'
}

if (Should '3') {
  Section 3 "Private Endpoint -> $DataStorage (blob)"
  az network private-endpoint create -g $Rg -n pe-$DataStorage -l $Region --vnet-name $Vnet --subnet $PeSubnet `
    --private-connection-resource-id $dataId --group-id blob --connection-name conn-data -o none
  az network private-endpoint dns-zone-group create -g $Rg --endpoint-name pe-$DataStorage -n zg-blob `
    --private-dns-zone $DnsZone --zone-name blob -o none
  Ok 'PE + DNS zone group'
}

if (Should '4') {
  Section 4 "Backend storage + blob PE"
  az storage account create -n $FuncStorage -g $Rg -l $Region --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false -o none
  $funcId = az storage account show -n $FuncStorage -g $Rg --query id -o tsv
  az network private-endpoint create -g $Rg -n pe-$FuncStorage-blob -l $Region --vnet-name $Vnet --subnet $PeSubnet `
    --private-connection-resource-id $funcId --group-id blob --connection-name conn-func-blob -o none
  az network private-endpoint dns-zone-group create -g $Rg --endpoint-name pe-$FuncStorage-blob -n zg-blob `
    --private-dns-zone $DnsZone --zone-name blob -o none
  Ok 'backend storage + PE'
}

if (Should '5') {
  Section 5 'Function App (Flex Consumption, MI デプロイ認証)'
  # 共有キー禁止のため、deployment 認証を作成時に MI 指定（後付けは Kudu に反映されない）
  az functionapp create -n $FunctionApp -g $Rg --storage-account $FuncStorage --flexconsumption-location $Region `
    --runtime node --runtime-version 20 --vnet $Vnet --subnet $FuncSubnet `
    --deployment-storage-auth-type SystemAssignedIdentity --assign-identity '[system]' -o none
  Ok "Function App $FunctionApp"
}

if (Should '6') {
  Section 6 'RBAC (MI -> Storage Blob Data Contributor)'
  $mi = az functionapp identity show -n $FunctionApp -g $Rg --query principalId -o tsv
  if (-not $mi) { throw 'MI principalId 取得失敗 (Stage 5 未完?)' }
  $funcId = az storage account show -n $FuncStorage -g $Rg --query id -o tsv
  foreach ($s in @($dataId, $funcId)) {
    az role assignment create --assignee-object-id $mi --assignee-principal-type ServicePrincipal --role 'Storage Blob Data Contributor' --scope $s -o none
  }
  Ok "RBAC ($mi)"
}

if (Should '7') {
  Section 7 'App settings'
  az functionapp config appsettings set -n $FunctionApp -g $Rg --settings `
    "STORAGE_ACCOUNT_NAME=$DataStorage" "AzureWebJobsStorage__accountName=$FuncStorage" -o none
  Ok 'STORAGE_ACCOUNT_NAME / AzureWebJobsStorage(MI)'
  Write-Host "  … 認証系シークレットは Key Vault 参照で設定してください（実値をコミット・出力しない）" -ForegroundColor Yellow
}

if (Should '8') {
  Section 8 'Frontend linked backend'
  $funcRes = az functionapp show -n $FunctionApp -g $Rg --query id -o tsv
  az staticwebapp backends link -n $Frontend -g $Rg --backend-resource-id $funcRes --backend-region $Region -o none
  Ok "linked backend ($Frontend -> $FunctionApp)"
}

Write-Host "`n完了。次: アプリコードを CI(deploy_functionapp.yml)からデプロイし、検証する。" -ForegroundColor Green

<#
.SYNOPSIS
  Azure CLI の MFA 認証済みセッションを確保する（ARM 書込に MFA 必須のテナント向け）。

.DESCRIPTION
  一部テナントは ARM の write/delete に MFA を要求する Conditional Access / Azure Policy を持つ。
  通常の `az login` は SSO キャッシュを再利用し MFA クレーム(amr=mfa)を持たないトークンになるため、
  書込が RequestDisallowedByAzure で拒否される。
  このスクリプトは:
    1. management スコープのアクセストークンをデコードし amr に MFA があるか判定。
    2. MFA 済みなら何もしない（キャッシュ再利用）。
    3. 未 MFA なら claims-challenge(p1) を付与して MFA を強制する `az login` を実行。

  実値・固有名は含まない。汎用スクリプト。

.EXAMPLE
  . ./ensure_az_mfa.ps1 ; Assert-AzMfa            # MFA 済みセッションを保証（必要時のみ再ログイン）
  . ./ensure_az_mfa.ps1 ; Assert-AzMfa -Interactive
#>

$script:MgmtScope = 'https://management.core.windows.net//.default'
# {"access_token":{"acrs":{"essential":true,"values":["p1"]}}} を base64url 化したもの（MFA 強制）
$script:P1Challenge = 'eyJhY2Nlc3NfdG9rZW4iOnsiYWNycyI6eyJlc3NlbnRpYWwiOnRydWUsInZhbHVlcyI6WyJwMSJdfX19'

function Test-AzMfa {
  <# 現在のトークンが MFA 済みなら $true #>
  try {
    $tok = az account get-access-token --scope $script:MgmtScope --query accessToken -o tsv 2>$null
    if (-not $tok) { return $false }
    $parts = $tok.Split('.')
    if ($parts.Count -lt 2) { return $false }
    $p = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($p.Length % 4) { 2 { $p += '==' } 3 { $p += '=' } }
    $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json
    $amr = @($json.amr)
    return ($amr -contains 'mfa' -or $amr -contains 'rsa' -or $amr -contains 'ngcmfa' -or $amr -contains 'fido')
  } catch {
    return $false
  }
}

function Assert-AzMfa {
  <#
    MFA 済みセッションを保証する。
    - MFA 済み → 無言でキャッシュ再利用（ダイアログを出さない）。
    - 未 MFA(amr=pwd) → 既定ではダイアログを出さず案内して停止。-Interactive 指定時のみ MFA 強制ログイン。
  #>
  param([switch]$Interactive)

  if (Test-AzMfa) {
    $u = az account show --query "user.name" -o tsv 2>$null
    Write-Host "✓ MFA 済みトークンをキャッシュ再利用 ($u)" -ForegroundColor Green
    return
  }

  if (-not $Interactive) {
    throw @'
現在のログインは MFA 未認証 (amr=pwd) です。Azure の書込には MFA が必須です。
対処:
  1) アカウントに MFA が未登録なら https://aka.ms/mfasetup で登録。
  2) MFA を実際に完了してログイン:
       . ./ensure_az_mfa.ps1 ; Assert-AzMfa -Interactive
'@
  }

  Write-Host "… MFA 強制ログインを行います (ブラウザで MFA を完了してください)..." -ForegroundColor Yellow
  az login --scope $script:MgmtScope --claims-challenge $script:P1Challenge --only-show-errors -o none
  if (-not (Test-AzMfa)) {
    throw 'MFA トークンを取得できませんでした。アカウントに MFA が未登録の可能性があります (https://aka.ms/mfasetup)。'
  }
  $u = az account show --query "user.name" -o tsv 2>$null
  Write-Host "✓ MFA ログイン完了 ($u)" -ForegroundColor Green
}

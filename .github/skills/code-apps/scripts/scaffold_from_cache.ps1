#requires -Version 5.1
<#
.SYNOPSIS
  リモートのゴールデンキャッシュ（GitHub Release の node_modules アーカイブ）から
  node_modules を取得し、新規 Code Apps プロジェクトの npm install を高速化する
  （SKILL.md Step 0 の代替）。

.DESCRIPTION
  ローカルには何も永続化しない。scaffold のたびに以下を行う:
  1. GitHub Release（geekfujiwara/CodeAppsDevelopmentStandard, タグ code-apps-template-cache-vite）から
     node_modules-vite.tar.gz + package-lock.json を一時ディレクトリへダウンロード。
  2. tar でプロジェクトへ直接展開。
  3. プロジェクトの package.json との差分を npm ci（失敗時は npm install）で解消。
  4. 一時ファイルを削除（ローカルにキャッシュを残さない）。
  5. ダウンロードに失敗した場合（オフライン・リリース未作成等）は
     通常の npm install --no-audit --no-fund に全面フォールバックする。

.PARAMETER ProjectDir
  scaffold 先のプロジェクトディレクトリ（package.json が既に存在すること）。

.PARAMETER ReleaseRepo
  リモートゴールデンキャッシュを公開している GitHub リポジトリ。

.PARAMETER ReleaseTag
  リリースタグ名。
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectDir,
  [string]$ReleaseRepo = "geekfujiwara/CodeAppsDevelopmentStandard",
  [string]$ReleaseTag = "code-apps-template-cache-vite"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path (Join-Path $ProjectDir "package.json"))) {
  Write-Error "package.json が見つかりません（先にテンプレート scaffold を実行してください）: $ProjectDir"
  exit 1
}

function Invoke-FallbackInstall {
  param([string]$Reason)
  Write-Warning "$Reason 通常の npm install にフォールバックします。"
  Push-Location $ProjectDir
  try { npm install --no-audit --no-fund } finally { Pop-Location }
}

$tmpDir = Join-Path $env:TEMP "code-apps-tpl-cache-$([guid]::NewGuid())"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

try {
  $archiveUrl = "https://github.com/$ReleaseRepo/releases/download/$ReleaseTag/node_modules-vite.tar.gz"
  $lockUrl = "https://github.com/$ReleaseRepo/releases/download/$ReleaseTag/package-lock.json"
  $archivePath = Join-Path $tmpDir "node_modules-vite.tar.gz"
  $lockPath = Join-Path $tmpDir "package-lock.json"

  Write-Output "リモートゴールデンキャッシュを取得します: $archiveUrl"
  try {
    Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath -UseBasicParsing
    Invoke-WebRequest -Uri $lockUrl -OutFile $lockPath -UseBasicParsing
  }
  catch {
    Invoke-FallbackInstall "リモートゴールデンキャッシュのダウンロードに失敗しました（$_）。"
    return
  }

  Write-Output "node_modules を展開します: $ProjectDir"
  tar -xzf $archivePath -C $ProjectDir
  if ($LASTEXITCODE -ne 0) {
    Invoke-FallbackInstall "アーカイブの展開に失敗しました。"
    return
  }

  Copy-Item $lockPath (Join-Path $ProjectDir "package-lock.json") -Force

  Push-Location $ProjectDir
  try {
    # プロジェクトの package.json がスナップショットと一致していれば npm ci が瞬時に完了する
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "npm ci が失敗しました（プロジェクトの package.json がスナップショットと異なる可能性）。npm install にフォールバックします。"
      npm install --no-audit --no-fund
    }
  }
  finally {
    Pop-Location
  }

  Write-Output "scaffold 完了（リモートキャッシュ利用）: $ProjectDir"
}
finally {
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}

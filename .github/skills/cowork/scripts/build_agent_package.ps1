<#
.SYNOPSIS
  Cowork プラグイン（M365 アプリパッケージ）の .zip を生成する汎用ビルドスクリプト。

.DESCRIPTION
  対象プラグインフォルダの manifest.json 内プレースホルダー __COWORK_OAUTH_REGISTRATION_ID__ を
  .env の COWORK_OAUTH_REGISTRATION_ID に置換し、必須ファイルを検証してから .zip を生成する。
  manifest.json 本体（source）はプレースホルダーのまま維持し、ビルド成果物にのみ実値を注入する
  （実 registration ID を source にコミットしないため）。

  .env の値は '...' / "..." で囲まれていても自動で引用符を取り除く（教訓: 引用符付きのまま
  注入すると referenceId が壊れ、Cowork 初回同意時にコネクタ認証が失敗する）。

.PARAMETER PluginRoot
  プラグインのルートフォルダ（manifest.json・color.png・outline.png・skills/ を含む）。

.PARAMETER EnvPath
  .env のパス。省略時は PluginRoot から上位ディレクトリを遡って最初に見つかった .env を使う。

.PARAMETER OutputName
  生成する .zip のファイル名（拡張子なし）。省略時は PluginRoot フォルダ名。

.EXAMPLE
  pwsh build_agent_package.ps1 -PluginRoot ./cowork/my-plugin
#>
param(
    [Parameter(Mandatory = $true)][string]$PluginRoot,
    [string]$EnvPath,
    [string]$OutputName
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path $PluginRoot
if (-not $OutputName) { $OutputName = Split-Path $root -Leaf }

# --- .env を探索（PluginRoot から上位へ遡る）---
if (-not $EnvPath) {
    $dir = $root
    while ($dir -and -not (Test-Path (Join-Path $dir ".env"))) {
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { $dir = $null; break }
        $dir = $parent
    }
    if ($dir) { $EnvPath = Join-Path $dir ".env" }
}
if (-not $EnvPath -or -not (Test-Path $EnvPath)) {
    Write-Error ".env が見つかりません（-EnvPath で明示指定してください）。"
}

# --- .env から登録 ID を読む（引用符は自動で除去）---
$regId = $null
foreach ($line in Get-Content $EnvPath) {
    if ($line -match '^\s*COWORK_OAUTH_REGISTRATION_ID\s*=\s*(.+?)\s*$') {
        $regId = $Matches[1].Trim("'", '"')
    }
}
if ([string]::IsNullOrWhiteSpace($regId)) {
    Write-Error "COWORK_OAUTH_REGISTRATION_ID が .env にありません。Teams 開発者ポータルで OAuth client registration を作成し、発行された ID を .env に設定してください。"
}

# --- manifest.json の referenceId を注入（一時ファイルに書き出し、元は placeholder のまま維持）---
$manifestSrc = Join-Path $root "manifest.json"
if (-not (Test-Path $manifestSrc)) { Write-Error "manifest.json が見つかりません: $manifestSrc" }
$manifest = Get-Content $manifestSrc -Raw
if ($manifest -notmatch "__COWORK_OAUTH_REGISTRATION_ID__") {
    Write-Warning "manifest.json にプレースホルダー __COWORK_OAUTH_REGISTRATION_ID__ が見つかりません。referenceId が既に実値埋め込みの可能性があります。"
}
$built = $manifest -replace "__COWORK_OAUTH_REGISTRATION_ID__", $regId
$builtManifest = Join-Path $root "manifest.built.json"
Set-Content -Path $builtManifest -Value $built -Encoding UTF8

# --- 検証: 必須ファイル ---
$required = @("color.png", "outline.png", "dataverse-mcp-tools.json")
foreach ($f in $required) {
    if (-not (Test-Path (Join-Path $root $f))) { Write-Error "必須ファイルが見つかりません: $f" }
}
$skillsDir = Join-Path $root "skills"
if (-not (Test-Path $skillsDir)) { Write-Error "skills フォルダが見つかりません: $skillsDir" }
$skills = Get-ChildItem $skillsDir -Directory
foreach ($s in $skills) {
    if (-not (Test-Path (Join-Path $s.FullName "SKILL.md"))) { Write-Error "SKILL.md が見つかりません: $($s.Name)" }
}

# --- zip 生成（manifest.built.json を manifest.json 名でルートに入れる）---
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$zip = Join-Path $dist "$OutputName.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

$staging = Join-Path $env:TEMP ("cowork_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $staging | Out-Null
Copy-Item $builtManifest (Join-Path $staging "manifest.json")
Copy-Item (Join-Path $root "color.png") $staging
Copy-Item (Join-Path $root "outline.png") $staging
Copy-Item (Join-Path $root "dataverse-mcp-tools.json") $staging
Copy-Item $skillsDir $staging -Recurse

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zip -Force
Remove-Item $staging -Recurse -Force
Remove-Item $builtManifest -Force

Write-Host "[OK] パッケージ生成: $zip"
Write-Host "     referenceId 注入済み (registrationId=$regId)"
Write-Host "     次: M365 管理センター -> エージェント -> Add agent -> Upload agent"

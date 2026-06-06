# spec-to-markdown Windows セットアップ & 実行スクリプト
# 使い方: powershell -ExecutionPolicy Bypass -File run_windows.ps1 [引数...]
# 既定: work/input -> work/staging + work/docs

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PassThru
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $ScriptDir

try {
    $pythonVersion = & python --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Python が見つかりません。https://www.python.org/ からインストールしてください。"
        exit 1
    }
    Write-Host "✅ $pythonVersion" -ForegroundColor Green

    if (-not (Test-Path ".venv")) {
        Write-Host "📦 仮想環境を作成しています..." -ForegroundColor Cyan
        & python -m venv .venv
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    Write-Host "📦 依存パッケージを確認しています..." -ForegroundColor Cyan
    & .\.venv\Scripts\pip install --quiet -r requirements.txt
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "🚀 変換を開始します..." -ForegroundColor Cyan
    if ($PassThru) {
        & .\.venv\Scripts\python convert_documents.py @PassThru
    } else {
        & .\.venv\Scripts\python convert_documents.py
    }
    exit $LASTEXITCODE

} finally {
    Pop-Location
}

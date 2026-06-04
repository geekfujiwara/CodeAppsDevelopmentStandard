# spec-to-markdown Windows セットアップ & 実行スクリプト
# 使い方: powershell -ExecutionPolicy Bypass -File run_windows.ps1 [引数...]
# 例: powershell -ExecutionPolicy Bypass -File run_windows.ps1 --input C:\Users\user\Documents\specs

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PassThru
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $ScriptDir

try {
    # Python バージョン確認
    $pythonVersion = & python --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Python が見つかりません。https://www.python.org/ からインストールしてください。"
        exit 1
    }
    Write-Host "✅ $pythonVersion" -ForegroundColor Green

    # venv 作成（初回のみ）
    if (-not (Test-Path ".venv")) {
        Write-Host "📦 仮想環境を作成しています..." -ForegroundColor Cyan
        & python -m venv .venv
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    # パッケージインストール
    Write-Host "📦 依存パッケージをインストールしています..." -ForegroundColor Cyan
    & .\.venv\Scripts\pip install --quiet -r requirements.txt
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    # スクリプト実行（引数をそのまま渡す）
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

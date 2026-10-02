# Cowork Studio を 1 ファイルの exe に書き出す（.NET ランタイム同梱。利用者の PC にインストール不要）。
# 使い方: pwsh .github/skills/cowork/tools/cowork-studio/build.ps1 [-Out <出力フォルダ>]
param([string]$Out = (Join-Path $PSScriptRoot 'publish'))
$ErrorActionPreference = 'Stop'
dotnet publish (Join-Path $PSScriptRoot 'CoworkStudio.csproj') -c Release -o $Out -nologo
if ($LASTEXITCODE -ne 0) { throw "dotnet publish に失敗しました（.NET 8 SDK が必要）" }
$exe = Join-Path $Out 'CoworkStudio.exe'
if (-not (Test-Path $exe)) { throw "exe がありません: $exe" }
# 起動・検出・検証が通ることを画面なしで確かめる
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..\..')).Path
$report = Join-Path ([IO.Path]::GetTempPath()) 'cowork-studio-selftest.json'
$p = Start-Process $exe -ArgumentList '--root', $root, '--no-refresh', '--selftest', $report -PassThru
if (-not $p.WaitForExit(60000)) { $p.Kill(); throw "自己テストが終わりません" }
if ($p.ExitCode -ne 0) { throw "自己テストが失敗しました（exit $($p.ExitCode)）" }
$r = Get-Content $report -Raw -Encoding utf8 | ConvertFrom-Json
Remove-Item $report
Write-Host ("OK: {0}（{1:N1} MB）· プラグイン {2} 件" -f $exe, ((Get-Item $exe).Length / 1MB), @($r.plugins).Count)

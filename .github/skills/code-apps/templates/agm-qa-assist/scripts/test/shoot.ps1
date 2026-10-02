# ホスト再現（Code Apps 既定 CSP）で配信中のアプリを、ヘッドレス Edge の仮想時間で進めて画面を撮る。
# 使い方: powershell -File scripts/test/shoot.ps1 -Name ut01 -Budgets 9000,20000,60000
param(
  [string]$Url = "http://localhost:4173/#/cockpit",
  [string]$Name = "shot",
  [int[]]$Budgets = @(60000),
  [string]$Size = "1920,1080",
  [string]$OutDir = ".screens"
)
$ErrorActionPreference = "Stop"
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
New-Item -ItemType Directory -Force $OutDir | Out-Null
foreach ($budget in $Budgets) {
  $out = Join-Path (Resolve-Path $OutDir).Path "$Name-$budget.png"
  Remove-Item $out -ErrorAction SilentlyContinue
  $ud = Join-Path $env:TEMP ("agm-shot-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  Start-Process -FilePath $edge -WindowStyle Hidden -ArgumentList @("--headless=new", "--user-data-dir=$ud", "--no-first-run", "--window-size=$Size", "--virtual-time-budget=$budget", "--screenshot=$out", $Url) | Out-Null
  for ($i = 0; $i -lt 60 -and -not (Test-Path $out); $i++) { Start-Sleep -Seconds 2 }
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$ud*" } | ForEach-Object { try { [Diagnostics.Process]::GetProcessById([int]$_.ProcessId).Kill() } catch { } }
  Start-Sleep -Seconds 1
  Remove-Item $ud -Recurse -Force -ErrorAction SilentlyContinue
  Write-Output ("{0}: {1}" -f $out, $(if (Test-Path $out) { "OK" } else { "撮れませんでした" }))
}

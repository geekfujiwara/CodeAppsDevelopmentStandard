param(
  [string]$Url = "http://127.0.0.1:4174/",
  [int]$Seconds = 40,
  # 疑似マイクとして流す WAV（16 kHz / 16 bit / mono 推奨）
  [Parameter(Mandatory = $true)][string]$Wav,
  # ユーザー操作（クリック）があった状態を模擬する。付けないと AudioContext が開始しない状態を再現できる
  [switch]$SimulateGesture,
  # Console から抽出する接頭辞（アプリのログ規約。references/device-media.md §6）
  [string]$LogPrefix = "[APP",
  [string]$OutFile = "headless-console.log"
)
# ヘッドレス Edge で疑似マイクを使ってアプリを動かし、Console ログを抽出する（ローカル検証専用）
# 注意:
# - msedge.exe は起動後に親から切り離されるため、標準出力・標準エラーのリダイレクトでは何も取れない。
#   --enable-logging でユーザー データ フォルダーの chrome_debug.log に出し、それを読む
# - --dump-dom はページ読み込み直後に終了するため、録音や認識の試験には使えない
# - 終了は起動時のプロセスだけでなく、同じユーザー データ フォルダーの子プロセスもすべて止める
#   （残ると CPU を使い続け、次の試験の音声処理が乱れて結果が崩れる）
$ErrorActionPreference = "Stop"
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge が見つかりません" }
$wavPath = (Resolve-Path $Wav).Path
$userData = Join-Path $env:TEMP ("headless-media-" + [guid]::NewGuid().ToString("N").Substring(0, 8))

$edgeArgs = @(
  "--headless=new", "--user-data-dir=$userData", "--no-first-run",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=$wavPath",
  "--enable-logging", "--v=0", "--remote-debugging-port=0")
if ($SimulateGesture) { $edgeArgs += "--autoplay-policy=no-user-gesture-required" }
$proc = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList ($edgeArgs + $Url)
Start-Sleep -Seconds $Seconds

function Get-TestProcesses { @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$userData*" }) }
# 親（--type の無いブラウザー プロセス）から止める。子から止めると親が作り直す
for ($i = 0; $i -lt 10 -and (Get-TestProcesses).Count -gt 0; $i++) {
  $all = Get-TestProcesses
  $ordered = @($all | Where-Object { $_.CommandLine -notmatch '--type=' }) + @($all | Where-Object { $_.CommandLine -match '--type=' })
  foreach ($p in $ordered) { try { [Diagnostics.Process]::GetProcessById([int]$p.ProcessId).Kill() } catch { } }
  Start-Sleep -Seconds 1
}
try { $proc.Kill() } catch { }
$remaining = (Get-TestProcesses).Count
if ($remaining -gt 0) { Write-Warning "ヘッドレス Edge が $remaining プロセス残っています。次の試験の前に停止してください" }

$log = Join-Path $userData "chrome_debug.log"
if (-not (Test-Path $log)) { throw "ログがありません: $log" }
$prefix = [regex]::Escape($LogPrefix)
$consoleLines = @(Get-Content $log -Encoding utf8 | Where-Object { $_ -match 'CONSOLE' })
$consoleLines |
  Where-Object { $_ -match $prefix } |
  ForEach-Object { ($_ -replace '^.*?CONSOLE:\d+\] ', '') -replace ', source: http.*$', '' } |
  Set-Content $OutFile -Encoding utf8
# アプリのログ接頭辞に関係なく、ブラウザ自身が出す CSP 違反を必ず数える（接頭辞で絞ると見落とす）
$cspLines = @($consoleLines | Where-Object { $_ -match 'Content Security Policy' } |
  ForEach-Object { (($_ -replace '^.*?CONSOLE:\d+\] ', '') -replace ', source: .*$', '') -replace "(data|blob):[^'`"\s]{24,}", '$1:…' } |
  ForEach-Object { $_.Substring(0, [Math]::Min(220, $_.Length)) } |
  Select-Object -Unique)
Remove-Item $userData -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "抽出: $OutFile（$((Get-Content $OutFile).Count) 行） / 残存プロセス: $remaining / CSP 違反: $($cspLines.Count)"
foreach ($line in $cspLines) { Write-Warning "CSP 違反: $line" }

# 台本（JSON: { "lines": [ { "text": "...", "voice": "Ichiro" } ] }）を Windows の音声（ローカル、クラウド不使用）で 1 本の WAV にする。
# ホスト再現テストの疑似マイク（code-apps の run_headless_media_test.ps1 -Wav）や verify_push_stream.mjs に使う。16 kHz / 16 bit / mono。
# voice は音声名の一部（Ayumi / Haruka / Ichiro / Sayaka など。省略時は最初の日本語の音声）。
# 使い方: powershell -ExecutionPolicy Bypass -File .github/skills/realtime-speech/scripts/synthesize_script_wav.ps1 -Script <script.json> -Out <out.wav> [-GapMs 900]
param(
  [Parameter(Mandatory = $true)][string]$Script,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$GapMs = 900,
  [int]$Rate = 0
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$lines = (Get-Content $Script -Raw -Encoding utf8 | ConvertFrom-Json).lines
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$installed = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq "ja-JP" } | ForEach-Object { $_.VoiceInfo.Name }
if (-not $installed) { throw "Windows に日本語の音声がありません（設定 > 時刻と言語 > 音声 で追加）" }
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile((Join-Path (Resolve-Path (Split-Path $Out)).Path (Split-Path $Out -Leaf)), $format)
$synth.Rate = $Rate
# 行ごとに SelectVoice して読む（PromptBuilder.StartVoice は OneCore の音声を選べず、英語の音声で読んでしまう）
$pause = { param($ms) $b = New-Object System.Speech.Synthesis.PromptBuilder; $b.AppendBreak([TimeSpan]::FromMilliseconds($ms)); $synth.Speak($b) }
$synth.SelectVoice(($installed | Select-Object -First 1))
& $pause 1500
foreach ($line in $lines) {
  $voice = $installed | Where-Object { $line.voice -and $_ -like "*$($line.voice)*" -and $_ -notlike "*Desktop*" } | Select-Object -First 1
  if (-not $voice) { $voice = $installed | Select-Object -First 1 }
  $synth.SelectVoice($voice)
  $synth.Speak($line.text)
  & $pause $GapMs
}
$synth.SetOutputToNull()
$synth.Dispose()
$bytes = (Get-Item $Out).Length
Write-Output ("{0}: {1:N0} バイト / 約 {2:N0} 秒（{3} 行）" -f $Out, $bytes, (($bytes - 44) / 32000), $lines.Count)

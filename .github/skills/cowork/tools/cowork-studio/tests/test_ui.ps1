# Cowork Studio の画面を UI Automation で操作して確かめる（変更系は計画の作成と破棄まで。承認・実行はしない）。
# 使い方: powershell -ExecutionPolicy Bypass -File test_ui.ps1 -Exe <CoworkStudio.exe> -Root <リポジトリ ルート> [-Shots <フォルダ>]
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$Shots = $env:TEMP
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
# 画面の座標を実ピクセルで扱う（Windows PowerShell 5.1 は DPI 非対応のため、撮影位置がずれる）
Add-Type -Namespace Native -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr value);'
[Native.Dpi]::SetProcessDpiAwarenessContext([System.IntPtr](-4)) | Out-Null
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$results = New-Object System.Collections.Generic.List[object]

function Check($id, $ok, $detail) {
    $results.Add([pscustomobject]@{ id = $id; ok = [bool]$ok; detail = "$detail" })
    $mark = if ($ok) { 'OK ' } else { 'NG ' }
    Write-Host ("{0}{1}: {2}" -f $mark, $id, $detail)
}

function Start-Studio([string]$select) {
    $p = Start-Process $Exe -ArgumentList '--root', $Root, '--workspace', 'pipeline', '--no-refresh', '--select', $select -PassThru
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        $p.Refresh()
        if ($p.MainWindowHandle -ne 0) { break }
    }
    Start-Sleep -Seconds 2
    return @{ Process = $p; Window = $AE::FromHandle($p.MainWindowHandle) }
}

function Find-ByName($win, [string]$name) {
    $cond = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $name)
    return $win.FindFirst($TS::Descendants, $cond)
}

function Find-TextContaining($win, [string]$fragment) {
    $all = $win.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $all) { if ($e.Current.Name -like "*$fragment*") { return $e } }
    return $null
}

function Invoke-Button($win, [string]$name) {
    $b = Find-ByName $win $name
    if ($null -eq $b) { return $false }
    $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    return $true
}

function Wait-Until([scriptblock]$probe, [int]$seconds) {
    for ($i = 0; $i -lt $seconds * 2; $i++) {
        $r = & $probe
        if ($r) { return $r }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Save-Shot($proc, [string]$path) {
    $rect = $AE::FromHandle($proc.MainWindowHandle).Current.BoundingRectangle
    $bmp = New-Object System.Drawing.Bitmap([int]$rect.Width, [int]$rect.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen([int]$rect.X, [int]$rect.Y, 0, 0, $bmp.Size)
    $bmp.Save($path)
    $g.Dispose(); $bmp.Dispose()
}

function Close-Studio($s) {
    try { $s.Window.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close() } catch {}
    if (-not $s.Process.WaitForExit(10000)) { $s.Process.Kill() }
}

# 1. OAuth 登録: 計画を作る → 同じ登録があるので重複防止で止まる
$s = Start-Studio 'step:4'
try {
    Check 'window' ($null -ne $s.Window) $s.Window.Current.Name
    Check 'oauth-inspector' ($null -ne (Find-ByName $s.Window '計画を作る')) 'OAuth 登録のインスペクターに「計画を作る」'
    Invoke-Button $s.Window '計画を作る' | Out-Null
    $guard = Wait-Until { Find-TextContaining $s.Window '既にあります' } 120
    Check 'oauth-duplicate-guard' ($null -ne $guard) $(if ($guard) { $guard.Current.Name } else { '表示されない' })
    $approve = Find-ByName $s.Window '承認して実行'
    Check 'oauth-no-approve' ($null -eq $approve) '重複のときは承認ボタンを出さない'
}
finally { Close-Studio $s }

# 2. 個人インストール: 計画を作る → 承認カード（PLAN_HASH）→ 破棄
$s = Start-Studio 'step:6'
try {
    Invoke-Button $s.Window 'インストールの計画' | Out-Null
    $approve = Wait-Until { Find-ByName $s.Window '承認して実行' } 120
    Check 'install-plan-card' ($null -ne $approve) '承認カードに「承認して実行」'
    $hash = Find-TextContaining $s.Window 'PLAN_HASH'
    Check 'install-plan-hash' ($null -ne $hash) $(if ($hash) { $hash.Current.Name.Substring(0, [Math]::Min(40, $hash.Current.Name.Length)) } else { 'なし' })
    Save-Shot $s.Process (Join-Path $Shots 'ui-plan.png')
    Invoke-Button $s.Window '破棄' | Out-Null
    $gone = Wait-Until { if ($null -eq (Find-ByName $s.Window '承認して実行')) { $true } } 10
    Check 'install-plan-discard' $gone '破棄で承認カードが消える'
}
finally { Close-Studio $s }

$failed = @($results | Where-Object { -not $_.ok }).Count
Write-Host ("{0}/{1} passed" -f ($results.Count - $failed), $results.Count)
exit $failed

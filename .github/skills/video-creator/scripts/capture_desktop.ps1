param(
    [ValidatePattern('^[a-z0-9-]+-v[0-9]+$')]
    [string]$Name = 'vscode-v1',
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceTitle,
    [string]$Project = '.',
    [ValidateRange(0, 600)]
    [int]$RecordingSeconds = 0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
if (-not ('VideoDesktopCapture' -as [type])) {
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VideoDesktopCapture {
    [StructLayout(LayoutKind.Sequential)]
    public struct Bounds { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Bounds bounds);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr target, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
}

$window = Get-Process Code | Where-Object {
    $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle.Contains($WorkspaceTitle)
} | Select-Object -First 1
if (-not $window) { throw 'The target VS Code workspace window is not open.' }
[void][VideoDesktopCapture]::SetThreadDpiAwarenessContext([IntPtr](-4))
[void][VideoDesktopCapture]::SetForegroundWindow($window.MainWindowHandle)
if ([VideoDesktopCapture]::GetForegroundWindow() -ne $window.MainWindowHandle) {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.AppActivate($window.Id)
    [void][VideoDesktopCapture]::SetForegroundWindow($window.MainWindowHandle)
}
$foreground = [VideoDesktopCapture]::GetForegroundWindow() -eq $window.MainWindowHandle
$bounds = New-Object VideoDesktopCapture+Bounds
if (-not [VideoDesktopCapture]::GetWindowRect($window.MainWindowHandle, [ref]$bounds)) {
    throw 'Could not read the VS Code window bounds.'
}
$width = $bounds.Right - $bounds.Left
$height = $bounds.Bottom - $bounds.Top
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    if ($foreground) {
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
    } else {
        $device = $graphics.GetHdc()
        try {
            if (-not [VideoDesktopCapture]::PrintWindow($window.MainWindowHandle, $device, 2)) {
                throw 'The target VS Code window could not be captured. No desktop fallback is allowed.'
            }
        } finally {
            $graphics.ReleaseHdc($device)
        }
    }
    $capture = Join-Path ([System.IO.Path]::GetFullPath($Project)) 'capture'
    [void][System.IO.Directory]::CreateDirectory($capture)
    $path = Join-Path $capture "$Name.png"
    if (Test-Path -LiteralPath $path) { throw 'Use a new capture name; existing sources are not overwritten.' }
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    @{ file = $path; width = $width; height = $height; source = 'Actual VS Code desktop window' } | ConvertTo-Json
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}
if ($RecordingSeconds -gt 0) {
    if (-not $foreground) { throw 'Bring VS Code to the foreground before recording. Only the still was captured.' }
    $ffmpeg = python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
    if ($LASTEXITCODE -ne 0) { throw 'The existing imageio-ffmpeg installation is required.' }
    $recording = Join-Path $capture "$Name.mp4"
    if (Test-Path -LiteralPath $recording) { throw 'Use a new recording name; existing sources are not overwritten.' }
    & $ffmpeg -v error -f gdigrab -framerate 15 -draw_mouse 0 -i "title=$($window.MainWindowTitle)" -t $RecordingSeconds -an -c:v libx264 -preset veryfast -crf 18 $recording
    if ($LASTEXITCODE -ne 0) { throw 'Actual VS Code desktop recording failed.' }
    @{ recording = $recording; seconds = $RecordingSeconds; fps = 15; source = 'Actual VS Code desktop capture' } | ConvertTo-Json
}
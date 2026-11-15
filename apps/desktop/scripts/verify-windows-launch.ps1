# Only run against the temporary installation on a disposable Windows CI runner.
param([Parameter(Mandatory = $true)][string]$Executable)
$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'GUI smoke test is restricted to disposable CI runners' }
if (-not $env:RUNNER_TEMP) { throw 'GUI smoke test requires RUNNER_TEMP' }
$resolved = (Resolve-Path -LiteralPath $Executable).Path
$temporaryRoot = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path.TrimEnd('\', '/') + '\'
if (-not $resolved.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Expected an installation under RUNNER_TEMP'
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StarlightWindowsProbe {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AttachConsole(uint processId);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@

$app = $null
$dataDirectory = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'org.starlightplayer.desktop.preview'
$preferencesFile = Join-Path $dataDirectory 'desktop-v1.json'
# A fresh profile lets the UI's first preferences save prove that both React and
# the native host are ready. Never overwrite or remove a developer's saved data.
if (Test-Path -LiteralPath $preferencesFile) { throw 'Expected a fresh CI application profile' }
$window = [IntPtr]::Zero
function Assert-RelaunchRestores([string]$LaunchPath, [string]$Label) {
    $secondary = $null
    $savedPreferences = (Get-FileHash -LiteralPath $preferencesFile -Algorithm SHA256).Hash
    try {
        $secondary = Start-Process -FilePath $LaunchPath -WorkingDirectory (Split-Path $resolved) -PassThru
        if ($null -eq $secondary) { throw "$Label did not return a launch process" }
        if (-not $secondary.WaitForExit(15000)) { throw "$Label left a second application running" }
        if ($secondary.ExitCode -ne 0) { throw "$Label failed with exit code $($secondary.ExitCode)" }
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        $restored = $false
        do {
            Start-Sleep -Milliseconds 100
            $app.Refresh()
            if ($app.HasExited) { throw "$Label terminated the original process" }
            [uint32]$foregroundProcess = 0
            [void][StarlightWindowsProbe]::GetWindowThreadProcessId(
                [StarlightWindowsProbe]::GetForegroundWindow(), [ref]$foregroundProcess)
            $restored = [StarlightWindowsProbe]::IsWindowVisible($window) -and
                -not [StarlightWindowsProbe]::IsIconic($window) -and
                $foregroundProcess -eq $app.Id
        } while (-not $restored -and [DateTime]::UtcNow -lt $deadline)
        if (-not $restored) { throw "$Label did not restore and foreground the original window" }
        if ($app.MainWindowHandle -ne $window) { throw "$Label replaced the original main window" }
        if ((Get-FileHash -LiteralPath $preferencesFile -Algorithm SHA256).Hash -ne $savedPreferences) {
            throw "$Label unexpectedly changed saved tasks/preferences"
        }
        $starts = @(Get-Content -LiteralPath (Join-Path $dataDirectory 'playback.jsonl') |
            ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.kind -eq 'host-start' })
        if ($starts.Count -ne 1) { throw "$Label reinitialized the playback host" }
        Write-Output "PASS $Label restores original foreground window; PID=$($app.Id); no host restart"
    } finally {
        if ($null -ne $secondary) {
            $secondary.Refresh()
            if (-not $secondary.HasExited) {
                $secondary.Kill($true)
                [void]$secondary.WaitForExit(10000)
            }
            $secondary.Dispose()
        }
    }
}

function Hide-OriginalWindow {
    if (-not [StarlightWindowsProbe]::PostMessage($window, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
        throw 'Could not send WM_CLOSE to the release GUI'
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 250
        $app.Refresh()
        if ($app.HasExited) { throw "Closing the GUI unexpectedly terminated the application: $($app.ExitCode)" }
        $visible = [StarlightWindowsProbe]::IsWindowVisible($window)
    } while ($visible -and [DateTime]::UtcNow -lt $deadline)
    if ($visible) { throw 'GUI did not hide on close' }
}

try {
    # Detach this probe, so a successful AttachConsole below can only mean the
    # application owns/uses a console. Keep stdout/stderr pipes for CI reporting.
    [void][StarlightWindowsProbe]::FreeConsole()
    $app = Start-Process -FilePath $resolved -WorkingDirectory (Split-Path $resolved) -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    $ready = $false
    do {
        Start-Sleep -Milliseconds 250
        $app.Refresh()
        if ($app.HasExited) { throw "Release GUI exited during startup: $($app.ExitCode)" }
        $window = $app.MainWindowHandle
        if ($window -ne [IntPtr]::Zero -and (Test-Path -LiteralPath $preferencesFile)) {
            # The actor saves by rename, so readers never observe partial JSON.
            $saved = Get-Content -LiteralPath $preferencesFile -Raw | ConvertFrom-Json
            $ready = $saved.preferences.initialized -eq $true
            if ($ready -and $saved.preferences.closeToBackground -ne $true) {
                throw 'Fresh installation did not enable background mode'
            }
        }
    } while (-not $ready -and [DateTime]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'Release UI/native IPC did not become ready within 45 seconds' }
    Write-Output "PASS installed release UI/native IPC ready; window=$window title=$($app.MainWindowTitle)"

    $attached = [StarlightWindowsProbe]::AttachConsole([uint32]$app.Id)
    $attachError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($attached) {
        [void][StarlightWindowsProbe]::FreeConsole()
        throw 'Release GUI is attached to a console'
    }
    # ERROR_INVALID_HANDLE means the target process has no console.
    if ($attachError -ne 6) { throw "Console check inconclusive: Win32 error $attachError" }
    Write-Output 'PASS installed release GUI starts and has no console'

    # Exercise the real CloseRequested handler with default background mode.
    Hide-OriginalWindow
    Start-Sleep -Seconds 2
    $app.Refresh()
    if ($app.HasExited) { throw 'Background application exited after hiding' }
    Write-Output 'PASS installed release GUI closes to background and remains alive'

    Assert-RelaunchRestores $resolved 'EXE relaunch while hidden'
    # Exercise a real shell shortcut without touching the user's Desktop/taskbar.
    $shortcutPath = Join-Path (Split-Path $resolved) 'Starlight activation test.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $resolved
    $shortcut.WorkingDirectory = Split-Path $resolved
    $shortcut.Save()
    Hide-OriginalWindow
    Assert-RelaunchRestores $shortcutPath 'Shortcut relaunch while hidden'

    # WM_SYSCOMMAND / SC_MINIMIZE: the window still exists, unlike a cold start.
    if (-not [StarlightWindowsProbe]::PostMessage($window, 0x0112, [IntPtr]0xF020, [IntPtr]::Zero)) {
        throw 'Could not minimize the release GUI'
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not [StarlightWindowsProbe]::IsIconic($window) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 100
    }
    if (-not [StarlightWindowsProbe]::IsIconic($window)) { throw 'GUI did not minimize' }
    Assert-RelaunchRestores $shortcutPath 'Shortcut relaunch while minimized'
    Assert-RelaunchRestores $shortcutPath 'Repeated shortcut relaunch while visible'
} catch {
    # Bounded, application-owned diagnostics only; do not dump runner environment.
    if ($null -ne $app) {
        $app.Refresh()
        Write-Output "GUI diagnostic: exited=$($app.HasExited) exitCode=$($app.ExitCode) window=$window title=$($app.MainWindowTitle)"
    }
    foreach ($name in @('desktop-v1.json', 'playback.jsonl')) {
        $path = Join-Path $dataDirectory $name
        if (Test-Path -LiteralPath $path) {
            Write-Output "GUI diagnostic: $name"
            Get-Content -LiteralPath $path -Tail 10 | Write-Output
        } else {
            Write-Output "GUI diagnostic: $name not created"
        }
    }
    throw
} finally {
    # Clean up only the process created by this test, never all app processes.
    if ($null -ne $app) {
        $app.Refresh()
        if (-not $app.HasExited) {
            $app.Kill($true)
            [void]$app.WaitForExit(10000)
        }
        $app.Dispose()
    }
}

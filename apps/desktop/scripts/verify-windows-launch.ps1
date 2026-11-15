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
}
'@

$app = $null
try {
    # Detach this probe, so a successful AttachConsole below can only mean the
    # application owns/uses a console. Keep stdout/stderr pipes for CI reporting.
    [void][StarlightWindowsProbe]::FreeConsole()
    $app = Start-Process -FilePath $resolved -WorkingDirectory (Split-Path $resolved) -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    $window = [IntPtr]::Zero
    do {
        Start-Sleep -Milliseconds 250
        $app.Refresh()
        if ($app.HasExited) { throw "Release GUI exited during startup: $($app.ExitCode)" }
        $window = $app.MainWindowHandle
    } while ($window -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline)
    if ($window -eq [IntPtr]::Zero) { throw 'No release GUI window appeared within 45 seconds' }

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
    if (-not [StarlightWindowsProbe]::PostMessage($window, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
        throw 'Could not send WM_CLOSE to the release GUI'
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 250
        $app.Refresh()
        if ($app.HasExited) { throw 'Closing the GUI unexpectedly terminated the application' }
        $visible = [StarlightWindowsProbe]::IsWindowVisible($window)
    } while ($visible -and [DateTime]::UtcNow -lt $deadline)
    if ($visible) { throw 'GUI did not hide on close' }
    Start-Sleep -Seconds 2
    $app.Refresh()
    if ($app.HasExited) { throw 'Background application exited after hiding' }
    Write-Output 'PASS installed release GUI closes to background and remains alive'
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

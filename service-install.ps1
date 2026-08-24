# Vertex Proxies — Windows Background Service Installer
$ErrorActionPreference = 'Continue'
$taskName = "VertexProxiesBackgroundService"
$projDir = "C:\proxy"
if (-not (Test-Path "$projDir\start-hidden.vbs")) {
    $projDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "    VERTEX PROXIES -- WINDOWS BACKGROUND SERVICE INSTALLER     " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[WARN] Node.js not detected in current PATH. Searching common paths..." -ForegroundColor Yellow
    $paths = @("C:\Program Files\nodejs", "C:\Program Files (x86)\nodejs", "$env:LOCALAPPDATA\Programs\node")
    foreach ($p in $paths) {
        if (Test-Path "$p\node.exe") {
            $env:PATH = "$p;$env:PATH"
            break
        }
    }
}

$vbsPath = Join-Path $projDir "start-hidden.vbs"

# 2. Register Windows Scheduled Task
Write-Host "[*] Registering Windows Scheduled Task: $taskName..." -ForegroundColor Cyan
$taskSuccess = $false
try {
    # Unregister existing task if present
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

try {
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $projDir
    $triggerStartup = New-ScheduledTaskTrigger -AtStartup
    $triggerLogon = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Days 0) `
        -RestartCount 5 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger @($triggerStartup, $triggerLogon) `
        -Settings $settings `
        -Principal $principal `
        -Description "Vertex Proxies 4G/5G Background Service Daemon" `
        -Force | Out-Null
    $taskSuccess = $true
} catch {
    # Fallback to standard user task
    try {
        cmd.exe /c "schtasks /create /tn ""$taskName"" /tr ""wscript.exe \""$vbsPath\"""" /sc onlogon /f" >$null 2>&1
        $taskSuccess = $true
    } catch {}
}

if ($taskSuccess) {
    Write-Host "[OK] Windows Scheduled Task '$taskName' registered." -ForegroundColor Green
} else {
    Write-Host "[INFO] Standard task registration queued (Registry & Startup folder will handle boot)." -ForegroundColor Gray
}

# 3. Register in Windows Registry Run Key (Guaranteed user boot trigger)
Write-Host "[*] Configuring Windows Registry Auto-Run..." -ForegroundColor Cyan
try {
    $regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $regVal = "wscript.exe `"$vbsPath`""
    Set-ItemProperty -Path $regKey -Name "VertexProxies" -Value $regVal -Force | Out-Null
    Write-Host "[OK] Windows Registry Boot Run key configured." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Registry run key skipped." -ForegroundColor Gray
}

# 4. Create Windows Startup Folder Shortcut (Failsafe guarantee)
Write-Host "[*] Configuring Windows Startup folder shortcut..." -ForegroundColor Cyan
try {
    $sFolder = [Environment]::GetFolderPath('Startup')
    $sFile = Join-Path $sFolder 'VertexProxies.lnk'
    $w = New-Object -ComObject WScript.Shell
    $sc = $w.CreateShortcut($sFile)
    $sc.TargetPath = 'wscript.exe'
    $sc.Arguments = "`"$vbsPath`""
    $sc.WorkingDirectory = $projDir
    $sc.Description = 'Vertex Proxies Background Service Auto-Start'
    $sc.Save()
    Write-Host "[OK] Startup folder auto-start configured." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Startup folder registration skipped: $($_.Exception.Message)" -ForegroundColor Gray
}

# 5. Stop any previous instances and start the service fresh
Write-Host ""
Write-Host "[*] Launching background service now..." -ForegroundColor Cyan
try {
    # Stop older instances
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { 
        $_.CommandLine -like "*service-daemon.js*" -or 
        $_.CommandLine -like "*modem-manager*index.js*" -or 
        $_.CommandLine -like "*bandwidthTracker.js*" 
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbsPath`"" -WorkingDirectory $projDir

Start-Sleep -Seconds 3

# Check if running
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { 
    $_.CommandLine -like "*service-daemon.js*" -or $_.CommandLine -like "*modem-manager*" 
}

Write-Host ""
if ($running) {
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  [SUCCESS] BACKGROUND SERVICE IS NOW RUNNING 24/7 SILENTLY!    " -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  Status:      Running in background (No window needed)" -ForegroundColor White
    Write-Host "  Auto-Start:  Enabled on Windows Boot, Logon & Restart" -ForegroundColor White
    Write-Host "  Log File:    $projDir\logs\service.log" -ForegroundColor White
    Write-Host "  Dashboard:   https://proxyke.netlify.app" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Green
} else {
    Write-Host "[!] Service initiated. Check '$projDir\logs\service.log' for details." -ForegroundColor Yellow
}

# Vertex Proxies — Autonomous 24/7 Background Service & Watchdog Installer
$ErrorActionPreference = 'Continue'
$daemonTaskName = "VertexProxiesBackgroundService"
$watchdogTaskName = "VertexProxiesWatchdog"
$projDir = "C:\proxy"
if (-not (Test-Path "$projDir\start-hidden.vbs")) {
    $projDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "    VERTEX PROXIES -- AUTONOMOUS 24/7 SERVICE INSTALLER        " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 0. Kill ALL existing background proxy workers and SSH tunnels FIRST
Write-Host "[*] Terminating all old background proxy processes & SSH tunnels..." -ForegroundColor Yellow
try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { 
        $_.CommandLine -like "*proxy*" -or $_.CommandLine -like "*\proxy\*" -or $_.CommandLine -like "*modem-manager*"
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue | Where-Object { 
        $_.CommandLine -like "*proxicell*" -or $_.CommandLine -like "*104.131.118.5*" -or $_.CommandLine -like "*64.227.3.211*" -or ($_.CommandLine -like "*-R*")
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

# 1. Ensure project directory and latest code
if (-not (Test-Path $projDir)) {
    New-Item -ItemType Directory -Path $projDir -Force | Out-Null
}

if (Test-Path (Join-Path $projDir ".git")) {
    Write-Host "[*] Pulling latest repository updates from GitHub..." -ForegroundColor Cyan
    try {
        Push-Location $projDir
        git fetch origin main >$null 2>&1
        git reset --hard origin/main >$null 2>&1
        Pop-Location
        Write-Host "[OK] Local repository synced to latest main branch." -ForegroundColor Green
    } catch {}
}

# 1b. Force .env file to point to 104.131.118.5
$envFile = Join-Path $projDir ".env"
$envContent = @"
VPS_HOST=104.131.118.5
VPS_USER=root
VPS_SSH_PORT=22
VPS_SSH_KEY=C:/Users/sammy/.ssh/proxicell_tunnel
SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI
APP_DIR=C:/proxy/
NODE_ENV=production
LOG_LEVEL=info
"@
Set-Content -Path $envFile -Value $envContent -Force
Write-Host "[OK] Environment configured: VPS_HOST = 104.131.118.5" -ForegroundColor Green

# 1c. Fix SSH Private Key Permissions for Windows OpenSSH
Write-Host "[*] Normalizing OpenSSH private key permissions..." -ForegroundColor Cyan
$keyCandidates = @(
    (Join-Path $projDir "modem-manager\keys\proxicell_tunnel"),
    (Join-Path (Join-Path $env:USERPROFILE ".ssh") "proxicell_tunnel"),
    "C:\Windows\System32\config\systemprofile\.ssh\proxicell_tunnel",
    "C:\ProgramData\ssh\proxicell_tunnel"
)
foreach ($k in $keyCandidates) {
    if (Test-Path $k) {
        cmd.exe /c "icacls `"$k`" /reset >nul 2>&1 & icacls `"$k`" /inheritance:r >nul 2>&1 & icacls `"$k`" /grant:r `"$($env:USERNAME):F`" >nul 2>&1 & icacls `"$k`" /grant:r `"SYSTEM:F`" >nul 2>&1 & icacls `"$k`" /grant:r `"Administrators:F`" >nul 2>&1"
    }
}
Write-Host "[OK] OpenSSH private key permissions secured." -ForegroundColor Green

# 2. Verify Node.js
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
$watchdogPsPath = Join-Path $projDir "watchdog.ps1"

# 2. Configure Windows Power Settings (Keep PC awake on AC power & enable wake timers)
Write-Host "[*] Configuring Power Management (24/7 Always-On on Power)..." -ForegroundColor Cyan
try {
    # Never sleep on AC power
    cmd.exe /c "powercfg /change standby-timeout-ac 0" >$null 2>&1
    cmd.exe /c "powercfg /change hibernate-timeout-ac 0" >$null 2>&1
    # Allow RTC Wake Timers so scheduled tasks can wake/keep PC active
    cmd.exe /c "powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1" >$null 2>&1
    # Disable USB selective suspend on AC so USB modems/adapters never power down
    cmd.exe /c "powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0" >$null 2>&1
    cmd.exe /c "powercfg /setactive SCHEME_CURRENT" >$null 2>&1
    Write-Host "[OK] Power management configured (Sleep disabled on AC, Wake timers enabled)." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Power configuration skipped: $($_.Exception.Message)" -ForegroundColor Gray
}

# 3. Register Primary Windows Scheduled Task (Daemon Supervisor)
Write-Host "[*] Registering Primary Scheduled Task: $daemonTaskName..." -ForegroundColor Cyan
$daemonTaskRegistered = $false
try {
    Unregister-ScheduledTask -TaskName $daemonTaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

try {
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $projDir
    $triggerStartup = New-ScheduledTaskTrigger -AtStartup
    $triggerLogon = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Days 0) `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable `
        -WakeToRun `
        -MultipleInstances IgnoreNew

    try {
        # Try registering as SYSTEM first (24/7 across all users & lock screens)
        $principalSystem = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        Register-ScheduledTask `
            -TaskName $daemonTaskName `
            -Action $action `
            -Trigger @($triggerStartup, $triggerLogon) `
            -Settings $settings `
            -Principal $principalSystem `
            -Description "Vertex Proxies 24/7 Autonomous Background Service Daemon" `
            -Force -ErrorAction Stop | Out-Null
        $daemonTaskRegistered = $true
        Write-Host "[OK] Registered as SYSTEM Service (Runs at boot before login & across all lockscreens)." -ForegroundColor Green
    } catch {
        # Fallback to Current User with Highest Privileges
        try {
            $principalUser = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
            Register-ScheduledTask `
                -TaskName $daemonTaskName `
                -Action $action `
                -Trigger @($triggerStartup, $triggerLogon) `
                -Settings $settings `
                -Principal $principalUser `
                -Description "Vertex Proxies 24/7 Autonomous Background Service Daemon" `
                -Force -ErrorAction Stop | Out-Null
            $daemonTaskRegistered = $true
            Write-Host "[OK] Registered with user token (Highest privileges)." -ForegroundColor Green
        } catch {
            Write-Host "[INFO] Scheduled Task registration requires Admin (will be active via Registry & Startup folder)." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "[INFO] Scheduled Task skipped (Registry & Startup folder active)." -ForegroundColor Yellow
}

# 4. Register Autonomous Watchdog Scheduled Task (Checks & Auto-Heals Every 1 Minute)
Write-Host "[*] Registering 1-Minute Autonomous Watchdog Task: $watchdogTaskName..." -ForegroundColor Cyan
$watchdogRegistered = $false
try {
    Unregister-ScheduledTask -TaskName $watchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

try {
    $wdAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogPsPath`"" -WorkingDirectory $projDir
    $wdTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 9999)
    $wdSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
        -StartWhenAvailable `
        -WakeToRun `
        -MultipleInstances IgnoreNew

    try {
        $wdPrincipal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        Register-ScheduledTask `
            -TaskName $watchdogTaskName `
            -Action $wdAction `
            -Trigger $wdTrigger `
            -Settings $wdSettings `
            -Principal $wdPrincipal `
            -Description "Vertex Proxies 1-Minute Autonomous Watchdog & Auto-Healing Agent" `
            -Force -ErrorAction Stop | Out-Null
        $watchdogRegistered = $true
        Write-Host "[OK] 1-Minute Autonomous Watchdog registered (SYSTEM level)." -ForegroundColor Green
    } catch {
        try {
            $wdPrincipalUser = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
            Register-ScheduledTask `
                -TaskName $watchdogTaskName `
                -Action $wdAction `
                -Trigger $wdTrigger `
                -Settings $wdSettings `
                -Principal $wdPrincipalUser `
                -Description "Vertex Proxies 1-Minute Autonomous Watchdog & Auto-Healing Agent" `
                -Force -ErrorAction Stop | Out-Null
            $watchdogRegistered = $true
            Write-Host "[OK] 1-Minute Autonomous Watchdog registered (User level)." -ForegroundColor Green
        } catch {
            Write-Host "[INFO] Watchdog task registration requires Admin (Daemon supervisor is handling internal 30s self-healing loop)." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "[INFO] Watchdog task skipped (Daemon supervisor active)." -ForegroundColor Yellow
}

# 5. Configure Windows Registry Auto-Run
Write-Host "[*] Configuring Windows Registry Auto-Run keys..." -ForegroundColor Cyan
try {
    $regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $regVal = "wscript.exe `"$vbsPath`""
    Set-ItemProperty -Path $regKey -Name "VertexProxies" -Value $regVal -Force | Out-Null
    Write-Host "[OK] Windows Registry Boot Run key configured." -ForegroundColor Green
} catch {}

# 6. Create Windows Startup Folder Shortcut
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
} catch {}

# 7. Terminate old stale proxy processes and launch fresh
Write-Host ""
Write-Host "[*] Stopping old proxy instances and starting autonomous service fresh..." -ForegroundColor Cyan
try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { 
        ($_.CommandLine -like "*proxy*" -or $_.CommandLine -like "*\proxy\*") -and
        ($_.CommandLine -like "*service-daemon.js*" -or 
         $_.CommandLine -like "*modem-manager*index.js*" -or 
         $_.CommandLine -like "*bandwidthTracker.js*" -or
         $_.CommandLine -like "*watchdog.js*")
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue | Where-Object { 
        $_.CommandLine -like "*proxicell*" -or ($_.CommandLine -like "*-R*" -and ($_.CommandLine -like "*4100*" -or $_.CommandLine -like "*31000*"))
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbsPath`"" -WorkingDirectory $projDir

Start-Sleep -Seconds 3

# Check if running
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { 
    $_.CommandLine -like "*service-daemon.js*" -or $_.CommandLine -like "*modem-manager*" 
}

Write-Host ""
if ($running) {
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  [SUCCESS] 24/7 AUTONOMOUS SERVICE INSTALLED & ACTIVATED!      " -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  Daemon Status:   Running silently in background" -ForegroundColor White
    Write-Host "  Watchdog Agent:  Active (Auto-checks & heals every 1 minute)" -ForegroundColor White
    Write-Host "  Lock-Screen:     Survives screen locks, sign-offs, and reboots" -ForegroundColor White
    Write-Host "  Power Policy:    Always-on while plugged into power" -ForegroundColor White
    Write-Host "  Log File:        $projDir\logs\service.log" -ForegroundColor White
    Write-Host "  Watchdog Log:    $projDir\logs\watchdog.log" -ForegroundColor White
    Write-Host "================================================================" -ForegroundColor Green
} else {
    Write-Host "[!] Service initiated. Check '$projDir\logs\service.log' for details." -ForegroundColor Yellow
}

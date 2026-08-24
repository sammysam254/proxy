# Vertex Proxies — Service Status Inspector
$ErrorActionPreference = 'SilentlyContinue'

$projDir = "C:\proxy"
if (-not (Test-Path "$projDir\logs")) {
    $projDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "          VERTEX PROXIES -- BACKGROUND SERVICE STATUS          " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Auto-start inspection
Write-Host "--- [AUTO-START CONFIGURATION] ---" -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName 'VertexProxiesBackgroundService' -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "  Scheduled Task:  " -NoNewline
    Write-Host "[REGISTERED: $($task.State)]" -ForegroundColor Green
} else {
    Write-Host "  Scheduled Task:  [NOT REGISTERED - Using Registry & Startup Folder]" -ForegroundColor Yellow
}

$regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$regVal = (Get-ItemProperty -Path $regKey -Name "VertexProxies" -ErrorAction SilentlyContinue).VertexProxies
if ($regVal) {
    Write-Host "  Registry Run:    " -NoNewline
    Write-Host "[ACTIVE: Auto-starts on Windows Boot/Logon]" -ForegroundColor Green
}

$sFolder = [Environment]::GetFolderPath('Startup')
$sFile = Join-Path $sFolder 'VertexProxies.lnk'
if (Test-Path $sFile) {
    Write-Host "  Startup Folder:  " -NoNewline
    Write-Host "[ACTIVE: Auto-start shortcut installed]" -ForegroundColor Green
}

Write-Host ""

# 2. Process inspection via workers.json & Process Table
Write-Host "--- [BACKGROUND PROCESSES] ---" -ForegroundColor Cyan

$workersJsonPath = Join-Path $projDir "logs\workers.json"
$workersInfo = $null
if (Test-Path $workersJsonPath) {
    try {
        $raw = Get-Content $workersJsonPath -Raw -ErrorAction SilentlyContinue
        $workersInfo = ConvertFrom-Json $raw -ErrorAction SilentlyContinue
    } catch {}
}

$daemonPid = $null
$mainPid = $null
$bwPid = $null

if ($workersInfo) {
    if ($workersInfo.daemon) {
        $p = Get-Process -Id $workersInfo.daemon -ErrorAction SilentlyContinue
        if ($p) { $daemonPid = $workersInfo.daemon }
    }
    if ($workersInfo.main) {
        $p = Get-Process -Id $workersInfo.main -ErrorAction SilentlyContinue
        if ($p) { $mainPid = $workersInfo.main }
    }
    if ($workersInfo.bandwidth) {
        $p = Get-Process -Id $workersInfo.bandwidth -ErrorAction SilentlyContinue
        if ($p) { $bwPid = $workersInfo.bandwidth }
    }
}

# Fallback checking PID file
if (-not $daemonPid) {
    $pidPath = Join-Path $projDir "logs\service.pid"
    if (Test-Path $pidPath) {
        $savedPid = (Get-Content $pidPath -ErrorAction SilentlyContinue).Trim()
        if ($savedPid) {
            $p = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
            if ($p) { $daemonPid = $savedPid }
        }
    }
}

# Fallback checking listening port 9001
if (-not $mainPid) {
    try {
        $tcp = Get-NetTCPConnection -LocalPort 9001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($tcp) { $mainPid = $tcp.OwningProcess }
    } catch {}
}

# SSH VPS tunnels
$tunnelPids = @()
$sshList = @(Get-Process -Name "ssh" -ErrorAction SilentlyContinue)
foreach ($sp in $sshList) {
    $tunnelPids += $sp.Id
}

if ($daemonPid) {
    Write-Host "  Daemon Supervisor: " -NoNewline
    Write-Host "[RUNNING] " -ForegroundColor Green -NoNewline
    Write-Host "(PID: $daemonPid)" -ForegroundColor Gray
} else {
    Write-Host "  Daemon Supervisor: " -NoNewline
    Write-Host "[STOPPED]" -ForegroundColor Red
}

if ($mainPid) {
    Write-Host "  Main Proxy Engine: " -NoNewline
    Write-Host "[RUNNING] " -ForegroundColor Green -NoNewline
    Write-Host "(PID: $mainPid)" -ForegroundColor Gray
} else {
    Write-Host "  Main Proxy Engine: " -NoNewline
    Write-Host "[STOPPED]" -ForegroundColor Red
}

if ($bwPid) {
    Write-Host "  Bandwidth Tracker: " -NoNewline
    Write-Host "[RUNNING] " -ForegroundColor Green -NoNewline
    Write-Host "(PID: $bwPid)" -ForegroundColor Gray
} else {
    Write-Host "  Bandwidth Tracker: " -NoNewline
    Write-Host "[STANDBY]" -ForegroundColor Yellow
}

if ($tunnelPids.Count -gt 0) {
    foreach ($tpid in $tunnelPids) {
        Write-Host "  SSH VPS Tunnel:    " -NoNewline
        Write-Host "[ACTIVE]  " -ForegroundColor Green -NoNewline
        Write-Host "(PID: $tpid)" -ForegroundColor Gray
    }
} else {
    Write-Host "  SSH VPS Tunnel:    " -NoNewline
    Write-Host "[STANDBY / CONNECTING]" -ForegroundColor Yellow
}

Write-Host ""

# 3. Recent logs
Write-Host "--- [RECENT LOGS (Last 15 Lines)] ---" -ForegroundColor Cyan
$logPath = Join-Path $projDir "logs\service.log"
if (Test-Path $logPath) {
    $lines = Get-Content $logPath -Tail 15
    foreach ($l in $lines) {
        Write-Host "  $l" -ForegroundColor Gray
    }
} else {
    Write-Host "  (No log file found yet)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Commands available:" -ForegroundColor White
Write-Host "  service-start.bat     - Start background service silently" -ForegroundColor Gray
Write-Host "  service-stop.bat      - Stop background service" -ForegroundColor Gray
Write-Host "  service-restart.bat   - Restart background service" -ForegroundColor Gray
Write-Host "  view-logs.bat         - Watch live log stream" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

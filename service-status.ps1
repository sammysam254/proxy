# Vertex Proxies — Service Status Inspector
$ErrorActionPreference = 'SilentlyContinue'

$projDir = "C:\proxy"
if (-not (Test-Path "$projDir\logs")) {
    $projDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "     VERTEX PROXIES -- AUTONOMOUS SERVICE STATUS DASHBOARD      " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Auto-start inspection
Write-Host "--- [AUTO-START & SELF-HEALING ENGINE] ---" -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName 'VertexProxiesBackgroundService' -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "  Service Task (Boot/Lock): " -NoNewline
    Write-Host "[REGISTERED: $($task.State)]" -ForegroundColor Green
} else {
    Write-Host "  Service Task (Boot/Lock): [NOT REGISTERED]" -ForegroundColor Yellow
}

$wdTask = Get-ScheduledTask -TaskName 'VertexProxiesWatchdog' -ErrorAction SilentlyContinue
if ($wdTask) {
    Write-Host "  1-Min Watchdog Task:      " -NoNewline
    Write-Host "[ACTIVE: Auto-checks every 1 min]" -ForegroundColor Green
} else {
    Write-Host "  1-Min Watchdog Task:      [STANDBY / NOT REGISTERED]" -ForegroundColor Yellow
}

$regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$regVal = (Get-ItemProperty -Path $regKey -Name "VertexProxies" -ErrorAction SilentlyContinue).VertexProxies
if ($regVal) {
    Write-Host "  Registry Boot Auto-Run:   " -NoNewline
    Write-Host "[ACTIVE]" -ForegroundColor Green
}

$sFolder = [Environment]::GetFolderPath('Startup')
$sFile = Join-Path $sFolder 'VertexProxies.lnk'
if (Test-Path $sFile) {
    Write-Host "  Startup Shortcut:         " -NoNewline
    Write-Host "[ACTIVE]" -ForegroundColor Green
}

Write-Host ""

# 2. Process inspection via workers.json & Process Table
Write-Host "--- [BACKGROUND WORKERS] ---" -ForegroundColor Cyan

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

# Fallback scan running node processes directly
$nodeProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
foreach ($np in $nodeProcs) {
    $cmd = $np.CommandLine
    if (-not $daemonPid -and $cmd -like "*service-daemon.js*") { $daemonPid = $np.ProcessId }
    if (-not $mainPid -and ($cmd -like "*modem-manager*index.js*" -or $cmd -like "*modem-manager\index.js*")) { $mainPid = $np.ProcessId }
    if (-not $bwPid -and $cmd -like "*bandwidthTracker.js*") { $bwPid = $np.ProcessId }
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
Write-Host "--- [RECENT LOGS (Last 12 Lines)] ---" -ForegroundColor Cyan
$logPath = Join-Path $projDir "logs\service.log"
if (Test-Path $logPath) {
    $lines = Get-Content $logPath -Tail 12
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

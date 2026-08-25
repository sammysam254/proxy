# Vertex Proxies — Autonomous Background Watchdog Agent
# Checks every minute if the service daemon and workers are running.
# If anything is stopped or unresponsive, auto-heals and starts it.

$ErrorActionPreference = 'SilentlyContinue'
$projDir = "C:\proxy"
if (-not (Test-Path "$projDir\start-hidden.vbs")) {
    $projDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$vbsPath = Join-Path $projDir "start-hidden.vbs"
$logDir = Join-Path $projDir "logs"
$watchdogLog = Join-Path $logDir "watchdog.log"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Log-Message([string]$msg) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] [WATCHDOG-PS] $msg"
    try {
        Add-Content -Path $watchdogLog -Value $line -Encoding utf8
    } catch {}
}

# 1. Inspect running processes
$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue

$daemonRunning = $false
$mainRunning = $false
$bwRunning = $false

foreach ($p in $procs) {
    $cmd = $p.CommandLine
    if ($cmd -like "*service-daemon.js*") { $daemonRunning = $true }
    if ($cmd -like "*modem-manager*index.js*" -or $cmd -like "*modem-manager\index.js*") { $mainRunning = $true }
    if ($cmd -like "*bandwidthTracker.js*") { $bwRunning = $true }
}

# 2. Check if all are alive
if ($daemonRunning -and $mainRunning -and $bwRunning) {
    # All healthy, silent return
    exit 0
}

# 3. Auto-Heal & Restart
Log-Message "Health check failed! Daemon=$daemonRunning, Main=$mainRunning, Bandwidth=$bwRunning"
Log-Message "Triggering autonomous self-healing restart..."

try {
    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbsPath`"" -WorkingDirectory $projDir -WindowStyle Hidden
    Log-Message "Autonomous restart successfully launched."
} catch {
    Log-Message "Error launching self-healing: $($_.Exception.Message)"
}

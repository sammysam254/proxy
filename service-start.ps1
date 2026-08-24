# Vertex Proxies — Start Service Daemon
$ErrorActionPreference = 'Continue'
$projDir = "C:\proxy"
if (-not (Test-Path "$projDir\service-daemon.js")) {
    $projDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "          VERTEX PROXIES -- STARTING BACKGROUND SERVICE        " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Stop older instances
Write-Host "[*] Stopping any existing instances..." -ForegroundColor Cyan
try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { 
        $_.CommandLine -like "*service-daemon.js*" -or 
        $_.CommandLine -like "*modem-manager*index.js*" -or 
        $_.CommandLine -like "*bandwidthTracker.js*" 
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

Start-Sleep -Seconds 1

# 2. Launch daemon detached and hidden
Write-Host "[*] Launching silent background daemon..." -ForegroundColor Cyan

$nodeExe = "node.exe"
$nodePaths = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\node\node.exe")
foreach ($np in $nodePaths) {
    if (Test-Path $np) {
        $nodeExe = $np
        break
    }
}

$daemonScript = Join-Path $projDir "service-daemon.js"
$proc = Start-Process -FilePath $nodeExe -ArgumentList "`"$daemonScript`"" -WorkingDirectory $projDir -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 3

# 3. Verify
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { 
    $_.CommandLine -like "*service-daemon.js*" 
}

if ($running) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  [SUCCESS] BACKGROUND SERVICE IS NOW RUNNING SILENTLY!         " -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  Daemon PID:  $($proc.Id)" -ForegroundColor White
    Write-Host "  Log file:    $projDir\logs\service.log" -ForegroundColor White
    Write-Host "  Status:      Running in background 24/7" -ForegroundColor White
    Write-Host "               You can close any windows; it will keep running." -ForegroundColor White
    Write-Host "================================================================" -ForegroundColor Green
} else {
    Write-Host "[WARN] Daemon starting. Check $projDir\logs\service.log for status." -ForegroundColor Yellow
}

@echo off
setlocal EnableExtensions
title Vertex Proxies — Stop Background Service

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo           VERTEX PROXIES -- STOPPING BACKGROUND SERVICE
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Write-Host '[*] Stopping Scheduled Task instance...' -ForegroundColor Cyan;" ^
    "try { Stop-ScheduledTask -TaskName 'VertexProxiesBackgroundService' -ErrorAction SilentlyContinue } catch {};" ^
    "Write-Host '[*] Terminating daemon supervisor and proxy worker processes...' -ForegroundColor Cyan;" ^
    "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | Where-Object { ($_.CommandLine -like '*proxy*' -or $_.CommandLine -like '*\proxy\*') -and ($_.CommandLine -like '*service-daemon.js*' -or $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*bandwidthTracker.js*' -or $_.CommandLine -like '*watchdog.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
    "Write-Host '[*] Terminating SSH VPS tunnels...' -ForegroundColor Cyan;" ^
    "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*proxicell*' -or ($_.CommandLine -like '*-R*' -and ($_.CommandLine -like '*4100*' -or $_.CommandLine -like '*31000*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
    "$pidFile = Join-Path '%SCRIPT_DIR%' 'logs\service.pid';" ^
    "if (Test-Path $pidFile) { Remove-Item -Force $pidFile -ErrorAction SilentlyContinue };" ^
    "Write-Host '[OK] Vertex Proxies background service stopped.' -ForegroundColor Green;"

echo.
pause

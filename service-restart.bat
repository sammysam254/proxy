@echo off
setlocal EnableExtensions
title Vertex Proxies — Restart Background Service

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo           VERTEX PROXIES -- RESTARTING BACKGROUND SERVICE
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Write-Host '[*] Stopping running instances...' -ForegroundColor Cyan;" ^
    "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*service-daemon.js*' -or $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*bandwidthTracker.js*' -or $_.CommandLine -like '*watchdog.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
    "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" | Where-Object { $_.CommandLine -like '*-R*' -or $_.CommandLine -like '*proxicell*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
    "Start-Sleep -Seconds 1;" ^
    "Write-Host '[*] Starting fresh background service...' -ForegroundColor Cyan;"

wscript.exe "%SCRIPT_DIR%start-hidden.vbs"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Sleep -Seconds 2;" ^
    "$running = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*service-daemon.js*' -or $_.CommandLine -like '*modem-manager*' };" ^
    "if ($running) {" ^
    "    Write-Host '[SUCCESS] Vertex Proxies background service restarted successfully!' -ForegroundColor Green;" ^
    "} else {" ^
    "    Write-Host '[WARN] Service initiated. Check logs/service.log for details.' -ForegroundColor Yellow;" ^
    "}"

echo.
pause

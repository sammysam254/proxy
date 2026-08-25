@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions
title Vertex Proxies -- Complete System Restart

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo        VERTEX PROXIES -- FORCING COMPLETE SYSTEM RESTART
echo ================================================================
echo.

:: 1. Force kill old proxy Node and SSH processes
echo [*] Terminating background proxy processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | Where-Object { ($_.CommandLine -like '*proxy*' -or $_.CommandLine -like '*\proxy\*') -and ($_.CommandLine -like '*service-daemon.js*' -or $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*bandwidthTracker.js*' -or $_.CommandLine -like '*watchdog.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*proxicell*' -or ($_.CommandLine -like '*-R*' -and ($_.CommandLine -like '*4100*' -or $_.CommandLine -like '*31000*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] Previous proxy instances terminated.

:: 2. Launch Background Service
echo [*] Starting fresh background service...
call "%SCRIPT_DIR%service-start.bat"

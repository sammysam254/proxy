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

:: 1. Force kill all old Node and SSH processes
echo [*] Terminating all background processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*service-daemon.js*' -or $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*bandwidthTracker.js*' -or $_.CommandLine -like '*watchdog.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" | Where-Object { $_.CommandLine -like '*-R*' -or $_.CommandLine -like '*proxicell*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] All previous processes terminated.

:: 2. Launch Background Service
echo [*] Starting fresh background service...
call "%SCRIPT_DIR%service-start.bat"

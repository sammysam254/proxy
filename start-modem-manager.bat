@echo off
title Vertex Proxies — Modem Manager
cd /d "%~dp0modem-manager"

echo ===================================================
echo   Vertex Proxies — Modem Manager Launcher
echo ===================================================
echo.
echo Stopping any previous running instances...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" | Where-Object { $_.CommandLine -like '*157.151.206.163*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Starting clean Vertex Proxies instance...
echo.
node index.js
pause

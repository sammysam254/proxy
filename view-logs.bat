@echo off
setlocal EnableExtensions
title Vertex Proxies — Live Service Logs

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo           VERTEX PROXIES -- LIVE LOG STREAM
echo           Press Ctrl+C to stop viewing logs
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$logPath = Join-Path '%SCRIPT_DIR%' 'logs\service.log';" ^
    "if (-not (Test-Path $logPath)) { '' | Out-File $logPath -Encoding utf8 };" ^
    "Get-Content $logPath -Tail 40 -Wait"

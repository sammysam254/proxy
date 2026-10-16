@echo off
setlocal
cd /d "%~dp0"
title Vertex Proxies Setup

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Setup script exited with error code %ERRORLEVEL%.
)

echo.
echo ================================================================
echo Setup launcher finished.
echo Press any key to close this window...
echo ================================================================
pause >nul

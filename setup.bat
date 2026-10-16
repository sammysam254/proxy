@echo off
setlocal EnableExtensions
title Vertex Proxies Setup
cd /d "%~dp0"

set "PROJ_DIR=C:\proxy"
if not exist "%PROJ_DIR%" mkdir "%PROJ_DIR%" 2>nul

set "PS_SCRIPT=%~dp0setup.ps1"

:: If setup.ps1 does not exist alongside setup.bat (e.g. downloaded standalone to Downloads)
if not exist "%PS_SCRIPT%" (
    set "PS_SCRIPT=%PROJ_DIR%\setup.ps1"
)

if not exist "%PS_SCRIPT%" (
    echo [*] Standalone installer detected.
    echo [*] Downloading setup engine from GitHub...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/sammysam254/proxy/main/setup.ps1', '%PROJ_DIR%\setup.ps1'); if (Test-Path '%~dp0') { try { Copy-Item '%PROJ_DIR%\setup.ps1' -Destination '%~dp0setup.ps1' -Force } catch {} }"
    set "PS_SCRIPT=%PROJ_DIR%\setup.ps1"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
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

@echo off
setlocal EnableExtensions
title Vertex Proxies Setup ^& Live Monitor
color 0A

:: ─── 0. Check for Administrator Privileges & Auto-Elevate ─────────
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo ================================================================
    echo [*] Requesting Administrator Privileges...
    echo [*] Please click 'Yes' on the Windows permission popup (UAC).
    echo ================================================================
    echo.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: ─── 1. Ensure Directory ──────────────────────────────────────────
set "PROJ_DIR=C:\proxy"
if not exist "%PROJ_DIR%" (
    mkdir "%PROJ_DIR%"
)
cd /d "%PROJ_DIR%"

echo ================================================================
echo        VERTEX PROXIES -- AUTONOMOUS LAUNCHER & INSTALLER
echo                 (Running with Administrator Rights)
echo ================================================================
echo.

echo [*] Downloading latest setup engine from GitHub...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/sammysam254/proxy/main/setup.ps1', '%PROJ_DIR%\setup.ps1')"

if not exist "%PROJ_DIR%\setup.ps1" (
    echo [!] Could not download setup.ps1 directly. Checking local directory...
    if exist "%~dp0setup.ps1" (
        copy /y "%~dp0setup.ps1" "%PROJ_DIR%\setup.ps1" >nul
    )
)

if not exist "%PROJ_DIR%\setup.ps1" (
    echo.
    echo [ERROR] setup.ps1 not found and could not be downloaded.
    echo Please verify your internet connection.
    echo.
    pause
    exit /b 1
)

echo [*] Launching setup engine in console...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJ_DIR%\setup.ps1"

echo.
echo ================================================================
echo Setup launcher finished.
echo Press any key to close this window...
echo ================================================================
pause >nul

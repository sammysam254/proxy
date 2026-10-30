@echo off
setlocal EnableExtensions
title Vertex Proxies Setup and Live Monitor

echo ================================================================
echo        VERTEX PROXIES -- SETUP AND LIVE RUNNER
echo ================================================================
echo.

set "PROJ_DIR=C:\proxy"
if not exist "%PROJ_DIR%" (
    mkdir "%PROJ_DIR%"
)
cd /d "%PROJ_DIR%"

echo [*] Checking network connectivity and syncing setup engine...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; $downloaded = $false; for ($i=1; $i -le 6; $i++) { try { (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/sammysam254/proxy/main/setup.ps1?v=' + (Get-Date).Ticks, '%PROJ_DIR%\setup.ps1'); $downloaded = $true; break } catch { Start-Sleep -Milliseconds 800 } }; if (-not $downloaded -and (Test-Path '%~dp0setup.ps1') -and ('%~dp0setup.ps1' -ne '%PROJ_DIR%\setup.ps1')) { Copy-Item '%~dp0setup.ps1' '%PROJ_DIR%\setup.ps1' -Force }"

if not exist "%PROJ_DIR%\setup.ps1" (
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
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%PROJ_DIR%\setup.ps1"

echo.
echo ================================================================
echo Setup launcher finished.
echo Press any key to close this window...
echo ================================================================
pause

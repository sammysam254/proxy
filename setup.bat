@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
title Vertex Proxies -- All-in-One Setup and Launcher

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Check if modem-manager exists locally
if exist "%SCRIPT_DIR%modem-manager\index.js" goto :run_local

:: Standalone runner detected (e.g. running from Downloads or Temp)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/sammysam254/proxy/main/install.ps1 | iex"
)
pause
exit /b 0

:run_local
set "PROJ_DIR=%SCRIPT_DIR%"
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PROJ_DIR%modem-manager\bin;%PROJ_DIR%modem-manager\bin\platform-tools;C:\Windows\System32\OpenSSH;%PATH%"

echo ================================================================
echo        VERTEX PROXIES -- ALL-IN-ONE SETUP AND LAUNCHER
echo ================================================================
echo [*] Project Directory: %PROJ_DIR%
echo.

:: 1. Clean Stale Processes
echo [*] Stopping previous background instances...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" | Where-Object { $_.CommandLine -like '*proxicell*' -or $_.CommandLine -like '*64.227.3.211*' -or $_.CommandLine -like '*157.151.206.163*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo [OK] Previous instances cleaned.

:: 2. Setup SSH Key
set "SSH_DIR=%USERPROFILE%\.ssh"
if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"
set "LOCAL_SSH_KEY=%SSH_DIR%\proxicell_tunnel"

if exist "%PROJ_DIR%modem-manager\keys\proxicell_tunnel" (
    copy /y "%PROJ_DIR%modem-manager\keys\proxicell_tunnel" "%LOCAL_SSH_KEY%" >nul
    copy /y "%PROJ_DIR%modem-manager\keys\proxicell_tunnel.pub" "%LOCAL_SSH_KEY%.pub" >nul
)
icacls "%LOCAL_SSH_KEY%" /inheritance:r /grant:r "%USERNAME%:(R)" >nul 2>&1
echo [OK] VPS Reverse Tunnel authorization keys configured.

:: 3. Configure .env
(
    echo VPS_HOST=64.227.3.211
    echo VPS_USER=root
    echo VPS_SSH_PORT=22
    echo VPS_SSH_KEY=%LOCAL_SSH_KEY:\=/%
    echo SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
    echo SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI
    echo APP_DIR=%PROJ_DIR:\=/%
    echo NODE_ENV=production
    echo LOG_LEVEL=info
) > "%PROJ_DIR%.env"
echo [OK] Environment settings verified in .env

:: 4. Verify Node Dependencies
if not exist "%PROJ_DIR%modem-manager\node_modules" (
    echo [*] Installing modem-manager dependencies...
    cd /d "%PROJ_DIR%modem-manager"
    call npm install --no-audit --no-fund
    cd /d "%PROJ_DIR%"
    echo [OK] Dependencies installed.
) else (
    echo [OK] Dependencies verified.
)

:: 5. Register Startup
powershell -NoProfile -Command "$sFolder = [Environment]::GetFolderPath('Startup'); $sFile = Join-Path $sFolder 'VertexProxies.lnk'; $w = New-Object -ComObject WScript.Shell; $sc = $w.CreateShortcut($sFile); $sc.TargetPath = 'wscript.exe'; $sc.Arguments = '\"%PROJ_DIR%start-hidden.vbs\"'; $sc.WorkingDirectory = '%PROJ_DIR%'; $sc.Description = 'Vertex Proxies Auto-Start'; $sc.Save()" >nul 2>&1
echo [OK] Windows Boot Auto-Start configured.

:: 6. ADB Initialization
echo [*] Initializing Android Debug Bridge (ADB)...
adb start-server >nul 2>&1
echo [*] Scanning for connected Android phones and USB modems...
adb devices -l
echo.

:: 7. Start Engine
echo ================================================================
echo   [SUCCESS] SYSTEM INITIALIZED AND READY
echo   Starting Vertex Proxies Modem Manager Engine...
echo   VPS Host:       64.227.3.211
echo   Web Dashboard:  https://proxyke.netlify.app
echo ================================================================
echo.

cd /d "%PROJ_DIR%modem-manager"
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'bandwidthTracker.js' -WorkingDirectory '%PROJ_DIR%modem-manager'" >nul 2>&1
echo [OK] Bandwidth Tracker running in background.
echo.

node index.js
pause

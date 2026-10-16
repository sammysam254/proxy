@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
title Vertex Proxies -- Live Monitor & Engine

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
cd /d "%SCRIPT_DIR%"

set "PROJ_DIR=%SCRIPT_DIR%"
if not exist "%PROJ_DIR%\modem-manager\index.js" (
    if exist "C:\proxy\modem-manager\index.js" (
        set "PROJ_DIR=C:\proxy"
        cd /d "C:\proxy"
    )
)

echo ================================================================
echo        VERTEX PROXIES -- ALL-IN-ONE SETUP & LIVE MONITOR
echo ================================================================
echo [*] Working Directory: %PROJ_DIR%
echo.

:: 0. Setup System PATH
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PROJ_DIR%\modem-manager\bin;%PROJ_DIR%\modem-manager\bin\platform-tools;C:\Windows\System32\OpenSSH;%PATH%"

:: 1. Pull latest updates automatically
echo [*] Checking for updates from GitHub...
if exist "%PROJ_DIR%\.git" (
    git -C "%PROJ_DIR%" fetch origin main
    git -C "%PROJ_DIR%" reset --hard origin/main
    for /f "tokens=*" %%i in ('git -C "%PROJ_DIR%" rev-parse --short HEAD 2^>nul') do set "GIT_COMMIT=%%i"
    for /f "tokens=*" %%i in ('git -C "%PROJ_DIR%" log -1 --pretty=format:"%%s" 2^>nul') do set "GIT_MSG=%%i"
    if defined GIT_COMMIT (
        echo [OK] Code up to date at commit: !GIT_COMMIT! (!GIT_MSG!)
    ) else (
        echo [OK] Code updated via Git.
    )
) else (
    echo [*] Git not detected. Syncing core files from GitHub main...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; $files = @('setup.bat','service-install.ps1','service-daemon.js','start.bat','view-logs.bat','modem-manager/index.js','modem-manager/proxySpawner.js','modem-manager/tunnelManager.js','modem-manager/wifiDetector.js','modem-manager/supabaseSync.js','modem-manager/bandwidthTracker.js'); foreach($f in $files) { try { (New-Object System.Net.WebClient).DownloadFile(\"https://raw.githubusercontent.com/sammysam254/proxy/main/$f\", (Join-Path '%PROJ_DIR%' $f)) } catch {} }"
    echo [OK] Core files synced.
)

:: 2. Verify Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Node.js is NOT installed or not found in PATH!
    echo Please install Node.js (version 18 or 20) from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 3. Stop stale background instances
echo [*] Cleaning stale proxy processes & SSH tunnels...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | Where-Object { ($_.CommandLine -like '*proxy*' -or $_.CommandLine -like '*\proxy\*') -and ($_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*service-daemon*' -or $_.CommandLine -like '*bandwidthTracker*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*proxicell*' -or $_.CommandLine -like '*104.131.118.5*' -or ($_.CommandLine -like '*-R*' -and ($_.CommandLine -like '*4100*' -or $_.CommandLine -like '*31000*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo [OK] Previous instances cleaned.

:: 4. Setup SSH Key
set "SSH_DIR=%USERPROFILE%\.ssh"
if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"
set "LOCAL_SSH_KEY=%SSH_DIR%\proxicell_tunnel"

if exist "%PROJ_DIR%\modem-manager\keys\proxicell_tunnel" (
    copy /y "%PROJ_DIR%\modem-manager\keys\proxicell_tunnel" "%LOCAL_SSH_KEY%" >nul
    copy /y "%PROJ_DIR%\modem-manager\keys\proxicell_tunnel.pub" "%LOCAL_SSH_KEY%.pub" >nul
)
icacls "%LOCAL_SSH_KEY%" /inheritance:r /grant:r "%USERNAME%:(R)" >nul 2>&1
echo [OK] VPS Reverse Tunnel authorization keys configured.

:: 5. Write .env configuration
set "CLEAN_SSH_KEY=%LOCAL_SSH_KEY:\=/%"
set "CLEAN_APP_DIR=%PROJ_DIR:\=/%/"
> "%PROJ_DIR%\.env" echo VPS_HOST=104.131.118.5
>> "%PROJ_DIR%\.env" echo VPS_USER=root
>> "%PROJ_DIR%\.env" echo VPS_SSH_PORT=22
>> "%PROJ_DIR%\.env" echo VPS_SSH_KEY=%CLEAN_SSH_KEY%
>> "%PROJ_DIR%\.env" echo SUPABASE_URL=https://lpqrffvbcbousmhqpdpm.supabase.co
>> "%PROJ_DIR%\.env" echo SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcXJmZnZiY2JvdXNtaHFwZHBtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjE1ODU5NywiZXhwIjoyMTA3NzM0NTk3fQ.WJnz5BBCuKtJB0cwIn_eGVCkXIca3TX6A2ri2sXwW18
>> "%PROJ_DIR%\.env" echo SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcXJmZnZiY2JvdXNtaHFwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTg1OTcsImV4cCI6MjEwNzczNDU5N30.bDdADRwSGAlr1NsJjYtge30WiQMiwTUpTWqlzJbFhpw
>> "%PROJ_DIR%\.env" echo APP_DIR=%CLEAN_APP_DIR%
>> "%PROJ_DIR%\.env" echo NODE_ENV=production
>> "%PROJ_DIR%\.env" echo LOG_LEVEL=info
echo [OK] Environment settings verified in .env

:: 6. Verify Node Dependencies
if not exist "%PROJ_DIR%\modem-manager\node_modules" (
    echo [*] Installing modem-manager dependencies...
    cd /d "%PROJ_DIR%\modem-manager"
    call npm install --no-audit --no-fund
    cd /d "%PROJ_DIR%"
    echo [OK] Dependencies installed.
) else (
    echo [OK] Dependencies verified.
)

:: 7. Register Boot Auto-Start (Without launching background wscript)
if exist "%PROJ_DIR%\service-install.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ_DIR%\service-install.ps1" -NoLaunch
)

:: 8. Start Bandwidth Tracker in background
start /b node "%PROJ_DIR%\modem-manager\bandwidthTracker.js" >nul 2>&1

:: 9. Start Main Modem Manager Engine in this window
echo.
echo ================================================================
echo   [LIVE] LAUNCHING PROXY & MODEM ENGINE IN THIS WINDOW
echo   (All logs, detected modems, and tunnel outputs appear below)
echo   (This window will STAY OPEN. Press Ctrl+C to stop)
echo ================================================================
echo.
cd /d "%PROJ_DIR%\modem-manager"
node index.js

echo.
echo ================================================================
echo   [!] Engine terminated.
echo ================================================================
pause

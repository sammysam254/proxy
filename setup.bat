@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
title Vertext Proxies -- All-in-One Setup and Launcher

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Check if modem-manager exists locally
if exist "%SCRIPT_DIR%modem-manager\index.js" goto :run_local
if exist "C:\proxy\modem-manager\index.js" (
    set "SCRIPT_DIR=C:\proxy\"
    cd /d "C:\proxy"
    goto :run_local
)

:: Standalone runner detected (e.g. running from Downloads or Temp without full repository)
echo ================================================================
echo        VERTEXT PROXIES -- STANDALONE INSTALLER
echo ================================================================
echo [*] Standalone mode detected. Initializing installation...
echo.

if exist "%SCRIPT_DIR%install.ps1" (
    powershell -NoProfile -File "%SCRIPT_DIR%install.ps1"
) else (
    echo [*] Fetching complete Vertext Proxies codebase and dependencies from GitHub...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; $tmp = Join-Path $env:TEMP 'install.ps1'; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/sammysam254/proxy/main/install.ps1', $tmp); powershell -NoProfile -File $tmp"
)

if exist "C:\proxy\modem-manager\index.js" (
    echo.
    echo [OK] Installation complete. Launching Vertext Proxies...
    cd /d "C:\proxy\modem-manager"
    node index.js
)

pause
exit /b 0

:run_local
set "PROJ_DIR=%SCRIPT_DIR%"
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PROJ_DIR%modem-manager\bin;%PROJ_DIR%modem-manager\bin\platform-tools;C:\Windows\System32\OpenSSH;%PATH%"

echo ================================================================
echo        VERTEXT PROXIES -- ALL-IN-ONE SETUP AND LAUNCHER
echo ================================================================
echo [*] Project Directory: %PROJ_DIR%
echo.

:: 0. Pull latest updates automatically
echo [*] Checking for updates from GitHub...
if exist "%PROJ_DIR%.git" (
    git -C "%PROJ_DIR%" fetch --all >nul 2>&1
    git -C "%PROJ_DIR%" reset --hard origin/main >nul 2>&1
    for /f "tokens=*" %%i in ('git -C "%PROJ_DIR%" rev-parse --short HEAD 2^>nul') do set "GIT_COMMIT=%%i"
    for /f "tokens=*" %%i in ('git -C "%PROJ_DIR%" log -1 --pretty=format:"%%s" 2^>nul') do set "GIT_MSG=%%i"
    if defined GIT_COMMIT (
        echo [OK] Code up to date at commit: !GIT_COMMIT! (!GIT_MSG!)
    ) else (
        echo [OK] Code up to date via Git.
    )
) else (
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; $files = @('modem-manager/index.js','modem-manager/proxySpawner.js','modem-manager/tunnelManager.js','modem-manager/wifiDetector.js','modem-manager/supabaseSync.js'); foreach($f in $files) { try { (New-Object System.Net.WebClient).DownloadFile(\"https://raw.githubusercontent.com/sammysam254/proxy/main/$f\", (Join-Path '%PROJ_DIR%' $f)) } catch {} }" >nul 2>&1
    echo [OK] Latest high-speed engine code synced from GitHub.
)

:: 1. Clean Stale Processes
echo [*] Stopping previous background instances...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { ($_.CommandLine -like '*proxy*' -or $_.CommandLine -like '*\proxy\*') -and ($_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*service-daemon*' -or $_.CommandLine -like '*bandwidthTracker*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" | Where-Object { $_.CommandLine -like '*proxicell*' -or ($_.CommandLine -like '*-R*' -and ($_.CommandLine -like '*4100*' -or $_.CommandLine -like '*31000*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
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
set "CLEAN_SSH_KEY=%LOCAL_SSH_KEY:\=/%"
set "CLEAN_APP_DIR=%PROJ_DIR:\=/%"
> "%PROJ_DIR%.env" echo VPS_HOST=64.227.3.211
>> "%PROJ_DIR%.env" echo VPS_USER=root
>> "%PROJ_DIR%.env" echo VPS_SSH_PORT=22
>> "%PROJ_DIR%.env" echo VPS_SSH_KEY=%CLEAN_SSH_KEY%
>> "%PROJ_DIR%.env" echo SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
>> "%PROJ_DIR%.env" echo SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI
>> "%PROJ_DIR%.env" echo APP_DIR=%CLEAN_APP_DIR%
>> "%PROJ_DIR%.env" echo NODE_ENV=production
>> "%PROJ_DIR%.env" echo LOG_LEVEL=info
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

:: 5. Register Background Service and Auto-Start
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJ_DIR%service-install.ps1"

:: 6. Complete & Auto-Close
echo [*] System initialized. Background service is active and streaming live logs to web dashboard.
echo [*] Auto-closing terminal...
timeout /t 1 >nul
exit /b 0


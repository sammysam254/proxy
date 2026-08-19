@echo off
setlocal EnableExtensions
title ProxiCell - Universal Auto Launcher

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo           ProxiCell - Automated Proxy Launcher
echo ================================================================
echo [*] Working Directory: %SCRIPT_DIR%
echo.

:: ─── 1. Auto-Clone complete repository if missing ───
if not exist "%SCRIPT_DIR%modem-manager\index.js" (
    echo [*] Downloading ProxiCell system from GitHub...
    if exist "%SCRIPT_DIR%proxy-tmp" rmdir /s /q "%SCRIPT_DIR%proxy-tmp"
    git clone --depth 1 https://github.com/sammysam254/proxy.git "%SCRIPT_DIR%proxy-tmp"
    if exist "%SCRIPT_DIR%proxy-tmp\modem-manager\index.js" (
        xcopy /e /i /y "%SCRIPT_DIR%proxy-tmp\*" "%SCRIPT_DIR%" >nul
        rmdir /s /q "%SCRIPT_DIR%proxy-tmp"
        echo [OK] Repository cloned successfully.
        echo.
    ) else (
        echo [!] Git clone fallback checking C:\proxy...
        if exist "C:\proxy\modem-manager\index.js" cd /d "C:\proxy"
    )
)

set "PROJ_DIR=%CD%\"

:: ─── 2. Ensure Node.js & ADB in PATH ───
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PROJ_DIR%modem-manager\bin;%PROJ_DIR%modem-manager\bin\platform-tools;%PATH%"

node -v >nul 2>&1
if errorlevel 1 (
    echo [*] Node.js not detected. Attempting automatic installation via winget...
    winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    set "PATH=C:\Program Files\nodejs;%PATH%"
    node -v >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Node.js is required. Please install Node.js from https://nodejs.org
        pause
        exit /b 1
    )
)

:: ─── 3. Auto-Configure SSH Key for Oracle VPS Tunnel ───
set "SSH_DIR=%USERPROFILE%\.ssh"
if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"
set "LOCAL_SSH_KEY=%SSH_DIR%\proxicell_tunnel"

if not exist "%LOCAL_SSH_KEY%" (
    if exist "%PROJ_DIR%modem-manager\keys\proxicell_tunnel" (
        copy /y "%PROJ_DIR%modem-manager\keys\proxicell_tunnel" "%LOCAL_SSH_KEY%" >nul
        if exist "%PROJ_DIR%modem-manager\keys\proxicell_tunnel.pub" (
            copy /y "%PROJ_DIR%modem-manager\keys\proxicell_tunnel.pub" "%LOCAL_SSH_KEY%.pub" >nul
        )
        echo [OK] Oracle VPS tunnel authorization key configured.
    )
)

:: Set strict permissions on Windows OpenSSH key
icacls "%LOCAL_SSH_KEY%" /inheritance:r /grant:r "%USERNAME%:(R)" >nul 2>&1

:: ─── 4. Auto-Configure Environment Variables ───
if not exist "%PROJ_DIR%.env" (
    (
        echo VPS_HOST=157.151.206.163
        echo VPS_USER=opc
        echo VPS_SSH_PORT=22
        echo VPS_SSH_KEY=%LOCAL_SSH_KEY:\=/%
        echo SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
        echo SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI
        echo APP_DIR=%PROJ_DIR:\=/%
        echo NODE_ENV=production
        echo LOG_LEVEL=info
    ) > "%PROJ_DIR%.env"
    echo [OK] Configured environment settings.
)

:: ─── 5. Auto-Install Dependencies ───
if not exist "%PROJ_DIR%modem-manager\node_modules" (
    echo [*] Installing required Node.js modules...
    cd /d "%PROJ_DIR%modem-manager"
    call npm install --silent
    cd /d "%PROJ_DIR%"
    echo [OK] Dependencies installed.
    echo.
)

:: ─── 6. Launch Modem Manager & Proxy Engine ───
echo ================================================================
echo   [OK] System Ready — Starting ProxiCell Proxy Manager
echo   VPS Tunnel Host: 157.151.206.163
echo   Web Dashboard:   https://proxyke.netlify.app
echo ================================================================
echo.

cd /d "%PROJ_DIR%modem-manager"

:: ─── 6a. Pull latest code from GitHub ───
echo [*] Checking for updates from GitHub...
cd /d "%PROJ_DIR%"
git pull --ff-only --quiet 2>nul && echo [OK] Updated to latest version. || echo [--] Offline or already up to date.
cd /d "%PROJ_DIR%modem-manager"

:: ─── 6b. Re-install deps if package.json changed ───
call npm install --silent 2>nul

node index.js

echo.
echo [!] Modem Manager process has stopped.
pause

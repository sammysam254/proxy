@echo off
setlocal EnableExtensions
title ProxiCell Modem Manager - Running

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: ─── Auto-clone entire repository if files are missing in this directory ───
if not exist "%SCRIPT_DIR%modem-manager\index.js" (
    echo ================================================================
    echo   Cloning ProxiCell repository from GitHub...
    echo ================================================================
    echo.
    if exist "%SCRIPT_DIR%proxy-tmp" rmdir /s /q "%SCRIPT_DIR%proxy-tmp"
    git clone --depth 1 https://github.com/sammysam254/proxy.git "%SCRIPT_DIR%proxy-tmp"
    if exist "%SCRIPT_DIR%proxy-tmp\modem-manager\index.js" (
        xcopy /e /i /y "%SCRIPT_DIR%proxy-tmp\*" "%SCRIPT_DIR%" >nul
        rmdir /s /q "%SCRIPT_DIR%proxy-tmp"
        echo [OK] Repository cloned successfully into %SCRIPT_DIR%
        echo.
    ) else (
        echo [!] Git clone failed. Falling back to C:\proxy if available.
        if exist "C:\proxy\modem-manager\index.js" cd /d "C:\proxy"
    )
)

set "PROJ_DIR=%CD%\"

:: Add paths for Node.js, Git, adb, and 3proxy to PATH
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PROJ_DIR%modem-manager\bin;%PROJ_DIR%modem-manager\bin\platform-tools;%PATH%"

echo ================================================================
echo   ProxiCell Modem Manager — Windows Launcher
echo ================================================================
echo [*] Working Directory: %PROJ_DIR%
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check if modem-manager dependencies are installed
if not exist "%PROJ_DIR%modem-manager\node_modules" (
    echo [*] Installing required Node.js modules in modem-manager...
    cd /d "%PROJ_DIR%modem-manager"
    call npm install
    cd /d "%PROJ_DIR%"
    echo [OK] Dependencies installed.
    echo.
)

:: Check if .env exists
if not exist "%PROJ_DIR%.env" (
    (
        echo VPS_HOST=157.151.206.163
        echo VPS_USER=opc
        echo VPS_SSH_PORT=22
        echo VPS_SSH_KEY=%USERPROFILE%\.ssh\proxicell_tunnel
        echo SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
        echo SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI
        echo APP_DIR=%PROJ_DIR:\=/%
        echo NODE_ENV=production
        echo LOG_LEVEL=info
    ) > "%PROJ_DIR%.env"
)

echo [*] Starting Modem Manager service...
echo [*] Polling every 30s for USB modems and Android phones.
echo [*] Press Ctrl+C to stop.
echo.

cd /d "%PROJ_DIR%modem-manager"
node index.js

echo.
echo [!] Modem Manager process has stopped.
pause

@echo off
setlocal EnableExtensions
title ProxiCell Modem Manager - Running

:: Determine project root directory (current directory or C:\proxy)
set "PROJ_DIR=%~dp0"
if not exist "%PROJ_DIR%modem-manager\index.js" (
    if exist "C:\proxy\modem-manager\index.js" (
        set "PROJ_DIR=C:\proxy\"
    )
)

:: Add paths for Node.js, Git, adb, and 3proxy to PATH
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PROJ_DIR%modem-manager\bin;%PROJ_DIR%modem-manager\bin\platform-tools;%PATH%"

cd /d "%PROJ_DIR%"

echo ================================================================
echo   ProxiCell Modem Manager — Windows Launcher
echo ================================================================
echo [*] Project Folder: %PROJ_DIR%
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not found.
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

echo [*] Starting Modem Manager service...
echo [*] Polling every 30s for USB modems and Android phones.
echo [*] Press Ctrl+C to stop.
echo.

cd /d "%PROJ_DIR%modem-manager"
node index.js

echo.
echo [!] Modem Manager process has stopped.
pause

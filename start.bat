@echo off
setlocal EnableExtensions
title ProxiCell Modem Manager - Running

:: Add common paths for Node.js, Git, and tools to PATH
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%~dp0modem-manager\bin;%~dp0modem-manager\bin\platform-tools;%PATH%"

cd /d "%~dp0"

echo ================================================================
echo   ProxiCell Modem Manager — Windows Launcher
echo ================================================================
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
if not exist "%~dp0modem-manager\node_modules" (
    echo [*] Installing required Node.js modules in modem-manager...
    cd /d "%~dp0modem-manager"
    call npm install
    cd /d "%~dp0"
    echo [OK] Dependencies installed.
    echo.
)

echo [*] Starting Modem Manager service...
echo [*] Polling every 30s for USB modems and Android phones.
echo [*] Press Ctrl+C to stop.
echo.

cd /d "%~dp0modem-manager"
node index.js

echo.
echo [!] Modem Manager process has stopped.
pause

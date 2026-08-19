@echo off
setlocal EnableDelayedExpansion
title ProxiCell Modem Manager
cd /d "%~dp0"

echo ================================================================
echo   ProxiCell Modem Manager — Windows Launcher
echo ================================================================
echo.

:: Add bin tools (adb, 3proxy) to PATH if present
if exist "%~dp0modem-manager\bin\platform-tools" (
    set "PATH=%~dp0modem-manager\bin\platform-tools;!PATH!"
)
if exist "%~dp0modem-manager\bin" (
    set "PATH=%~dp0modem-manager\bin;!PATH!"
)

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org or run setup.bat
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
    echo [v] Dependencies installed.
    echo.
)

:: Check if .env file exists
if not exist "%~dp0.env" (
    if not exist "%~dp0modem-manager\.env" (
        echo [!] Warning: .env file not found. Running setup.bat to configure...
        call "%~dp0setup.bat"
    )
)

echo [*] Starting Modem Manager service...
echo [*] Press Ctrl+C to stop.
echo.

cd /d "%~dp0modem-manager"
node index.js

echo.
echo [!] Modem Manager has stopped.
pause

@echo off
setlocal EnableDelayedExpansion
title ProxiCell — Windows Modem Proxy Setup

echo ================================================================
echo    ____             _  ____     _ _ 
echo   ^|  _ \ _ __ _____  _(_)/ ___^|___^| ^| ^|
echo   ^| ^|_) ^| '__/ _ \ \/ / ^| ^|   / _ \ ^| ^|
echo   ^|  __/^| ^| ^| (_) ^>  ^< ^| ^| ^|__^|  __/ ^| ^|
echo   ^|_^|   ^|_^|  \___/_/\_\_^|\____\___^|_^|_^|
echo.
echo    Modem Proxy System — Native Windows Setup
echo ================================================================
echo.

:: ─── 1. Check Administrative Privileges ─────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c,cd /d,%~dp0,%~nx0' -Verb RunAs"
    exit /b
)

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "APP_DIR=%SCRIPT_DIR%"
set "BIN_DIR=%SCRIPT_DIR%modem-manager\bin"
if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

echo [*] Working Directory: %SCRIPT_DIR%
echo.

:: ─── 2. Check & Install Node.js ─────────────────────────────────
echo [*] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not found. Attempting to install via winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [X] Failed to auto-install Node.js.
        echo     Please download and install Node.js manually from: https://nodejs.org
        pause
        exit /b 1
    )
    echo [v] Node.js installed.
) else (
    for /f "tokens=*" %%i in ('node -v') do set "NODE_VER=%%i"
    echo [v] Node.js is installed: !NODE_VER!
)

:: ─── 3. Check & Install Git ─────────────────────────────────────
echo [*] Checking Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Git not found. Attempting to install via winget...
    winget install Git.Git --silent --accept-package-agreements --accept-source-agreements
) else (
    echo [v] Git is installed.
)

:: ─── 4. Download 3proxy Windows Binary ───────────────────────────
echo [*] Checking 3proxy for Windows...
if not exist "%BIN_DIR%\3proxy.exe" (
    echo [*] Downloading 3proxy Windows 64-bit binary...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object System.Net.WebClient; try { $wc.DownloadFile('https://github.com/3proxy/3proxy/releases/download/0.9.4/3proxy-0.9.4-x64.zip', '%BIN_DIR%\3proxy.zip'); Expand-Archive -Path '%BIN_DIR%\3proxy.zip' -DestinationPath '%BIN_DIR%\tmp' -Force; Copy-Item '%BIN_DIR%\tmp\bin64\3proxy.exe' '%BIN_DIR%\3proxy.exe' -Force; Remove-Item '%BIN_DIR%\3proxy.zip' -Force; Remove-Item '%BIN_DIR%\tmp' -Recurse -Force; Write-Host '[v] 3proxy downloaded successfully.' } catch { Write-Host '[!] Could not auto-download 3proxy zip: ' $_.Exception.Message }"
)

if exist "%BIN_DIR%\3proxy.exe" (
    echo [v] 3proxy ready: %BIN_DIR%\3proxy.exe
) else (
    echo [!] Note: 3proxy.exe will be used from PATH if available.
)

:: ─── 5. Check & Setup ADB (Android Debug Bridge) ────────────────
echo [*] Checking Android Debug Bridge (adb)...
where adb >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "%BIN_DIR%\platform-tools\adb.exe" (
        echo [*] Downloading Google Android Platform Tools (ADB)...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object System.Net.WebClient; try { $wc.DownloadFile('https://dl.google.com/android/repository/platform-tools-latest-windows.zip', '%BIN_DIR%\adb.zip'); Expand-Archive -Path '%BIN_DIR%\adb.zip' -DestinationPath '%BIN_DIR%' -Force; Remove-Item '%BIN_DIR%\adb.zip' -Force; Write-Host '[v] ADB downloaded.' } catch { Write-Host '[!] ADB download failed: ' $_.Exception.Message }"
    )
    if exist "%BIN_DIR%\platform-tools\adb.exe" (
        set "PATH=%BIN_DIR%\platform-tools;!PATH!"
        echo [v] ADB configured from %BIN_DIR%\platform-tools
    )
) else (
    echo [v] ADB is installed and available in PATH.
)

:: ─── 6. Prompt for Configuration ────────────────────────────────
echo.
echo ================================================================
echo    Configuration Settings
echo ================================================================

set "VPS_HOST=157.151.148.218"
set "SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co"
set "SUPABASE_SERVICE_KEY="

set /p "INPUT_VPS=Oracle VPS Public IP [%VPS_HOST%]: "
if not "!INPUT_VPS!"=="" set "VPS_HOST=!INPUT_VPS!"

set /p "INPUT_SUBA=Supabase Project URL [%SUPABASE_URL%]: "
if not "!INPUT_SUBA!"=="" set "SUPABASE_URL=!INPUT_SUBA!"

set /p "SUPABASE_SERVICE_KEY=Supabase Service Role Key: "

:: ─── 7. SSH Key Generation for VPS Tunnel ───────────────────────
echo.
echo [*] Setting up SSH Key for Oracle VPS Tunnel...

set "SSH_DIR=%USERPROFILE%\.ssh"
if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"
set "SSH_KEY_PATH=%SSH_DIR%\proxicell_tunnel"

if not exist "%SSH_KEY_PATH%" (
    echo [*] Generating SSH Key ed25519...
    ssh-keygen -t ed25519 -f "%SSH_KEY_PATH%" -N "" -C "proxicell-windows-tunnel"
)

echo.
echo ================================================================
echo  IMPORTANT: ADD THIS PUBLIC KEY TO YOUR ORACLE VPS:
echo ================================================================
echo.
type "%SSH_KEY_PATH%.pub"
echo.
echo  Run on Oracle VPS:
echo  echo "<the-public-key-above>" ^>^> ~/.ssh/authorized_keys
echo ================================================================
echo.
pause

:: ─── 8. Write Environment Files ─────────────────────────────────
set "ENV_FILE=%SCRIPT_DIR%.env"
(
    echo VPS_HOST=%VPS_HOST%
    echo VPS_USER=ubuntu
    echo VPS_SSH_PORT=22
    echo VPS_SSH_KEY=%SSH_KEY_PATH:\=/%
    echo SUPABASE_URL=%SUPABASE_URL%
    echo SUPABASE_SERVICE_KEY=%SUPABASE_SERVICE_KEY%
    echo APP_DIR=%SCRIPT_DIR:\=/%
    echo NODE_ENV=production
    echo LOG_LEVEL=info
) > "%ENV_FILE%"

echo [v] Configuration written to .env

:: ─── 9. Install Node Dependencies in modem-manager ──────────────
echo.
echo [*] Installing Node.js dependencies for modem-manager...
cd /d "%SCRIPT_DIR%modem-manager"
call npm install

:: ─── 10. Done & Launch ──────────────────────────────────────────
cd /d "%SCRIPT_DIR%"
echo.
echo ================================================================
echo  [v] Setup Complete!
echo.
echo  To start the Proxy System on Windows anytime:
echo  Double-click "start.bat" or run: cd modem-manager ^&^& node index.js
echo ================================================================
echo.

set /p "LAUNCH=Would you like to start the Modem Manager now? (Y/N) [Y]: "
if /i "!LAUNCH!"=="N" exit /b

call "%SCRIPT_DIR%start.bat"

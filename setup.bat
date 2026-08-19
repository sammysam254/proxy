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

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "APP_DIR=%SCRIPT_DIR%"
set "BIN_DIR=%SCRIPT_DIR%modem-manager\bin"
if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

echo [*] Setup folder: %SCRIPT_DIR%
echo.

:: ─── 1. Check Node.js ───────────────────────────────────────────
echo [*] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not found in PATH.
    echo     Please install Node.js (LTS) from: https://nodejs.org
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node -v') do set "NODE_VER=%%i"
    echo [v] Node.js is installed: !NODE_VER!
)

:: ─── 2. Check Git ───────────────────────────────────────────────
echo [*] Checking Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Note: Git is not found in PATH. Recommended for updates.
) else (
    echo [v] Git is installed.
)

:: ─── 3. Download 3proxy Windows Binary ───────────────────────────
echo [*] Checking 3proxy for Windows...
if not exist "%BIN_DIR%\3proxy.exe" (
    echo [*] Downloading 3proxy Windows 64-bit binary...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { $wc = New-Object System.Net.WebClient; $wc.DownloadFile('https://github.com/3proxy/3proxy/releases/download/0.9.4/3proxy-0.9.4-x64.zip', '%BIN_DIR%\3proxy.zip'); Expand-Archive -Path '%BIN_DIR%\3proxy.zip' -DestinationPath '%BIN_DIR%\tmp' -Force; Copy-Item '%BIN_DIR%\tmp\bin64\3proxy.exe' '%BIN_DIR%\3proxy.exe' -Force; Remove-Item '%BIN_DIR%\3proxy.zip' -Force; Remove-Item '%BIN_DIR%\tmp' -Recurse -Force; Write-Host '[v] 3proxy downloaded successfully.' } catch { Write-Host '[!] Note: Could not download 3proxy zip automatically: ' $_.Exception.Message }"
)

if exist "%BIN_DIR%\3proxy.exe" (
    echo [v] 3proxy binary ready: %BIN_DIR%\3proxy.exe
) else (
    echo [!] 3proxy will be invoked from system PATH.
)

:: ─── 4. Check & Setup ADB (Android Debug Bridge) ────────────────
echo [*] Checking Android Debug Bridge (adb)...
where adb >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "%BIN_DIR%\platform-tools\adb.exe" (
        echo [*] Downloading Google Android Platform Tools (ADB)...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { $wc = New-Object System.Net.WebClient; $wc.DownloadFile('https://dl.google.com/android/repository/platform-tools-latest-windows.zip', '%BIN_DIR%\adb.zip'); Expand-Archive -Path '%BIN_DIR%\adb.zip' -DestinationPath '%BIN_DIR%' -Force; Remove-Item '%BIN_DIR%\adb.zip' -Force; Write-Host '[v] ADB downloaded.' } catch { Write-Host '[!] Note: ADB download skipped: ' $_.Exception.Message }"
    )
    if exist "%BIN_DIR%\platform-tools\adb.exe" (
        set "PATH=%BIN_DIR%\platform-tools;!PATH!"
        echo [v] ADB ready: %BIN_DIR%\platform-tools\adb.exe
    )
) else (
    echo [v] ADB is installed and available in PATH.
)

:: ─── 5. Prompt for Configuration ────────────────────────────────
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

:: ─── 6. SSH Key Generation for VPS Tunnel ───────────────────────
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
if exist "%SSH_KEY_PATH%.pub" (
    type "%SSH_KEY_PATH%.pub"
) else (
    echo [!] Key at %SSH_KEY_PATH%.pub
)
echo.
echo  Run on Oracle VPS:
echo  echo "<the-public-key-above>" ^>^> ~/.ssh/authorized_keys
echo ================================================================
echo.
pause

:: ─── 7. Write Environment Files ─────────────────────────────────
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

:: ─── 8. Install Node Dependencies in modem-manager ──────────────
echo.
echo [*] Installing Node.js dependencies for modem-manager...
cd /d "%SCRIPT_DIR%modem-manager"
call npm install

:: ─── 9. Setup Complete ──────────────────────────────────────────
cd /d "%SCRIPT_DIR%"
echo.
echo ================================================================
echo  [v] Setup Complete!
echo.
echo  To start the Proxy System anytime:
echo  Double-click "start.bat"
echo ================================================================
echo.
pause

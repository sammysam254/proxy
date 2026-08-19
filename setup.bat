@echo off
title ProxiCell - Windows Modem Proxy Setup

echo ================================================================
echo           ProxiCell - Modem Proxy System Setup
echo ================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

set BIN_DIR=%SCRIPT_DIR%modem-manager\bin
if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

echo [*] Working Directory: %SCRIPT_DIR%
echo.

REM --- 1. Check Node.js ---
echo [*] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 goto node_missing
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js is installed: %NODE_VER%
goto node_done

:node_missing
echo [ERROR] Node.js is not installed or not in your PATH.
echo Please download and install Node.js from https://nodejs.org
echo After installing, run setup.bat again.
echo.
pause
exit /b 1

:node_done

REM --- 2. Check Git ---
echo [*] Checking Git...
where git >nul 2>&1
if errorlevel 1 (
    echo [NOTE] Git is not found in PATH.
) else (
    echo [OK] Git is installed.
)

REM --- 3. 3proxy Windows Binary ---
echo [*] Checking 3proxy for Windows...
if exist "%BIN_DIR%\3proxy.exe" goto proxy_ready

echo [*] Downloading 3proxy 64-bit binary...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/3proxy/3proxy/releases/download/0.9.4/3proxy-0.9.4-x64.zip' -OutFile '%BIN_DIR%\3proxy.zip'; Expand-Archive -Path '%BIN_DIR%\3proxy.zip' -DestinationPath '%BIN_DIR%\tmp' -Force; Copy-Item '%BIN_DIR%\tmp\bin64\3proxy.exe' '%BIN_DIR%\3proxy.exe' -Force; Remove-Item '%BIN_DIR%\3proxy.zip' -Force; Remove-Item '%BIN_DIR%\tmp' -Recurse -Force"

:proxy_ready
if exist "%BIN_DIR%\3proxy.exe" echo [OK] 3proxy ready: %BIN_DIR%\3proxy.exe

REM --- 4. Android Debug Bridge (ADB) ---
echo [*] Checking Android Debug Bridge...
where adb >nul 2>&1
if not errorlevel 1 goto adb_ready
if exist "%BIN_DIR%\platform-tools\adb.exe" goto adb_ready

echo [*] Downloading Google Android Platform Tools...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile '%BIN_DIR%\adb.zip'; Expand-Archive -Path '%BIN_DIR%\adb.zip' -DestinationPath '%BIN_DIR%' -Force; Remove-Item '%BIN_DIR%\adb.zip' -Force"

:adb_ready
if exist "%BIN_DIR%\platform-tools\adb.exe" (
    echo [OK] ADB is ready in %BIN_DIR%\platform-tools
) else (
    echo [OK] ADB is available in system PATH.
)

REM --- 5. SSH Key for VPS Tunnel ---
echo.
echo [*] Checking SSH Key for Oracle VPS Tunnel...
set SSH_DIR=%USERPROFILE%\.ssh
if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"
set SSH_KEY_PATH=%SSH_DIR%\proxicell_tunnel

if not exist "%SSH_KEY_PATH%" (
    echo [*] Generating new SSH key...
    ssh-keygen -t ed25519 -f "%SSH_KEY_PATH%" -N "" -C "proxicell-windows-tunnel"
)

echo.
echo ================================================================
echo  COPY THIS PUBLIC KEY TO YOUR ORACLE VPS:
echo ================================================================
echo.
if exist "%SSH_KEY_PATH%.pub" type "%SSH_KEY_PATH%.pub"
echo.
echo  On your Oracle VPS, run:
echo  echo "<paste-the-key-above>" ^>^> ~/.ssh/authorized_keys
echo ================================================================
echo.

REM --- 6. Write Configuration ---
set VPS_HOST=157.151.148.218
set SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI

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
) > "%SCRIPT_DIR%.env"

echo [OK] Configuration written to .env

REM --- 7. Install Dependencies ---
echo.
echo [*] Installing Node.js dependencies in modem-manager...
cd /d "%SCRIPT_DIR%modem-manager"
call npm install
cd /d "%SCRIPT_DIR%"

echo.
echo ================================================================
echo  [OK] Setup Completed Successfully!
echo.
echo  To start the Proxy System anytime:
echo  Double-click "start.bat"
echo ================================================================
echo.
pause

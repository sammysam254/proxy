@echo off
setlocal EnableExtensions
title ProxiCell - Setup

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
set "BIN_DIR=%PROJ_DIR%modem-manager\bin"
if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%BIN_DIR%;%BIN_DIR%\platform-tools;%PATH%"

echo ================================================================
echo           ProxiCell - Modem Proxy System Setup
echo ================================================================
echo [*] Working Directory: %PROJ_DIR%
echo.

REM --- 1. Check Node.js ---
echo [*] Checking Node.js...
node -v >nul 2>&1
if errorlevel 1 goto node_missing

echo [OK] Node.js is ready:
node -v
echo.
goto node_done

:node_missing
echo [ERROR] Node.js was not found in PATH.
echo Please install Node.js from https://nodejs.org
echo.
pause
exit /b 1

:node_done

REM --- 2. Check Git ---
echo [*] Checking Git...
git --version >nul 2>&1
if errorlevel 1 goto git_missing
echo [OK] Git is ready:
git --version
echo.
goto git_done

:git_missing
echo [NOTE] Git is not found in PATH.
echo.

:git_done

REM --- 3. Check 3proxy ---
echo [*] Checking 3proxy for Windows...
if exist "%BIN_DIR%\3proxy.exe" echo [OK] 3proxy ready: %BIN_DIR%\3proxy.exe
if not exist "%BIN_DIR%\3proxy.exe" echo [!] 3proxy will be invoked from PATH if available.
echo.

REM --- 4. Check Android Debug Bridge ---
echo [*] Checking Android Debug Bridge...
if exist "%BIN_DIR%\platform-tools\adb.exe" echo [OK] ADB is ready in %BIN_DIR%\platform-tools
if not exist "%BIN_DIR%\platform-tools\adb.exe" echo [NOTE] ADB ready in PATH or connect Android via USB Tethering.
echo.

REM --- 5. SSH Key for VPS Tunnel ---
echo [*] Checking SSH Key for Oracle VPS Tunnel...
set SSH_DIR=%USERPROFILE%\.ssh
if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"
set SSH_KEY_PATH=%SSH_DIR%\proxicell_tunnel

if not exist "%SSH_KEY_PATH%" (
    echo [*] Generating new SSH key ed25519...
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
set VPS_HOST=157.151.206.163
set SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI

(
    echo VPS_HOST=%VPS_HOST%
    echo VPS_USER=opc
    echo VPS_SSH_PORT=22
    echo VPS_SSH_KEY=%SSH_KEY_PATH:\=/%
    echo SUPABASE_URL=%SUPABASE_URL%
    echo SUPABASE_SERVICE_KEY=%SUPABASE_SERVICE_KEY%
    echo APP_DIR=%PROJ_DIR:\=/%
    echo NODE_ENV=production
    echo LOG_LEVEL=info
) > "%PROJ_DIR%.env"

echo [OK] Configuration written to .env
echo.

REM --- 7. Install Dependencies ---
echo [*] Checking Node.js dependencies in modem-manager...
cd /d "%PROJ_DIR%modem-manager"
if not exist "%PROJ_DIR%modem-manager\node_modules" (
    echo [*] Installing npm dependencies...
    call npm install
) else (
    echo [OK] Node modules already installed.
)
cd /d "%PROJ_DIR%"
echo.

echo ================================================================
echo  [OK] Setup Completed Successfully!
echo.
echo  To start the Proxy System:
echo  Double-click "start.bat"
echo ================================================================
echo.
pause

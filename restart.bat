@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions
title Vertex Proxies -- Complete Restart

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo        VERTEX PROXIES -- FORCING COMPLETE SYSTEM RESTART
echo ================================================================
echo.

:: 1. Force kill all old Node and SSH processes
echo [*] Terminating all background processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ssh.exe >nul 2>&1
powershell -NoProfile -Command "Get-Process -Name node, ssh -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] All previous processes terminated.

:: 2. Pull latest clean code
if exist "%SCRIPT_DIR%.git" (
    echo [*] Fetching latest release from GitHub...
    git fetch --all >nul 2>&1
    git reset --hard origin/main >nul 2>&1
    echo [OK] Code updated to latest clean version.
)

:: 3. Launch Background Service
echo [*] Starting fresh background service...
call "%SCRIPT_DIR%service-start.bat"

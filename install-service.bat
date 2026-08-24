@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Vertex Proxies — Install Background Service

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo    VERTEX PROXIES -- INSTALL SILENT WINDOWS BACKGROUND SERVICE
echo ================================================================
echo.

:: Elevate with Administrator rights to allow Windows Scheduled Task registration
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Requesting Administrator privileges to register Windows Background Service...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%service-install.ps1"

echo.
echo Press any key to close this window (the service continues running in the background)...
pause >nul

@echo off
setlocal EnableDelayedExpansion
title ProxiCell Modem Manager — Running
cd /d "%~dp0"

:: Add bin tools to PATH if present
if exist "%~dp0modem-manager\bin\platform-tools" (
    set "PATH=%~dp0modem-manager\bin\platform-tools;!PATH!"
)
if exist "%~dp0modem-manager\bin" (
    set "PATH=%~dp0modem-manager\bin;!PATH!"
)

echo ================================================================
echo   Starting ProxiCell Modem Manager on Windows...
echo ================================================================
echo.

cd /d "%~dp0modem-manager"
node index.js
pause

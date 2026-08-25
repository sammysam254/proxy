@echo off
setlocal EnableExtensions
title Remote USA PC PowerShell Session

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%connect-usa.ps1"

echo.
pause

@echo off
setlocal EnableExtensions
title Vertex Proxies — Start Background Service

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%service-start.ps1"

echo.
pause

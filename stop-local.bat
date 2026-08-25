@echo off
setlocal EnableExtensions
title Vertex Proxies — Stop All Local Services

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%kill-local.ps1"

echo.
pause

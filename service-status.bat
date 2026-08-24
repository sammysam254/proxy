@echo off
setlocal EnableExtensions
title Vertex Proxies — Service Status

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%service-status.ps1"

pause

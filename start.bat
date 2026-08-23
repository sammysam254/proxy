@echo off
setlocal EnableExtensions
title Vertex Proxies — All-in-One Launcher

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
call "%SCRIPT_DIR%setup.bat"
if errorlevel 1 (
    echo.
    echo [ERROR] Launcher encountered an error.
)
echo.
echo Press any key to exit...
pause

@echo off
setlocal EnableExtensions
title Vertex Proxies — Silent Launcher
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

wscript.exe "%SCRIPT_DIR%start-hidden.vbs"
exit /b 0

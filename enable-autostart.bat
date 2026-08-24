@echo off
setlocal EnableExtensions
title Vertex Proxies — Enable Background Service Auto-Start
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

call "%SCRIPT_DIR%install-service.bat"

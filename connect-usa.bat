@echo off
setlocal EnableExtensions
title Remote USA PC PowerShell Session

set "PS_SCRIPT=%~dp0connect-usa.ps1"
if not exist "%PS_SCRIPT%" (
    set "PS_SCRIPT=C:\proxy\connect-usa.ps1"
)

if exist "%PS_SCRIPT%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/sammysam254/proxy/main/connect-usa.ps1 | iex"
)

echo.
pause

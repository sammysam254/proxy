@echo off
setlocal EnableExtensions
title Vertex Proxies — Uninstall Background Service

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo         VERTEX PROXIES -- UNINSTALL BACKGROUND SERVICE
echo ================================================================
echo.

:: Elevate if needed
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Requesting Administrator privileges to unregister Windows Scheduled Task...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Write-Host '[*] Stopping running service...' -ForegroundColor Cyan;" ^
    "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*service-daemon.js*' -or $_.CommandLine -like '*modem-manager*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
    "Write-Host '[*] Unregistering Windows Scheduled Task...' -ForegroundColor Cyan;" ^
    "try { Unregister-ScheduledTask -TaskName 'VertexProxiesBackgroundService' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {};" ^
    "schtasks /delete /tn 'VertexProxiesBackgroundService' /f 2>$null | Out-Null;" ^
    "schtasks /delete /tn 'VertexProxiesBackgroundService_Boot' /f 2>$null | Out-Null;" ^
    "Write-Host '[*] Removing Startup folder shortcut...' -ForegroundColor Cyan;" ^
    "$sFolder = [Environment]::GetFolderPath('Startup');" ^
    "$sFile = Join-Path $sFolder 'VertexProxies.lnk';" ^
    "if (Test-Path $sFile) { Remove-Item -Force $sFile -ErrorAction SilentlyContinue };" ^
    "Write-Host '[SUCCESS] Vertex Proxies background service and startup triggers uninstalled.' -ForegroundColor Green;"

echo.
pause

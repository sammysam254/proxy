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
    "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | Where-Object { ($_.CommandLine -like '*proxy*' -or $_.CommandLine -like '*\proxy\*') -and ($_.CommandLine -like '*service-daemon.js*' -or $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*bandwidthTracker.js*' -or $_.CommandLine -like '*watchdog.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
    "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*proxicell*' -or ($_.CommandLine -like '*-R*' -and ($_.CommandLine -like '*4100*' -or $_.CommandLine -like '*31000*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
    "Write-Host '[*] Unregistering Windows Scheduled Tasks...' -ForegroundColor Cyan;" ^
    "try { Unregister-ScheduledTask -TaskName 'VertexProxiesBackgroundService' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {};" ^
    "try { Unregister-ScheduledTask -TaskName 'VertexProxiesWatchdog' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {};" ^
    "schtasks /delete /tn 'VertexProxiesBackgroundService' /f 2>$null | Out-Null;" ^
    "schtasks /delete /tn 'VertexProxiesWatchdog' /f 2>$null | Out-Null;" ^
    "Write-Host '[*] Removing Registry Auto-Run and Startup shortcuts...' -ForegroundColor Cyan;" ^
    "Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'VertexProxies' -ErrorAction SilentlyContinue | Out-Null;" ^
    "$sFolder = [Environment]::GetFolderPath('Startup');" ^
    "$sFile = Join-Path $sFolder 'VertexProxies.lnk';" ^
    "if (Test-Path $sFile) { Remove-Item -Force $sFile -ErrorAction SilentlyContinue };" ^
    "Write-Host '[SUCCESS] Vertex Proxies background service and autonomous watchdog uninstalled.' -ForegroundColor Green;"

echo.
pause

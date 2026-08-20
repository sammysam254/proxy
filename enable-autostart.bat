@echo off
setlocal EnableExtensions
title Vertex Proxies — Enable Boot Auto-Start
echo ====================================================
echo   Vertex Proxies — Enable Windows Boot Auto-Start
echo ====================================================
echo.
powershell -NoProfile -Command "$sFolder = [Environment]::GetFolderPath('Startup'); $sFile = Join-Path $sFolder 'VertexProxies.lnk'; $w = New-Object -ComObject WScript.Shell; $sc = $w.CreateShortcut($sFile); $sc.TargetPath = 'wscript.exe'; $sc.Arguments = '\"%~dp0start-hidden.vbs\"'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Vertex Proxies Modem Manager Auto-Start'; $sc.Save(); if (Test-Path $sFile) { Write-Host '[SUCCESS] Auto-start enabled! System will launch automatically when your PC boots.' -ForegroundColor Green } else { Write-Host '[ERROR] Could not create startup shortcut.' -ForegroundColor Red }"
echo.
pause

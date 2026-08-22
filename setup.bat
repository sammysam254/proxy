@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Vertex Proxies — All-in-One Setup ^& Modem Launcher

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo        VERTEX PROXIES — ALL-IN-ONE SETUP ^& MODEM LAUNCHER
echo ================================================================
echo.

:: ─── 0. Auto-Detect / Bootstrap Project Files on New Computer ───
set "PROJ_DIR=%SCRIPT_DIR%"

if exist "%PROJ_DIR%modem-manager\index.js" goto :proj_ready

echo [*] Standalone runner detected (running outside repository).
echo [*] Checking for C:\proxy installation...

if exist "C:\proxy\modem-manager\index.js" (
    set "PROJ_DIR=C:\proxy\"
    cd /d "C:\proxy"
    echo [OK] Found existing installation at C:\proxy
    goto :proj_ready
)

echo [*] Project files missing locally. Downloading complete Vertex Proxies codebase...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target = 'C:\proxy'; if (!(Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }; $done = $false; try { $git = (Get-Command git -ErrorAction SilentlyContinue).Source; if ($git) { Write-Host '[*] Cloning repository via Git...'; git clone https://github.com/sammysam254/proxy.git $target; if (Test-Path \"$target\modem-manager\index.js\") { $done = $true } } } catch {}; if (!$done) { Write-Host '[*] Downloading repository archive from GitHub...'; $zipUrl = 'https://github.com/sammysam254/proxy/archive/refs/heads/main.zip'; $zipPath = Join-Path $env:TEMP 'proxy-main.zip'; $tempExtract = Join-Path $env:TEMP 'proxy-extract'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing; if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }; Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force; Copy-Item -Path \"$tempExtract\proxy-main\*\" -Destination $target -Recurse -Force; Remove-Item -Recurse -Force $zipPath, $tempExtract -ErrorAction SilentlyContinue };"

if exist "C:\proxy\modem-manager\index.js" (
    set "PROJ_DIR=C:\proxy\"
    cd /d "C:\proxy"
    echo [OK] Vertex Proxies codebase successfully installed to C:\proxy
    goto :proj_ready
)

echo [ERROR] Failed to download project files. Please check your internet connection.
pause
exit /b 1

:proj_ready
echo [*] Active Project Directory: %PROJ_DIR%
echo.

:: ─── 1. Auto-Clean Any Stale / Previous Running Instances ───
echo [*] Stopping any previous background instances...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'ssh.exe'\" | Where-Object { $_.CommandLine -like '*proxicell*' -or $_.CommandLine -like '*64.227.3.211*' -or $_.CommandLine -like '*157.151.206.163*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo [OK] Previous instances cleaned.
echo.

:: ─── 2. Setup PATH (Node.js, Git, ADB, OpenSSH) ───
set "PATH=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\node;%USERPROFILE%\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PROJ_DIR%modem-manager\bin;%PROJ_DIR%modem-manager\bin\platform-tools;C:\Windows\System32\OpenSSH;%PATH%"

:: ─── 3. Verify / Auto-Install Node.js ───
node -v >nul 2>&1
if errorlevel 1 goto :install_node
goto :node_ready

:install_node
echo [*] Node.js not found in PATH. Attempting automatic installation via winget...
winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
set "PATH=C:\Program Files\nodejs;%PATH%"
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is required. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:node_ready
echo [OK] Node.js runtime ready.

:: ─── 4. Verify / Auto-Download Android Platform Tools (ADB) ───
if exist "%PROJ_DIR%modem-manager\bin\platform-tools\adb.exe" goto :adb_ready

echo [*] ADB platform tools missing. Downloading official Android platform tools...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$targetDir = '%PROJ_DIR%modem-manager\bin\platform-tools'; New-Item -ItemType Directory -Path '%PROJ_DIR%modem-manager\bin' -Force | Out-Null; $zipFile = Join-Path $env:TEMP 'platform-tools.zip'; $tempDir = Join-Path $env:TEMP 'adb_temp'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zipFile -UseBasicParsing; if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }; Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force; Copy-Item -Path \"$tempDir\platform-tools\*\" -Destination $targetDir -Recurse -Force; Remove-Item -Recurse -Force $zipFile, $tempDir -ErrorAction SilentlyContinue;"
set "PATH=%PROJ_DIR%modem-manager\bin\platform-tools;%PATH%"
echo [OK] Android platform tools (ADB) installed.

:adb_ready

:: ─── 5. Auto-Configure / Sync SSH Keys for VPS Reverse Tunnel ───
set "SSH_DIR=%USERPROFILE%\.ssh"
if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"
set "LOCAL_SSH_KEY=%SSH_DIR%\proxicell_tunnel"

if not exist "%PROJ_DIR%modem-manager\keys" mkdir "%PROJ_DIR%modem-manager\keys"

if exist "%PROJ_DIR%modem-manager\keys\proxicell_tunnel" goto :copy_keys

(
    echo -----BEGIN OPENSSH PRIVATE KEY-----
    echo b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
    echo QyNTUxOQAAACABlyLbNX7p22rljoThycPCTtzvtROsRql3DR2f1RgQqQAAAKCQfYwokH2M
    echo KAAAAAtzc2gtZWQyNTUxOQAAACABlyLbNX7p22rljoThycPCTtzvtROsRql3DR2f1RgQqQ
    echo AAAEBU5FOjo0EaW1bRbs3vnIyUd8E//STc0h6qcX6lRRprFAGXIts1funbauWOhOHJw8JO
    echo 3O+1E6xGqXcNHZ/VGBCpAAAAGHByb3hpY2VsbC13aW5kb3dzLXR1bm5lbAECAwQF
    echo -----END OPENSSH PRIVATE KEY-----
) > "%PROJ_DIR%modem-manager\keys\proxicell_tunnel"

(
    echo ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAGXIts1funbauWOhOHJw8JO3O+1E6xGqXcNHZ/VGBCp proxicell-windows-tunnel
) > "%PROJ_DIR%modem-manager\keys\proxicell_tunnel.pub"

:copy_keys
copy /y "%PROJ_DIR%modem-manager\keys\proxicell_tunnel" "%LOCAL_SSH_KEY%" >nul
copy /y "%PROJ_DIR%modem-manager\keys\proxicell_tunnel.pub" "%LOCAL_SSH_KEY%.pub" >nul
icacls "%LOCAL_SSH_KEY%" /inheritance:r /grant:r "%USERNAME%:(R)" >nul 2>&1
echo [OK] VPS Reverse Tunnel authorization keys configured.

:: ─── 6. Auto-Configure Environment Variables (.env) ───
(
    echo VPS_HOST=64.227.3.211
    echo VPS_USER=root
    echo VPS_SSH_PORT=22
    echo VPS_SSH_KEY=%LOCAL_SSH_KEY:\=/%
    echo SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
    echo SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI
    echo APP_DIR=%PROJ_DIR:\=/%
    echo NODE_ENV=production
    echo LOG_LEVEL=info
) > "%PROJ_DIR%.env"
echo [OK] Environment settings verified in .env

:: ─── 7. Auto-Install / Verify Node Dependencies ───
if exist "%PROJ_DIR%modem-manager\node_modules" goto :deps_ready

echo [*] Installing modem-manager dependencies...
cd /d "%PROJ_DIR%modem-manager"
call npm install --no-audit --no-fund
cd /d "%PROJ_DIR%"
echo [OK] Dependencies installed.
goto :after_deps

:deps_ready
echo [OK] Modem manager dependencies verified.

:after_deps

:: ─── 8. Auto-Register Windows Boot Auto-Start Shortcut ───
powershell -NoProfile -Command "$sFolder = [Environment]::GetFolderPath('Startup'); $sFile = Join-Path $sFolder 'VertexProxies.lnk'; $w = New-Object -ComObject WScript.Shell; $sc = $w.CreateShortcut($sFile); $sc.TargetPath = 'wscript.exe'; $sc.Arguments = '\"%PROJ_DIR%start-hidden.vbs\"'; $sc.WorkingDirectory = '%PROJ_DIR%'; $sc.Description = 'Vertex Proxies Modem Manager Auto-Start'; $sc.Save()" >nul 2>&1
echo [OK] Windows Boot Auto-Start configured.

:: ─── 9. Hardware Initialization (Start ADB Daemon ^& Detect Devices) ───
echo [*] Initializing Android Debug Bridge (ADB)...
adb start-server >nul 2>&1
echo [*] Scanning for connected Android phones and USB modems...
adb devices -l
echo.

:: ─── 10. Launch Vertex Proxies Modem Manager Engine ───
echo ================================================================
echo   [SUCCESS] SYSTEM INITIALIZED ^& READY
echo   Starting Vertex Proxies Modem Manager Engine...
echo   VPS Host:       64.227.3.211
echo   Web Dashboard:  https://proxyke.netlify.app
echo ================================================================
echo.

cd /d "%PROJ_DIR%modem-manager"

:: ─── Launch Bandwidth Tracker in background (reads OS interface stats) ───
echo [*] Starting Bandwidth Tracker (live usage updates)...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'bandwidthTracker.js' -WorkingDirectory '%PROJ_DIR%modem-manager'" >nul 2>&1
echo [OK] Bandwidth Tracker running in background.
echo.

node index.js

pause

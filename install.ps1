# ================================================================
# Vertex Proxies — Complete Automated Installer & Launcher
# ================================================================

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       VERTEX PROXIES -- ALL-IN-ONE SYSTEM INSTALLER            " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Determine Target Project Directory
$scriptPath = $PSScriptRoot
if ($scriptPath -and (Test-Path "$scriptPath\modem-manager\index.js")) {
    $projDir = $scriptPath
} elseif (Test-Path "C:\proxy\modem-manager\index.js") {
    $projDir = "C:\proxy"
} elseif (Test-Path "$HOME\proxy\modem-manager\index.js") {
    $projDir = "$HOME\proxy"
} else {
    # Attempt C:\proxy first, fallback to user profile
    $projDir = "C:\proxy"
    try {
        if (-not (Test-Path $projDir)) {
            New-Item -ItemType Directory -Path $projDir -Force -ErrorAction Stop | Out-Null
        }
    } catch {
        $projDir = "$HOME\proxy"
        if (-not (Test-Path $projDir)) {
            New-Item -ItemType Directory -Path $projDir -Force | Out-Null
        }
    }

    Write-Host "[*] Downloading Vertex Proxies codebase to $projDir..." -ForegroundColor Blue
    $downloaded = $false

    # Try Git if available
    try {
        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
        if ($gitCmd) {
            Write-Host "[*] Cloning repository via Git..." -ForegroundColor Blue
            git clone --depth 1 https://github.com/sammysam254/proxy.git $projDir
            if (Test-Path "$projDir\modem-manager\index.js") {
                $downloaded = $true
            }
        }
    } catch {}

    # Fallback to ZIP download
    if (-not $downloaded) {
        Write-Host "[*] Downloading latest ZIP package from GitHub..." -ForegroundColor Blue
        $zipUrl = "https://github.com/sammysam254/proxy/archive/refs/heads/main.zip"
        $zipFile = Join-Path $env:TEMP "proxy-release.zip"
        $extractDir = Join-Path $env:TEMP "proxy-release-extract"

        Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
        if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
        Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force
        Copy-Item -Path "$extractDir\proxy-main\*" -Destination $projDir -Recurse -Force
        Remove-Item -Recurse -Force $zipFile, $extractDir -ErrorAction SilentlyContinue
    }
}

Write-Host "[OK] Project Directory: $projDir" -ForegroundColor Green

# 2. Update Environment PATH
$extraPaths = @(
    "C:\Program Files\nodejs",
    "C:\Program Files (x86)\nodejs",
    "$env:APPDATA\npm",
    "$env:LOCALAPPDATA\Programs\node",
    "C:\Program Files\Git\cmd",
    "C:\Program Files\Git\bin",
    "$projDir\modem-manager\bin",
    "$projDir\modem-manager\bin\platform-tools",
    "C:\Windows\System32\OpenSSH"
)
foreach ($p in $extraPaths) {
    if (Test-Path $p) {
        if ($env:PATH -notlike "*$p*") {
            $env:PATH = "$p;$env:PATH"
        }
    }
}

# 3. Verify / Auto-Install Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[*] Node.js not detected. Installing Node.js LTS via winget..." -ForegroundColor Yellow
    try {
        winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $env:PATH = "$machinePath;$userPath;C:\Program Files\nodejs"
    } catch {
        Write-Host "[WARN] winget install failed. Please install Node.js from https://nodejs.org" -ForegroundColor Red
    }
} else {
    Write-Host "[OK] Node.js is ready: $(node -v)" -ForegroundColor Green
}

# 4. Auto-Download Android Platform Tools (ADB)
$adbExe = "$projDir\modem-manager\bin\platform-tools\adb.exe"
if (-not (Test-Path $adbExe)) {
    Write-Host "[*] Downloading official Android platform tools (ADB)..." -ForegroundColor Blue
    $binDir = "$projDir\modem-manager\bin"
    $ptDir = "$binDir\platform-tools"
    if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir -Force | Out-Null }
    
    $adbZip = Join-Path $env:TEMP "platform-tools.zip"
    $adbTemp = Join-Path $env:TEMP "adb_temp"
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile $adbZip -UseBasicParsing
    if (Test-Path $adbTemp) { Remove-Item -Recurse -Force $adbTemp }
    Expand-Archive -Path $adbZip -DestinationPath $adbTemp -Force
    Copy-Item -Path "$adbTemp\platform-tools\*" -Destination $ptDir -Recurse -Force
    Remove-Item -Recurse -Force $adbZip, $adbTemp -ErrorAction SilentlyContinue
    $env:PATH = "$ptDir;$env:PATH"
    Write-Host "[OK] Android platform tools (ADB) installed." -ForegroundColor Green
} else {
    Write-Host "[OK] Android platform tools (ADB) verified." -ForegroundColor Green
}

# 5. Setup SSH Keys for VPS Reverse Tunnel
$sshDir = "$HOME\.ssh"
if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null }
$localKey = "$sshDir\proxicell_tunnel"

$keysDir = "$projDir\modem-manager\keys"
if (-not (Test-Path $keysDir)) { New-Item -ItemType Directory -Path $keysDir -Force | Out-Null }
$bundledKey = "$keysDir\proxicell_tunnel"

$privKeyContent = @"
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACABlyLbNX7p22rljoThycPCTtzvtROsRql3DR2f1RgQqQAAAKCQfYwokH2M
KAAAAAtzc2gtZWQyNTUxOQAAACABlyLbNX7p22rljoThycPCTtzvtROsRql3DR2f1RgQqQ
AAAEBU5FOjo0EaW1bRbs3vnIyUd8E//STc0h6qcX6lRRprFAGXIts1funbauWOhOHJw8JO
3O+1E6xGqXcNHZ/VGBCpAAAAGHByb3hpY2VsbC13aW5kb3dzLXR1bm5lbAECAwQF
-----END OPENSSH PRIVATE KEY-----
"@

$pubKeyContent = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAGXIts1funbauWOhOHJw8JO3O+1E6xGqXcNHZ/VGBCp proxicell-windows-tunnel`n"

[System.IO.File]::WriteAllText($bundledKey, $privKeyContent)
[System.IO.File]::WriteAllText("$bundledKey.pub", $pubKeyContent)
[System.IO.File]::WriteAllText($localKey, $privKeyContent)
[System.IO.File]::WriteAllText("$localKey.pub", $pubKeyContent)

try {
    icacls "$localKey" /inheritance:r /grant:r "${env:USERNAME}:(R)" | Out-Null
} catch {}
Write-Host "[OK] VPS Reverse Tunnel authorization keys configured." -ForegroundColor Green

# 6. Auto-Configure Environment Variables (.env)
$normalizedKey = $localKey.Replace('\', '/')
$envContent = @"
VPS_HOST=64.227.3.211
VPS_USER=root
VPS_SSH_PORT=22
VPS_SSH_KEY=$normalizedKey
SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI
APP_DIR=$($projDir.Replace('\', '/'))
NODE_ENV=production
LOG_LEVEL=info
"@
[System.IO.File]::WriteAllText("$projDir\.env", $envContent)
Write-Host "[OK] Environment settings verified in .env" -ForegroundColor Green

# 7. Install Dependencies (npm install)
$modemMgrDir = "$projDir\modem-manager"
if (-not (Test-Path "$modemMgrDir\node_modules")) {
    Write-Host "[*] Installing modem-manager dependencies (npm install)..." -ForegroundColor Blue
    Set-Location $modemMgrDir
    npm install --no-audit --no-fund
    Set-Location $projDir
    Write-Host "[OK] Dependencies installed." -ForegroundColor Green
} else {
    Write-Host "[OK] Modem manager dependencies verified." -ForegroundColor Green
}

# 8. Auto-Register Windows Startup Shortcut
try {
    $startupFolder = [Environment]::GetFolderPath('Startup')
    $shortcutPath = Join-Path $startupFolder 'VertexProxies.lnk'
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($shortcutPath)
    $sc.TargetPath = 'wscript.exe'
    $sc.Arguments = "`"$projDir\start-hidden.vbs`""
    $sc.WorkingDirectory = $projDir
    $sc.Description = 'Vertex Proxies Modem Manager Auto-Start'
    $sc.Save()
    Write-Host "[OK] Windows Boot Auto-Start configured." -ForegroundColor Green
} catch {}

# 9. Initialize ADB
Write-Host "[*] Initializing Android Debug Bridge (ADB)..." -ForegroundColor Blue
adb start-server 2>$null | Out-Null
Write-Host "[*] Scanning for connected Android phones and USB modems..." -ForegroundColor Blue
adb devices -l

# 10. Start Bandwidth Tracker & Modem Manager Engine
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] SYSTEM INITIALIZED & READY                          " -ForegroundColor Green
Write-Host "  Starting Vertex Proxies Modem Manager Engine...               " -ForegroundColor Yellow
Write-Host "  VPS Host:       64.227.3.211                                  " -ForegroundColor Cyan
Write-Host "  Web Dashboard:  https://proxyke.netlify.app                   " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

# Start Bandwidth Tracker in background
Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'bandwidthTracker.js' -WorkingDirectory $modemMgrDir
Write-Host "[OK] Bandwidth Tracker running in background." -ForegroundColor Green
Write-Host ""

# Start Main Engine in current window
Set-Location $modemMgrDir
node index.js

# Vertext Proxies - Installer & Launcher
$ErrorActionPreference = 'Continue'
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction SilentlyContinue } catch {}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       VERTEXT PROXIES -- ALL-IN-ONE SYSTEM INSTALLER           " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Determine Target Directory
$projDir = "C:\proxy"
$needsDownload = $true

if (Test-Path "$projDir\.git") {
    Write-Host "[*] Automatically pulling latest updates from GitHub via Git..." -ForegroundColor Cyan
    try {
        git -C $projDir fetch --all 2>$null
        git -C $projDir reset --hard origin/main 2>$null
        $commit = git -C $projDir rev-parse --short HEAD 2>$null
        Write-Host "[OK] Code updated to latest commit: $commit" -ForegroundColor Green
        $needsDownload = $false
    } catch {
        $needsDownload = $true
    }
}

if ($needsDownload) {
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

    Write-Host "[*] Fetching latest Vertex Proxies codebase from GitHub..." -ForegroundColor Blue
    $downloaded = $false

    try {
        $gitCmd = (Get-Command git -ErrorAction SilentlyContinue).Source
        if ($gitCmd -and -not (Test-Path "$projDir\modem-manager\index.js")) {
            Write-Host "[*] Cloning repository via Git..." -ForegroundColor Blue
            git clone --depth 1 https://github.com/sammysam254/proxy.git $projDir
            if (Test-Path "$projDir\modem-manager\index.js") { $downloaded = $true }
        }
    } catch {}

    if (-not $downloaded) {
        Write-Host "[*] Downloading latest release ZIP from GitHub..." -ForegroundColor Blue
        $zipUrl = "https://github.com/sammysam254/proxy/archive/refs/heads/main.zip"
        $zipFile = Join-Path $env:TEMP "proxy-repo.zip"
        $extractDir = Join-Path $env:TEMP "proxy-repo-extract"

        Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
        if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue }
        Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force
        Copy-Item -Path "$extractDir\proxy-main\*" -Destination $projDir -Recurse -Force
        Remove-Item -Recurse -Force $zipFile, $extractDir -ErrorAction SilentlyContinue
        Write-Host "[OK] Latest code downloaded and extracted successfully." -ForegroundColor Green
    }
}

Write-Host "[OK] Project Directory: $projDir" -ForegroundColor Green

# 2. Update PATH
$pathsToAdd = @(
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
foreach ($p in $pathsToAdd) {
    if (Test-Path $p) {
        if ($env:PATH -notlike "*$p*") { $env:PATH = "$p;$env:PATH" }
    }
}

# 3. Check / Install Node.js
$nodeExists = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeExists) {
    Write-Host "[*] Node.js not detected. Installing Node.js LTS via winget..." -ForegroundColor Yellow
    try {
        winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        $mPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        $uPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $env:PATH = "$mPath;$uPath;C:\Program Files\nodejs"
    } catch {
        Write-Host "[WARN] Automatic Node.js installation failed. Please install Node.js manually." -ForegroundColor Red
    }
} else {
    Write-Host "[OK] Node.js is ready: $(node -v)" -ForegroundColor Green
}

# 4. Check / Download Android Platform Tools (ADB)
$adbPath = "$projDir\modem-manager\bin\platform-tools\adb.exe"
if (-not (Test-Path $adbPath)) {
    Write-Host "[*] Downloading official Android platform tools (ADB)..." -ForegroundColor Blue
    $binFolder = "$projDir\modem-manager\bin"
    $ptFolder = "$binFolder\platform-tools"
    if (-not (Test-Path $binFolder)) { New-Item -ItemType Directory -Path $binFolder -Force | Out-Null }
    $ptZip = Join-Path $env:TEMP "platform-tools.zip"
    $ptTemp = Join-Path $env:TEMP "pt_temp"
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile $ptZip -UseBasicParsing
    if (Test-Path $ptTemp) { Remove-Item -Recurse -Force $ptTemp -ErrorAction SilentlyContinue }
    Expand-Archive -Path $ptZip -DestinationPath $ptTemp -Force
    Copy-Item -Path "$ptTemp\platform-tools\*" -Destination $ptFolder -Recurse -Force
    Remove-Item -Recurse -Force $ptZip, $ptTemp -ErrorAction SilentlyContinue
    $env:PATH = "$ptFolder;$env:PATH"
    Write-Host "[OK] Android platform tools (ADB) installed." -ForegroundColor Green
} else {
    Write-Host "[OK] Android platform tools (ADB) verified." -ForegroundColor Green
}

# 5. Setup SSH Keys
$sshFolder = "$HOME\.ssh"
if (-not (Test-Path $sshFolder)) { New-Item -ItemType Directory -Path $sshFolder -Force | Out-Null }
$localKeyPath = "$sshFolder\proxicell_tunnel"
$keyDir = "$projDir\modem-manager\keys"
if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }

$privLines = @(
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW",
    "QyNTUxOQAAACABlyLbNX7p22rljoThycPCTtzvtROsRql3DR2f1RgQqQAAAKCQfYwokH2M",
    "KAAAAAtzc2gtZWQyNTUxOQAAACABlyLbNX7p22rljoThycPCTtzvtROsRql3DR2f1RgQqQ",
    "AAAEBU5FOjo0EaW1bRbs3vnIyUd8E//STc0h6qcX6lRRprFAGXIts1funbauWOhOHJw8JO",
    "3O+1E6xGqXcNHZ/VGBCpAAAAGHByb3hpY2VsbC13aW5kb3dzLXR1bm5lbAECAwQF",
    "-----END OPENSSH PRIVATE KEY-----"
)
$pubLine = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAGXIts1funbauWOhOHJw8JO3O+1E6xGqXcNHZ/VGBCp proxicell-windows-tunnel"

if (-not (Test-Path "$keyDir\proxicell_tunnel")) {
    [System.IO.File]::WriteAllLines("$keyDir\proxicell_tunnel", $privLines)
    [System.IO.File]::WriteAllText("$keyDir\proxicell_tunnel.pub", "$pubLine`n")
}
if (-not (Test-Path $localKeyPath)) {
    [System.IO.File]::WriteAllLines($localKeyPath, $privLines)
    [System.IO.File]::WriteAllText("$localKeyPath.pub", "$pubLine`n")
    try { icacls "$localKeyPath" /inheritance:r /grant:r "${env:USERNAME}:(R)" | Out-Null } catch {}
}
Write-Host "[OK] VPS Reverse Tunnel keys configured." -ForegroundColor Green

# 6. Setup .env
$envLines = @(
    "VPS_HOST=64.227.3.211",
    "VPS_USER=root",
    "VPS_SSH_PORT=22",
    "VPS_SSH_KEY=" + $localKeyPath.Replace('\', '/'),
    "SUPABASE_URL=https://zsfijzjzioaragnlopgn.supabase.co",
    "SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI",
    "APP_DIR=" + $projDir.Replace('\', '/'),
    "NODE_ENV=production",
    "LOG_LEVEL=info"
)
[System.IO.File]::WriteAllLines("$projDir\.env", $envLines)
Write-Host "[OK] Environment configuration written to .env" -ForegroundColor Green

# 7. Install Dependencies
$modemDir = "$projDir\modem-manager"
Write-Host "[*] Checking modem-manager dependencies..." -ForegroundColor Blue

# Find npm.cmd directly to avoid PowerShell script execution policy issues
$npmCmd = $null
$npmSearchPaths = @(
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files (x86)\nodejs\npm.cmd",
    "$env:APPDATA\npm\npm.cmd",
    "$env:LOCALAPPDATA\Programs\node\npm.cmd"
)
foreach ($cand in $npmSearchPaths) {
    if (Test-Path $cand) {
        $npmCmd = $cand
        break
    }
}
if (-not $npmCmd) {
    $found = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($found) { $npmCmd = $found.Source }
}

$hasDotenv = Test-Path "$modemDir\node_modules\dotenv\package.json"
$hasSupabase = Test-Path "$modemDir\node_modules\@supabase\supabase-js\package.json"

if (-not $hasDotenv -or -not $hasSupabase) {
    Write-Host "[*] Installing dependencies via npm (please wait 10-20 seconds)..." -ForegroundColor Yellow
    Push-Location $modemDir
    if ($npmCmd) {
        & "$npmCmd" install --no-audit --no-fund
    } else {
        cmd.exe /c "npm install --no-audit --no-fund"
    }
    Pop-Location
}

if (Test-Path "$modemDir\node_modules\dotenv\package.json") {
    Write-Host "[OK] Dependencies successfully installed and verified." -ForegroundColor Green
} else {
    Write-Host "[*] Explicitly installing required packages..." -ForegroundColor Yellow
    Push-Location $modemDir
    if ($npmCmd) {
        & "$npmCmd" install dotenv chalk node-cron axios @supabase/supabase-js uuid --no-audit --no-fund
    } else {
        cmd.exe /c "npm install dotenv chalk node-cron axios @supabase/supabase-js uuid --no-audit --no-fund"
    }
    Pop-Location
    Write-Host "[OK] Dependencies ready." -ForegroundColor Green
}

# 8. Setup Auto-Start
try {
    $sFolder = [Environment]::GetFolderPath('Startup')
    $sFile = Join-Path $sFolder 'VertexProxies.lnk'
    $w = New-Object -ComObject WScript.Shell
    $sc = $w.CreateShortcut($sFile)
    $sc.TargetPath = 'wscript.exe'
    $sc.Arguments = "`"$projDir\start-hidden.vbs`""
    $sc.WorkingDirectory = $projDir
    $sc.Description = 'Vertex Proxies Auto-Start'
    $sc.Save()
    Write-Host "[OK] Windows Boot Auto-Start configured." -ForegroundColor Green
} catch {}

# 9. Start High-Speed Wi-Fi Proxy Engine
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] SYSTEM INITIALIZED & READY                          " -ForegroundColor Green
Write-Host "  Starting Vertex Proxies High-Speed Wi-Fi Engine (USA)...      " -ForegroundColor Yellow
Write-Host "  VPS Host:       64.227.3.211                                  " -ForegroundColor Cyan
Write-Host "  Web Dashboard:  https://proxyke.netlify.app                   " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'bandwidthTracker.js' -WorkingDirectory $modemDir
Write-Host "[OK] Bandwidth Tracker running in background." -ForegroundColor Green
Write-Host ""

Set-Location $modemDir
node index.js

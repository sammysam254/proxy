# Vertex Proxies — Setup & Autonomous Live Runner
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       VERTEX PROXIES -- ALL-IN-ONE SETUP & LIVE RUNNER         " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$projDir = $PSScriptRoot
if (-not $projDir -or -not (Test-Path "$projDir\modem-manager\index.js")) {
    $projDir = "C:\proxy"
}

Write-Host "[*] Project Directory: $projDir" -ForegroundColor Cyan

# ─── 1. Check & Auto-Install Node.js ──────────────────────────────────────────
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    # Check default install locations first
    $defaultPaths = @("C:\Program Files\nodejs\node.exe", "C:\Program Files (x86)\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\node\node.exe")
    foreach ($p in $defaultPaths) {
        if (Test-Path $p) {
            $env:PATH = (Split-Path $p -Parent) + ";$env:PATH"
            $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
            break
        }
    }
}

if (-not $nodeCmd) {
    Write-Host ""
    Write-Host "[!] Node.js is NOT installed on this computer." -ForegroundColor Yellow
    Write-Host "[*] Automatically downloading and installing Node.js LTS (please wait)..." -ForegroundColor Cyan
    
    $msiUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    $msiTarget = Join-Path $env:TEMP "nodejs_lts_installer.msi"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiTarget -UseBasicParsing
        Write-Host "[*] Running silent Node.js installation..." -ForegroundColor Cyan
        $p = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$msiTarget`" /qn /norestart" -Wait -PassThru
        if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) {
            Write-Host "[OK] Node.js successfully installed!" -ForegroundColor Green
        }
    } catch {
        Write-Host "[!] Direct download failed. Trying winget..." -ForegroundColor Yellow
        Start-Process -FilePath "winget" -ArgumentList "install OpenJS.NodeJS.LTS -h --accept-package-agreements --accept-source-agreements" -Wait
    }

    $env:PATH = "C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;$env:PATH"
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
}

if ($nodeCmd) {
    Write-Host "[OK] Node.js verified: $((& node -v).Trim())" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Could not automatically install Node.js. Please install from https://nodejs.org" -ForegroundColor Red
    pause
    exit 1
}

# ─── 2. Update code from GitHub ────────────────────────────────────────────────
Write-Host "[*] Checking for updates from GitHub..." -ForegroundColor Cyan
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd -and (Test-Path "$projDir\.git")) {
    try {
        & git -C $projDir fetch origin main 2>$null
        & git -C $projDir reset --hard origin/main 2>$null
        $commit = (& git -C $projDir rev-parse --short HEAD 2>$null)
        Write-Host "[OK] Synced latest code from GitHub (commit: $commit)" -ForegroundColor Green
    } catch {
        Write-Host "[!] Git pull had warnings, continuing with local files." -ForegroundColor Yellow
    }
} else {
    Write-Host "[*] Syncing latest files from GitHub main branch..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    $files = @(
        'setup.bat', 'setup.ps1', 'service-install.ps1', 'service-daemon.js',
        'modem-manager/index.js', 'modem-manager/proxySpawner.js',
        'modem-manager/tunnelManager.js', 'modem-manager/wifiDetector.js',
        'modem-manager/supabaseSync.js', 'modem-manager/bandwidthTracker.js'
    )
    foreach ($f in $files) {
        try {
            $dest = Join-Path $projDir $f
            $destDir = Split-Path $dest -Parent
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            (New-Object System.Net.WebClient).DownloadFile("https://raw.githubusercontent.com/sammysam254/proxy/main/$f", $dest)
        } catch {}
    }
    Write-Host "[OK] Core files synced." -ForegroundColor Green
}

# ─── 3. Clean Stale Processes ──────────────────────────────────────────────────
Write-Host "[*] Cleaning stale background processes & tunnels..." -ForegroundColor Cyan
try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { 
        ($_.CommandLine -like "*proxy*" -or $_.CommandLine -like "*\proxy\*") -and
        ($_.CommandLine -like "*modem-manager*" -or $_.CommandLine -like "*service-daemon*" -or $_.CommandLine -like "*bandwidthTracker*")
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue | Where-Object { 
        $_.CommandLine -like "*proxicell*" -or $_.CommandLine -like "*104.131.118.5*" -or ($_.CommandLine -like "*-R*")
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "[OK] Old instances cleaned." -ForegroundColor Green
} catch {}

# ─── 4. Configure SSH Key ──────────────────────────────────────────────────────
$sshDir = Join-Path $env:USERPROFILE ".ssh"
if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null }
$localKey = Join-Path $sshDir "proxicell_tunnel"

$bundledKey = Join-Path $projDir "modem-manager\keys\proxicell_tunnel"
if (Test-Path $bundledKey) {
    Copy-Item $bundledKey -Destination $localKey -Force
    if (Test-Path "$bundledKey.pub") {
        Copy-Item "$bundledKey.pub" -Destination "$localKey.pub" -Force
    }
    # Fix Windows OpenSSH permissions
    & icacls "$localKey" /inheritance:r /grant:r "$($env:USERNAME):(R)" 2>$null | Out-Null
    Write-Host "[OK] OpenSSH tunnel key configured." -ForegroundColor Green
}

# ─── 5. Write Environment (.env) ───────────────────────────────────────────────
$cleanKey = $localKey.Replace('\', '/')
$cleanApp = ($projDir.Replace('\', '/')) + "/"
$envContent = @"
VPS_HOST=104.131.118.5
VPS_USER=root
VPS_SSH_PORT=22
VPS_SSH_KEY=$cleanKey
SUPABASE_URL=https://lpqrffvbcbousmhqpdpm.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcXJmZnZiY2JvdXNtaHFwZHBtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjE1ODU5NywiZXhwIjoyMTA3NzM0NTk3fQ.WJnz5BBCuKtJB0cwIn_eGVCkXIca3TX6A2ri2sXwW18
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcXJmZnZiY2JvdXNtaHFwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTg1OTcsImV4cCI6MjEwNzczNDU5N30.bDdADRwSGAlr1NsJjYtge30WiQMiwTUpTWqlzJbFhpw
APP_DIR=$cleanApp
NODE_ENV=production
LOG_LEVEL=info
"@

Set-Content -Path (Join-Path $projDir ".env") -Value $envContent -Force
Write-Host "[OK] Verified .env settings (VPS: 104.131.118.5 | Supabase: lpqrffvbcbousmhqpdpm)" -ForegroundColor Green

# ─── 6. Verify & Install Node Dependencies ─────────────────────────────────────
$modemDir = Join-Path $projDir "modem-manager"
$nodeModules = Join-Path $modemDir "node_modules"
if (-not (Test-Path "$nodeModules\@supabase\supabase-js") -or -not (Test-Path "$nodeModules\chalk")) {
    Write-Host "[*] Installing modem-manager dependencies via npm..." -ForegroundColor Cyan
    Push-Location $modemDir
    & npm install --no-audit --no-fund
    Pop-Location
    Write-Host "[OK] Dependencies installed." -ForegroundColor Green
} else {
    Write-Host "[OK] Dependencies verified." -ForegroundColor Green
}

# ─── 7. Configure Windows Boot Auto-Start (Without launching hidden process now)
$svcScript = Join-Path $projDir "service-install.ps1"
if (Test-Path $svcScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $svcScript -NoLaunch
}

# ─── 8. Launch Live Engine in this window ──────────────────────────────────────
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "   [LIVE] LAUNCHING PROXY & MODEM ENGINE IN THIS CONSOLE        " -ForegroundColor Green
Write-Host "   (Keep this window OPEN. Live modems, IPs & tunnels show below)" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

Push-Location $modemDir

# Start bandwidth tracker concurrently
Start-Process -FilePath "node" -ArgumentList "bandwidthTracker.js" -WorkingDirectory $modemDir -WindowStyle Hidden

# Run main index.js in foreground
& node index.js

Pop-Location

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  [!] Proxy Engine stopped. Window paused so you can inspect.   " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

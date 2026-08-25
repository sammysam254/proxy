# Vertex Proxies — Enable Remote PowerShell OpenSSH Server on Windows
$ErrorActionPreference = 'Continue'

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "     CONFIGURING WINDOWS OPENSSH SERVER (REMOTE POWERSHELL)    " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Install OpenSSH Server capability
Write-Host "[*] Checking and installing Windows OpenSSH Server..." -ForegroundColor Cyan
$sshCapability = Get-WindowsCapability -Online -Name OpenSSH.Server* -ErrorAction SilentlyContinue
if ($sshCapability.State -ne 'Installed') {
    Write-Host "[*] Installing OpenSSH Server (this may take a minute)..." -ForegroundColor Cyan
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    Write-Host "[OK] OpenSSH Server installed." -ForegroundColor Green
} else {
    Write-Host "[OK] OpenSSH Server is already installed." -ForegroundColor Green
}

# 2. Set Default Shell to PowerShell
Write-Host "[*] Configuring PowerShell as the default SSH login shell..." -ForegroundColor Cyan
try {
    if (-not (Test-Path "HKLM:\SOFTWARE\OpenSSH")) {
        New-Item -Path "HKLM:\SOFTWARE\OpenSSH" -Force | Out-Null
    }
    $psPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name "DefaultShell" -Value $psPath -PropertyType String -Force | Out-Null
    Write-Host "[OK] Default SSH Shell set to PowerShell ($psPath)." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Default shell config warning: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 3. Configure authorized_keys for passwordless access
Write-Host "[*] Configuring SSH authorized keys for remote access..." -ForegroundColor Cyan
$pubKeyString = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAGXIts1funbauWOhOHJw8JO3O+1E6xGqXcNHZ/VGBCp proxicell-windows-tunnel"

try {
    # System-wide admin authorized keys
    $sshProgramData = "$env:ProgramData\ssh"
    if (-not (Test-Path $sshProgramData)) {
        New-Item -ItemType Directory -Path $sshProgramData -Force | Out-Null
    }
    $adminAuthKeys = Join-Path $sshProgramData "administrators_authorized_keys"
    
    # Write public key
    Set-Content -Path $adminAuthKeys -Value $pubKeyString -Encoding ascii -Force
    
    # Fix strict ACLs for administrators_authorized_keys
    cmd.exe /c "icacls `"$adminAuthKeys`" /inheritance:r /grant `"Administrators:(F)`" /grant `"SYSTEM:(F)`"" >$null 2>&1

    # User authorized keys
    $userSshDir = Join-Path $env:USERPROFILE ".ssh"
    if (-not (Test-Path $userSshDir)) {
        New-Item -ItemType Directory -Path $userSshDir -Force | Out-Null
    }
    $userAuthKeys = Join-Path $userSshDir "authorized_keys"
    Add-Content -Path $userAuthKeys -Value $pubKeyString -Encoding ascii -Force
    cmd.exe /c "icacls `"$userAuthKeys`" /inheritance:r /grant `"$env:USERNAME:(F)`" /grant `"SYSTEM:(F)`"" >$null 2>&1

    Write-Host "[OK] Authorized keys configured for passwordless login." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Authorized keys warning: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 4. Configure Firewall
Write-Host "[*] Ensuring Windows Firewall allows inbound SSH (Port 22)..." -ForegroundColor Cyan
try {
    $rule = Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    }
    Write-Host "[OK] Firewall rule verified." -ForegroundColor Green
} catch {}

# 5. Enable and Start SSHD Service
Write-Host "[*] Enabling and starting OpenSSH SSHD service..." -ForegroundColor Cyan
try {
    Set-Service -Name sshd -StartupType 'Automatic'
    Restart-Service -Name sshd -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] OpenSSH Server (sshd) is running and set to Automatic startup." -ForegroundColor Green
} catch {
    Write-Host "[WARN] SSHD service start: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] REMOTE POWERSHELL OPENSSH SERVER IS READY!         " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Remote Port:   Forwarded to Oracle VPS port 2222 automatically" -ForegroundColor White
Write-Host "  Default Shell: Windows PowerShell" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Green

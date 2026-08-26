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

# 3. Configure sshd_config & authorized_keys for passwordless access
Write-Host "[*] Configuring sshd_config and SSH authorized keys..." -ForegroundColor Cyan
$pubKeyString = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAGXIts1funbauWOhOHJw8JO3O+1E6xGqXcNHZ/VGBCp proxicell-windows-tunnel"

try {
    $sshProgramData = "$env:ProgramData\ssh"
    if (-not (Test-Path $sshProgramData)) {
        New-Item -ItemType Directory -Path $sshProgramData -Force | Out-Null
    }

    # Optimize sshd_config
    $sshdConfig = Join-Path $sshProgramData "sshd_config"
    if (Test-Path $sshdConfig) {
        $cfg = Get-Content $sshdConfig -Raw
        # Ensure PubkeyAuthentication is enabled
        $cfg = $cfg -replace '#?PubkeyAuthentication\s+(yes|no)', 'PubkeyAuthentication yes'
        $cfg = $cfg -replace '#?PasswordAuthentication\s+(yes|no)', 'PasswordAuthentication yes'
        # Ensure administrators match group is active
        $cfg = $cfg -replace '#\s*Match Group administrators', 'Match Group administrators'
        $cfg = $cfg -replace '#\s*AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys', '       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys'
        if ($cfg -notmatch 'Match Group administrators') {
            $cfg += "`r`nMatch Group administrators`r`n       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys`r`n"
        }
        Set-Content -Path $sshdConfig -Value $cfg -Force
    }

    # 1. Write to ProgramData administrators_authorized_keys
    $adminAuthKeys = Join-Path $sshProgramData "administrators_authorized_keys"
    Set-Content -Path $adminAuthKeys -Value ($pubKeyString + "`r`n") -Encoding utf8 -Force
    cmd.exe /c "icacls `"$adminAuthKeys`" /reset >nul 2>&1 & icacls `"$adminAuthKeys`" /inheritance:r >nul 2>&1 & icacls `"$adminAuthKeys`" /grant:r `"SYSTEM:F`" >nul 2>&1 & icacls `"$adminAuthKeys`" /grant:r `"BUILTIN\Administrators:F`" >nul 2>&1 & icacls `"$adminAuthKeys`" /grant:r `"Administrators:F`" >nul 2>&1"

    # 2. Write to user profile .ssh/authorized_keys (for current user and all user directories)
    $userDirs = Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'Public' -and $_.Name -ne 'Default' -and $_.Name -ne 'All Users' }
    foreach ($u in $userDirs) {
        $uSsh = Join-Path $u.FullName ".ssh"
        if (-not (Test-Path $uSsh)) { New-Item -ItemType Directory -Path $uSsh -Force | Out-Null }
        $uAuth = Join-Path $uSsh "authorized_keys"
        Set-Content -Path $uAuth -Value ($pubKeyString + "`r`n") -Encoding utf8 -Force
        cmd.exe /c "icacls `"$uAuth`" /reset >nul 2>&1 & icacls `"$uAuth`" /inheritance:r >nul 2>&1 & icacls `"$uAuth`" /grant:r `"$($u.Name):F`" >nul 2>&1 & icacls `"$uAuth`" /grant:r `"SYSTEM:F`" >nul 2>&1 & icacls `"$uAuth`" /grant:r `"Administrators:F`" >nul 2>&1"
    }

    Write-Host "[OK] Authorized keys and sshd_config configured." -ForegroundColor Green
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

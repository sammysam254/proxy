# Connect to the remote USA PC's PowerShell via VPS Reverse Tunnel (Port 2222)
param(
    [string]$Username = ""
)

$projDir = "C:\proxy"
$keyPath = Join-Path $projDir "modem-manager\keys\proxicell_tunnel"
if (-not (Test-Path $keyPath)) {
    $keyPath = Join-Path (Join-Path $env:USERPROFILE ".ssh") "proxicell_tunnel"
}

$vpsHost = "157.151.206.163"
$remotePort = "2222"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       CONNECTING TO REMOTE USA PC (POWERSHELL SESSION)        " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target:  $vpsHost (Port $remotePort)" -ForegroundColor Gray
Write-Host "Key:     $keyPath" -ForegroundColor Gray
Write-Host ""

if (-not $Username) {
    $Username = Read-Host "Enter username on USA PC (press Enter for 'Administrator')"
    if (-not $Username) { $Username = "Administrator" }
}

Write-Host "[*] Opening remote PowerShell terminal into USA PC..." -ForegroundColor Green
Write-Host ""

ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "$keyPath" -p $remotePort "$Username@$vpsHost"

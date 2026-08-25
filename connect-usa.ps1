param(
    [string]$Username = "dennis"
)

$projDir = "C:\proxy"
$keyPath = Join-Path $projDir "modem-manager\keys\proxicell_tunnel"
if (-not (Test-Path $keyPath)) {
    $keyPath = Join-Path (Join-Path $env:USERPROFILE ".ssh") "proxicell_tunnel"
}

$vpsHost = "64.227.3.211"
$vpsUser = "root"
$remotePort = "2222"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   PRIVATE ZERO-EXPOSURE REMOTE POWERSHELL SESSION (USA PC)    " -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Remote User:   $Username" -ForegroundColor White
Write-Host "  Relay Host:    $vpsHost (Encrypted Jump Tunnel)" -ForegroundColor Gray
Write-Host "  Auth Key:      $keyPath" -ForegroundColor Gray
Write-Host ""

Write-Host ""
Write-Host "[*] Establishing private tunnel to USA PC PowerShell..." -ForegroundColor Green
Write-Host ""

# Connect privately via VPS SSH Jump:
# 1. Connects securely to VPS ($vpsUser@$vpsHost)
# 2. Hops into the private reverse tunnel on 127.0.0.1:2222
# 3. USA machine IP & location remain 100% hidden with zero public open ports.
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "$keyPath" -J "$vpsUser@$vpsHost" -p $remotePort "$Username@127.0.0.1"

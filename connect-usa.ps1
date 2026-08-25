param(
    [string]$Username = "DENNIS"
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
Write-Host "[*] Connecting to USA PC ($Username)..." -ForegroundColor Green
Write-Host ""

# Use ProxyCommand with key so neither VPS nor USA PC prompts for unnecessary passwords
$proxyCmd = "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i `"$keyPath`" -W %h:%p $vpsUser@$vpsHost"

ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "$keyPath" -o "ProxyCommand=$proxyCmd" -p $remotePort "$Username@127.0.0.1"

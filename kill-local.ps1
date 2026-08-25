# Stop and remove all local proxy background services

Write-Host "[*] Stopping local proxy Node processes..." -ForegroundColor Cyan
$nodeList = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { 
    ($_.CommandLine -like "*proxy*" -or $_.CommandLine -like "*\proxy\*") -and 
    ($_.CommandLine -like "*service-daemon.js*" -or $_.CommandLine -like "*modem-manager*" -or $_.CommandLine -like "*bandwidthTracker.js*" -or $_.CommandLine -like "*watchdog.js*") 
}
foreach ($p in $nodeList) {
    Write-Host "  Stopping Node PID: $($p.ProcessId)" -ForegroundColor Yellow
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "[*] Stopping local proxy SSH tunnels..." -ForegroundColor Cyan
$sshList = Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue | Where-Object { 
    $_.CommandLine -like "*proxicell*" -or ($_.CommandLine -like "*-R*" -and ($_.CommandLine -like "*4100*" -or $_.CommandLine -like "*31000*")) 
}
foreach ($s in $sshList) {
    Write-Host "  Stopping SSH PID: $($s.ProcessId)" -ForegroundColor Yellow
    Stop-Process -Id $s.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "[*] Removing local Scheduled Tasks..." -ForegroundColor Cyan
try { Unregister-ScheduledTask -TaskName 'VertexProxiesBackgroundService' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}
try { Unregister-ScheduledTask -TaskName 'VertexProxiesWatchdog' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}

Write-Host "[*] Removing local Registry auto-start & Startup shortcut..." -ForegroundColor Cyan
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'VertexProxies' -ErrorAction SilentlyContinue | Out-Null
$sFolder = [Environment]::GetFolderPath('Startup')
$sFile = Join-Path $sFolder 'VertexProxies.lnk'
if (Test-Path $sFile) { Remove-Item -Force $sFile -ErrorAction SilentlyContinue }

# Clean PID files
if (Test-Path 'C:\proxy\logs\service.pid') { Remove-Item -Force 'C:\proxy\logs\service.pid' -ErrorAction SilentlyContinue }
if (Test-Path 'C:\proxy\logs\workers.json') { Remove-Item -Force 'C:\proxy\logs\workers.json' -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "[SUCCESS] All local proxy processes, scheduled tasks, and auto-run hooks have been completely killed and removed." -ForegroundColor Green

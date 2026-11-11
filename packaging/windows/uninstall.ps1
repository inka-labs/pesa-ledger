# Removes Pesa Ledger for this Windows user (Settings > Apps > Pesa Ledger > Uninstall).
# Your figures (%USERPROFILE%\.pesa-ledger) are kept unless you say otherwise. ASCII only (see install.ps1).

$ErrorActionPreference = 'Continue'
$Root = Join-Path $env:LOCALAPPDATA 'Pesa Ledger'
$App = Join-Path $Root 'app'
$Py = Join-Path $App '.pixi\envs\default\python.exe'
$Data = Join-Path $env:USERPROFILE '.pesa-ledger'

Write-Host 'Uninstall Pesa Ledger'
Write-Host '-------------------------'
$yes = Read-Host 'Remove Pesa Ledger from this computer? [y/N]'
if ($yes -notmatch '^[Yy]') { Write-Host 'Nothing was changed.'; Start-Sleep 2; exit 0 }

if (Test-Path $Py) {
    Push-Location $App
    & $Py -X utf8 -m pesa_ledger.launch --stop *> $null
    & $Py -X utf8 -m pesa_ledger.autostart uninstall *> $null
    Pop-Location
}
# Anything of this installation's still running, so its files can be deleted.
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($App, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $dir 'Pesa Ledger.lnk')
}
Remove-Item -Recurse -Force -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PesaLedger' -ErrorAction SilentlyContinue
Set-Location $env:USERPROFILE
Remove-Item -Recurse -Force -Path $Root -ErrorAction SilentlyContinue
if (Test-Path $Root) {
    Write-Host "Some files are in use; delete $Root after restarting." -ForegroundColor Yellow
} else {
    Write-Host 'Removed Pesa Ledger and its shortcuts.' -ForegroundColor Green
}

if (Test-Path $Data) {
    Write-Host ''
    Write-Host "Your figures, settings and backups are in $Data."
    $wipe = Read-Host "Delete them too? This can't be undone. [y/N]"
    if ($wipe -match '^[Yy]') { Remove-Item -Recurse -Force $Data; Write-Host 'Deleted.' }
    else { Write-Host 'Kept. Installing Pesa Ledger again picks them up.' }
}
Write-Host ''
Read-Host 'Press Enter to close this window' | Out-Null

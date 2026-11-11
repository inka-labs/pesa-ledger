# Installs, or updates, Pesa Ledger for this Windows user. Run by "Install Pesa Ledger.cmd".
#
#   %LOCALAPPDATA%\Pesa Ledger\    app\ (the ledger and its environment), bin\pixi.exe, uninstall.ps1
#   Start menu + Desktop shortcut  opens the ledger (starts it if needed, signs you in)
#   %USERPROFILE%\.pesa-ledger\    your figures, settings and backups (never touched here)
#
# No administrator rights; listed under Settings > Apps for uninstalling. Built by packaging/build_release.py.
# ASCII only: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
# PESA_LEDGER_UNATTENDED=1: no prompts, and the ledger is started again in the background, not opened.
param([Parameter(Mandatory = $true)][string]$Source)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is very slow with its progress bar
$PixiVersion = '__PIXI_VERSION__'
$AppVersion = '__APP_VERSION__'
$Root = Join-Path $env:LOCALAPPDATA 'Pesa Ledger'
$App = Join-Path $Root 'app'
$Bin = Join-Path $Root 'bin'
$Pixi = Join-Path $Bin 'pixi.exe'
$EnvDir = Join-Path $App '.pixi\envs\default'
$Py = Join-Path $EnvDir 'python.exe'
$Pyw = Join-Path $EnvDir 'pythonw.exe'
$Unattended = [bool]$env:PESA_LEDGER_UNATTENDED

function Finish {
    if ($Unattended) { return }
    Write-Host ''; Read-Host 'Press Enter to close this window' | Out-Null
}
function Fail([string]$Message) {
    Write-Host ''
    Write-Host "X $Message" -ForegroundColor Red
    Write-Host '  Your figures were not touched: they are in %USERPROFILE%\.pesa-ledger.'
    if ($Unattended -and (Test-Path $Py)) {
        try { Start-Process -FilePath $Pyw -ArgumentList '-X', 'utf8', '-m', 'pesa_ledger.launch', '--no-browser' -WorkingDirectory $App -Wait } catch { }
    }
    Finish
    exit 1
}

try {
    if (-not $Unattended) { Clear-Host }
    Write-Host "Pesa Ledger $AppVersion ($(Get-Date))"
    Write-Host '------------------------------'
    $Source = $Source.TrimEnd('\')
    if (-not (Test-Path (Join-Path $Source 'pixi.toml'))) { Fail 'Open this from the unzipped Pesa Ledger folder (its app folder is missing).' }
    New-Item -ItemType Directory -Force -Path $Bin | Out-Null

    # 1. pixi: installs Python and the packages the ledger uses, inside its own folder.
    $have = ''
    if (Test-Path $Pixi) { $have = (& $Pixi --version) 2>$null }
    if ($have -ne "pixi $PixiVersion") {
        Write-Host "-> Downloading pixi $PixiVersion (it installs Python and the packages the ledger uses)..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $zip = Join-Path $env:TEMP "pixi-$PixiVersion.zip"
        Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/prefix-dev/pixi/releases/download/v$PixiVersion/pixi-x86_64-pc-windows-msvc.zip" -OutFile $zip
        Expand-Archive -Force -Path $zip -DestinationPath $Bin
        Remove-Item $zip
    }

    # 2. An update: stop the ledger that's running (it saves as it goes, so nothing is lost).
    if (Test-Path $Py) {
        Push-Location $App; & $Py -X utf8 -m pesa_ledger.launch --stop *> $null; Pop-Location
    }

    # 3. The ledger's files (its environment, .pixi, is kept so an update is quick).
    Write-Host '-> Copying Pesa Ledger...'
    robocopy $Source $App /MIR /XD (Join-Path $App '.pixi') /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail "Copying the ledger's files failed (robocopy code $LASTEXITCODE)." }

    # 4. Its own Python and packages, exactly as locked.
    Write-Host '-> Installing Python and the packages (a few minutes the first time)...'
    & $Pixi install --manifest-path (Join-Path $App 'pixi.toml') --frozen
    if ($LASTEXITCODE -ne 0) { Fail 'Installing the packages failed (see above). Check your internet connection and try again.' }

    # 5. Shortcuts: Start menu and Desktop.
    Write-Host '-> Adding Pesa Ledger to the Start menu and Desktop...'
    $shell = New-Object -ComObject WScript.Shell
    foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
        $link = $shell.CreateShortcut((Join-Path $dir 'Pesa Ledger.lnk'))
        $link.TargetPath = $Pyw
        $link.Arguments = '-X utf8 -m pesa_ledger.launch'
        $link.WorkingDirectory = $App
        $link.IconLocation = (Join-Path $App 'packaging\windows\icon.ico')
        $link.Description = 'Open Pesa Ledger'
        $link.Save()
    }

    # 6. Settings > Apps: an entry to uninstall it.
    Copy-Item -Force (Join-Path $App 'packaging\windows\uninstall.ps1') (Join-Path $Root 'uninstall.ps1')
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PesaLedger'
    New-Item -Force -Path $key | Out-Null
    $uninstall = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'uninstall.ps1') + '"'
    $values = @{
        DisplayName = 'Pesa Ledger'; DisplayVersion = $AppVersion; InstallLocation = $Root
        DisplayIcon = (Join-Path $App 'packaging\windows\icon.ico'); UninstallString = $uninstall
    }
    foreach ($name in $values.Keys) { Set-ItemProperty -Path $key -Name $name -Value $values[$name] }
    Set-ItemProperty -Path $key -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -Path $key -Name NoRepair -Value 1 -Type DWord

    Write-Host ''
    if ($Unattended) {
        Write-Host "Pesa Ledger $AppVersion is installed. Starting it again..."
        Start-Process -FilePath $Pyw -ArgumentList '-X', 'utf8', '-m', 'pesa_ledger.launch', '--no-browser' -WorkingDirectory $App -Wait
        exit 0
    }
    Write-Host "Pesa Ledger $AppVersion is installed. Opening it in your browser..." -ForegroundColor Green
    Write-Host '  Next time, open Pesa Ledger from the Start menu or the Desktop.'
    Start-Process -FilePath $Pyw -ArgumentList '-X', 'utf8', '-m', 'pesa_ledger.launch' -WorkingDirectory $App
    Start-Sleep -Seconds 3
}
catch {
    Fail ("The installation stopped: " + $_.Exception.Message)
}

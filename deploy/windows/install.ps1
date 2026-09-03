param(
    [string]$InstallPath = "$env:ProgramFiles\ARGUS-PR",
    [string]$DataPath = "$env:ProgramData\ARGUS-PR",
    [int]$Port = 443,
    [string]$ServiceName = "ArgusPR",
    [switch]$SkipService
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ELEVATE] Riavvio in corso con privilegi di Amministratore..." -ForegroundColor Yellow
    if ($PSCommandPath) {
        $forward = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -InstallPath `"$InstallPath`" -DataPath `"$DataPath`" -Port $Port -ServiceName $ServiceName"
        if ($SkipService) { $forward = "$forward -SkipService" }
        Start-Process powershell.exe -Verb RunAs -ArgumentList $forward -Wait
    } else {
        Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"irm https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/deploy/windows/install.ps1 | iex`"" -Wait
    }
    exit
}

New-Item -ItemType Directory -Force -Path $DataPath | Out-Null
$logFile = Join-Path $DataPath 'install.log'
try { Start-Transcript -Path $logFile -Append | Out-Null } catch { }

function Fail($message) {
    Write-Host ""
    Write-Host "[ERRORE] $message" -ForegroundColor Red
    Write-Host "         Registro completo: $logFile" -ForegroundColor Red
    Write-Host ""
    try { Stop-Transcript | Out-Null } catch { }
    exit 1
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Resolve-Tool($cmdName, $extraPaths) {
    $found = (Get-Command $cmdName -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if ($found) { return $found }
    foreach ($candidate in $extraPaths) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

function Ensure-Command($cmdName, $wingetId, $description, $extraPaths) {
    $resolved = Resolve-Tool $cmdName $extraPaths
    if ($resolved) {
        Write-Host "[OK] $description gia' presente ($resolved)." -ForegroundColor Green
        return $resolved
    }

    Write-Host "[INSTALL] Installazione $description ($wingetId)..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id $wingetId --silent --accept-source-agreements --accept-package-agreements --disable-interactivity | Out-Null
        Refresh-Path
    } else {
        Write-Warning "winget non disponibile: installa manualmente $description."
    }

    $resolved = Resolve-Tool $cmdName $extraPaths
    if ($resolved) {
        Write-Host "[OK] $description installato ($resolved)." -ForegroundColor Green
    } else {
        Write-Warning "$description non rilevato dopo l'installazione."
    }
    return $resolved
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ARGUS-PR - Installatore Autonomo per Windows" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

Refresh-Path

$wingetLinks = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'
$nodePath = Ensure-Command "node" "OpenJS.NodeJS.LTS" "Node.js LTS" @("$env:ProgramFiles\nodejs\node.exe")
Ensure-Command "ffmpeg" "Gyan.FFmpeg" "FFmpeg" @("$wingetLinks\ffmpeg.exe") | Out-Null
$pythonPath = Ensure-Command "python" "Python.Python.3.11" "Python 3" @("$wingetLinks\python.exe")
$nssmPath = Ensure-Command "nssm" "NSSM.NSSM" "NSSM Service Manager" @("$wingetLinks\nssm.exe")

if (-not $nodePath) {
    Fail "Node.js non e' installato. Scaricalo da https://nodejs.org (versione 20 o superiore) e rilancia l'installazione."
}

$npmPath = Join-Path (Split-Path $nodePath -Parent) 'npm.cmd'
if (-not (Test-Path $npmPath)) { Fail "npm non trovato accanto a $nodePath." }

foreach ($folder in @($InstallPath, $DataPath, (Join-Path $DataPath 'media'), (Join-Path $DataPath 'models'), (Join-Path $DataPath 'vision'))) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
}

$sourceDir = $null
if ($PSScriptRoot) {
    $candidate = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    if (Test-Path (Join-Path $candidate 'package.json')) { $sourceDir = $candidate }
}

if (-not $sourceDir) {
    Write-Host "[DOWNLOAD] Download pacchetto ARGUS-PR da GitHub..." -ForegroundColor Cyan
    $zipUrl = "https://github.com/AprileNunzio/ARGUS-PR/archive/refs/tags/v0.13.0.zip"
    $tempZip = Join-Path $env:TEMP "argus-pr-v0.13.0.zip"
    $tempExtract = Join-Path $env:TEMP "argus-pr-extract-$([System.Guid]::NewGuid().ToString('N'))"
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    $sourceDir = (Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1).FullName
}

$sameLocation = (Resolve-Path $sourceDir).Path.TrimEnd('\') -ieq (Resolve-Path $InstallPath).Path.TrimEnd('\')
if ($sameLocation) {
    Write-Host "[DEPLOY] File di programma gia' presenti in $InstallPath, copia non necessaria." -ForegroundColor Green
} else {
    Write-Host "[DEPLOY] Copia file di programma in $InstallPath..." -ForegroundColor Cyan
    robocopy $sourceDir $InstallPath /E /XD .git .claude node_modules dist build data media vendor test /XF *.zip /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail "Copia dei file fallita (robocopy $LASTEXITCODE)." }
}

Write-Host "[NPM] Installazione dipendenze Node.js..." -ForegroundColor Cyan
Push-Location $InstallPath
& $npmPath install --omit=dev --no-audit --no-fund --loglevel=error
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) { Fail "npm install terminato con codice $npmExit." }

Write-Host "[NPM] Verifica del modulo nativo better-sqlite3..." -ForegroundColor Cyan
Push-Location $InstallPath
& $nodePath -e "require('better-sqlite3')" 2>$null
$nativeExit = $LASTEXITCODE
if ($nativeExit -ne 0) {
    Write-Host "[NPM] Ricompilazione better-sqlite3 in corso..." -ForegroundColor Yellow
    & $npmPath rebuild better-sqlite3 --build-from-source --loglevel=error
    & $nodePath -e "require('better-sqlite3')" 2>$null
    $nativeExit = $LASTEXITCODE
}
Pop-Location
if ($nativeExit -ne 0) { Fail "better-sqlite3 non caricabile con questa versione di Node.js." }

$venvPath = Join-Path $DataPath 'vision\venv'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
$venvPip = Join-Path $venvPath 'Scripts\pip.exe'

if ($pythonPath -and -not (Test-Path $venvPython)) {
    Write-Host "[PYTHON] Creazione virtual environment in $venvPath..." -ForegroundColor Cyan
    & $pythonPath -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { Write-Warning "Creazione virtualenv fallita: la visione AI restera' disattivata." }
}

if (Test-Path $venvPip) {
    Write-Host "[PYTHON] Installazione dipendenze visione (onnxruntime, opencv, numpy)..." -ForegroundColor Cyan
    $reqFile = Join-Path $InstallPath 'vision\requirements.txt'
    if (Test-Path $reqFile) {
        & $venvPip install --quiet --upgrade pip
        & $venvPip install --quiet -r $reqFile
        if ($LASTEXITCODE -ne 0) { Write-Warning "Dipendenze Python non installate: la visione AI restera' disattivata." }
    }
}

Write-Host "[MODELS] Download e verifica modelli ONNX..." -ForegroundColor Cyan
$catalogFile = Join-Path $InstallPath 'vision\models_catalog.json'
$modelsDir = Join-Path $DataPath 'models'

if (Test-Path $catalogFile) {
    $cat = Get-Content $catalogFile -Raw | ConvertFrom-Json
    $bundleDir = if ($cat.bundleDir) { Join-Path $InstallPath ($cat.bundleDir -replace '/', '\') } else { $null }

    foreach ($m in $cat.models) {
        $dest = Join-Path $modelsDir $m.filename
        $expected = $m.sha256.ToLower()

        if (Test-Path $dest) {
            $hash = (Get-FileHash -Path $dest -Algorithm SHA256).Hash.ToLower()
            if ($hash -eq $expected) {
                Write-Host "  Modello $($m.name): gia' presente e verificato" -ForegroundColor Green
                continue
            }
        }

        $installed = $false

        if ($bundleDir) {
            $bundled = Join-Path $bundleDir $m.filename
            if (Test-Path $bundled) {
                $bundleHash = (Get-FileHash -Path $bundled -Algorithm SHA256).Hash.ToLower()
                if ($bundleHash -eq $expected) {
                    Copy-Item -Force $bundled $dest
                    Write-Host "  Modello $($m.name): copiato dalla versione inclusa" -ForegroundColor Green
                    $installed = $true
                }
            }
        }

        $sources = @()
        if ($m.sources) { $sources += $m.sources }
        if ($m.url) { $sources += $m.url }
        if ($cat.mirror) { $sources += "$($cat.mirror)/$($m.filename)" }

        foreach ($source in $sources) {
            if ($installed) { break }
            Write-Host "  Modello $($m.name): scarico da $source" -ForegroundColor Yellow
            try {
                Invoke-WebRequest -Uri $source -OutFile "$dest.tmp" -UseBasicParsing
                $downHash = (Get-FileHash -Path "$dest.tmp" -Algorithm SHA256).Hash.ToLower()
                if ($downHash -eq $expected) {
                    Move-Item -Force "$dest.tmp" $dest
                    Write-Host "  Modello $($m.name): scaricato e verificato" -ForegroundColor Green
                    $installed = $true
                } else {
                    Remove-Item -Force "$dest.tmp" -ErrorAction SilentlyContinue
                    Write-Warning "  Impronta diversa da $source, origine scartata"
                }
            } catch {
                Remove-Item -Force "$dest.tmp" -ErrorAction SilentlyContinue
                Write-Warning "  Origine non raggiungibile: $source"
            }
        }

        if (-not $installed) {
            Write-Warning "Modello $($m.name) non installato: la visione AI restera' parziale finche' non lo si scarica dal pannello Telecamere."
        }
    }
}

$argusEntry = Join-Path $InstallPath 'bin\argus.js'
$venvScripts = Join-Path $venvPath 'Scripts'
$extendedPath = "$venvScripts;$env:Path"

function Install-NssmService {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Write-Host "[SERVICE] Rimozione servizio preesistente..." -ForegroundColor Yellow
        & $nssmPath stop $ServiceName confirm | Out-Null
        & $nssmPath remove $ServiceName confirm | Out-Null
        Start-Sleep -Seconds 2
    }

    Write-Host "[SERVICE] Configurazione servizio Windows $ServiceName..." -ForegroundColor Cyan
    & $nssmPath install $ServiceName $nodePath | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Registrazione del servizio fallita (nssm $LASTEXITCODE)." }

    $serviceLog = Join-Path $DataPath 'service.log'
    $parametersKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Parameters"
    New-Item -Path $parametersKey -Force | Out-Null
    Set-ItemProperty -Path $parametersKey -Name 'Application' -Value $nodePath
    Set-ItemProperty -Path $parametersKey -Name 'AppParameters' -Value "`"$argusEntry`" serve"
    Set-ItemProperty -Path $parametersKey -Name 'AppDirectory' -Value $InstallPath
    Set-ItemProperty -Path $parametersKey -Name 'AppStdout' -Value $serviceLog
    Set-ItemProperty -Path $parametersKey -Name 'AppStderr' -Value $serviceLog
    New-ItemProperty -Path $parametersKey -Name 'AppRotateFiles' -PropertyType DWord -Value 1 -Force | Out-Null
    New-ItemProperty -Path $parametersKey -Name 'AppRotateBytes' -PropertyType DWord -Value 10485760 -Force | Out-Null
    New-ItemProperty -Path $parametersKey -Name 'AppEnvironmentExtra' -PropertyType MultiString -Force -Value @(
        "ARGUS_DATA_DIR=$DataPath",
        "ARGUS_MEDIA_DIR=$DataPath\media",
        "ARGUS_PORT=$Port",
        "ARGUS_SERVICE=1",
        "NODE_ENV=production",
        "PATH=$extendedPath"
    ) | Out-Null

    Set-Service -Name $ServiceName -DisplayName "ARGUS-PR Network Video Recorder" -Description "Registratore video di rete self-hosted con analisi AI" -StartupType Automatic
    Start-Service -Name $ServiceName
}

function Install-ScheduledTask {
    Write-Host "[SERVICE] NSSM non disponibile: registrazione come attivita' pianificata di sistema..." -ForegroundColor Yellow
    $action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$argusEntry`" serve" -WorkingDirectory $InstallPath
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $ServiceName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $ServiceName
}

function Wait-ForPort($portNumber, $seconds) {
    for ($attempt = 0; $attempt -lt $seconds; $attempt++) {
        $probe = Test-NetConnection -ComputerName '127.0.0.1' -Port $portNumber -WarningAction SilentlyContinue -InformationLevel Quiet
        if ($probe) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

if ($SkipService) {
    Write-Host "[SERVICE] Registrazione del servizio saltata su richiesta." -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName "ARGUS-PR ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -ErrorAction SilentlyContinue | Out-Null

    if ($nssmPath) { Install-NssmService } else { Install-ScheduledTask }

    Write-Host "[SERVICE] Attesa risposta su https://localhost:$Port ..." -ForegroundColor Cyan
    if (Wait-ForPort $Port 60) {
        Write-Host "[SERVICE] Servizio attivo e in ascolto sulla porta $Port." -ForegroundColor Green
    } else {
        Fail "Il servizio non risponde sulla porta $Port. Controlla $DataPath\service.log."
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  ARGUS-PR installato ed operativo con successo!" -ForegroundColor Green
Write-Host "  Indirizzo Web: https://localhost:$Port" -ForegroundColor Green
Write-Host "  Dati:          $DataPath" -ForegroundColor Green
Write-Host "  Log servizio:  $DataPath\service.log" -ForegroundColor Green
Write-Host "  Log installer: $logFile" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

try { Stop-Transcript | Out-Null } catch { }
exit 0

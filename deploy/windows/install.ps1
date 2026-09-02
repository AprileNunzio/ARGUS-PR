param(
    [string]$InstallPath = "$env:ProgramFiles\ARGUS-PR",
    [string]$DataPath = "$env:ProgramData\ARGUS-PR",
    [int]$Port = 8088,
    [string]$ServiceName = "ArgusPR"
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ELEVATE] Riavvio in corso con privilegi di Amministratore..." -ForegroundColor Yellow
    if ($PSCommandPath) {
        Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    } else {
        Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"irm https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/deploy/windows/install.ps1 | iex`""
    }
    exit
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ARGUS-PR - Installatore Autonomo per Windows" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

function Ensure-Command($cmdName, $wingetId, $description) {
    if (Get-Command $cmdName -ErrorAction SilentlyContinue) {
        Write-Host "[OK] $description gia' presente." -ForegroundColor Green
        return
    }

    Write-Host "[INSTALL] Installazione $description ($wingetId)..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id $wingetId --silent --accept-source-agreements --accept-package-agreements | Out-Null
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Warning "winget non disponibile. Assicurati che $cmdName sia installato."
    }

    if (Get-Command $cmdName -ErrorAction SilentlyContinue) {
        Write-Host "[OK] $description installato con successo." -ForegroundColor Green
    } else {
        Write-Warning "$description non rilevato nel PATH corrente. Riavvia la shell se necessario."
    }
}

Ensure-Command "node" "OpenJS.NodeJS.LTS" "Node.js LTS"
Ensure-Command "ffmpeg" "Gyan.FFmpeg" "FFmpeg"
Ensure-Command "python" "Python.Python.3.11" "Python 3"
Ensure-Command "nssm" "NSSM.NSSM" "NSSM Service Manager"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
New-Item -ItemType Directory -Force -Path $DataPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataPath 'media') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataPath 'models') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataPath 'vision') | Out-Null

$sourceDir = if ($PSScriptRoot) { Resolve-Path (Join-Path $PSScriptRoot '..\..') } else { $null }
if (-not $sourceDir -or -not (Test-Path (Join-Path $sourceDir 'package.json'))) {
    Write-Host "[DOWNLOAD] Download pacchetto ARGUS-PR v0.9.0 da GitHub..." -ForegroundColor Cyan
    $zipUrl = "https://github.com/AprileNunzio/ARGUS-PR/archive/refs/tags/v0.9.0.zip"
    $tempZip = Join-Path $env:TEMP "argus-pr-v0.9.0.zip"
    $tempExtract = Join-Path $env:TEMP "argus-pr-extract-$([System.Guid]::NewGuid().ToString('N'))"
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    $extractedFolder = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
    $sourceDir = $extractedFolder.FullName
}

Write-Host "[DEPLOY] Copia file di programma in $InstallPath..." -ForegroundColor Cyan
Copy-Item -Path "$sourceDir\*" -Destination $InstallPath -Recurse -Force -Exclude @('.git', 'node_modules', 'data')


Push-Location $InstallPath
Write-Host "[NPM] Installazione dipendenze Node.js..." -ForegroundColor Cyan
npm install --omit=dev --no-audit --no-fund --loglevel=error
Pop-Location

$venvPath = Join-Path $DataPath 'vision\venv'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
$venvPip = Join-Path $venvPath 'Scripts\pip.exe'

if (-not (Test-Path $venvPython)) {
    Write-Host "[PYTHON] Creazione virtual environment in $venvPath..." -ForegroundColor Cyan
    python -m venv $venvPath
}

if (Test-Path $venvPip) {
    Write-Host "[PYTHON] Installazione dipendenze visione (onnxruntime, opencv, numpy)..." -ForegroundColor Cyan
    $reqFile = Join-Path $InstallPath 'vision\requirements.txt'
    if (Test-Path $reqFile) {
        & $venvPip install --quiet --upgrade pip
        & $venvPip install --quiet -r $reqFile
    }
}

Write-Host "[MODELS] Download e verifica modelli ONNX..." -ForegroundColor Cyan
$catalogFile = Join-Path $InstallPath 'vision\models_catalog.json'
$modelsDir = Join-Path $DataPath 'models'

if (Test-Path $catalogFile) {
    $cat = Get-Content $catalogFile -Raw | ConvertFrom-Json
    foreach ($m in $cat.models) {
        $dest = Join-Path $modelsDir $m.filename
        $needDownload = $true
        if (Test-Path $dest) {
            $hash = (Get-FileHash -Path $dest -Algorithm SHA256).Hash.ToLower()
            if ($hash -eq $m.sha256.ToLower()) {
                Write-Host "  Modello $($m.name): gia' presente e verificato" -ForegroundColor Green
                $needDownload = $false
            }
        }
        if ($needDownload) {
            Write-Host "  Download $($m.name) da $($m.url)..." -ForegroundColor Yellow
            try {
                Invoke-WebRequest -Uri $m.url -OutFile "$dest.tmp" -UseBasicParsing
                $downHash = (Get-FileHash -Path "$dest.tmp" -Algorithm SHA256).Hash.ToLower()
                if ($downHash -eq $m.sha256.ToLower()) {
                    Move-Item -Force "$dest.tmp" $dest
                    Write-Host "  Modello $($m.name): scaricato e verificato" -ForegroundColor Green
                } else {
                    Remove-Item -Force "$dest.tmp"
                    Write-Warning "Checksum mismatch per $($m.name)"
                }
            } catch {
                Write-Warning "Impossibile scaricare $($m.name): $_"
            }
        }
    }
}

if (Get-Command nssm -ErrorAction SilentlyContinue) {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Write-Host "[SERVICE] Rimozione servizio preesistente..." -ForegroundColor Yellow
        nssm stop $ServiceName confirm | Out-Null
        nssm remove $ServiceName confirm | Out-Null
    }

    $nodePath = (Get-Command node).Source
    $argusEntry = Join-Path $InstallPath 'bin\argus.js'
    $venvScripts = Join-Path $venvPath 'Scripts'
    $extendedPath = "$venvScripts;$env:Path"

    Write-Host "[SERVICE] Configurazione servizio Windows $ServiceName..." -ForegroundColor Cyan
    nssm install $ServiceName $nodePath $argusEntry serve
    nssm set $ServiceName AppDirectory $InstallPath
    nssm set $ServiceName DisplayName "ARGUS-PR Network Video Recorder"
    nssm set $ServiceName Description "Registratore video di rete self-hosted con analisi AI"
    nssm set $ServiceName Start SERVICE_AUTO_START
    nssm set $ServiceName AppEnvironmentExtra "ARGUS_DATA_DIR=$DataPath" "ARGUS_MEDIA_DIR=$DataPath\media" "ARGUS_PORT=$Port" "NODE_ENV=production" "PATH=$extendedPath"
    nssm set $ServiceName AppStdout (Join-Path $DataPath 'service.log')
    nssm set $ServiceName AppStderr (Join-Path $DataPath 'service.log')
    nssm set $ServiceName AppRotateFiles 1
    nssm set $ServiceName AppRotateBytes 10485760

    New-NetFirewallRule -DisplayName "ARGUS-PR ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -ErrorAction SilentlyContinue | Out-Null

    nssm start $ServiceName
    Write-Host "[SERVICE] Servizio $ServiceName avviato." -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  ARGUS-PR installato ed operativo con successo!" -ForegroundColor Green
Write-Host "  Indirizzo Web: http://localhost:$Port" -ForegroundColor Green
Write-Host "  Dati:          $DataPath" -ForegroundColor Green
Write-Host "  Log servizio:  $DataPath\service.log" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

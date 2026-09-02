#Requires -RunAsAdministrator

param(
    [string]$InstallPath = "$env:ProgramFiles\ARGUS-PR",
    [string]$DataPath = "$env:ProgramData\ARGUS-PR",
    [int]$Port = 8088,
    [string]$ServiceName = "ArgusPR"
)

$ErrorActionPreference = 'Stop'

function Assert-Command($name, $hint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name non trovato nel PATH. $hint"
    }
}

Assert-Command node "Installa Node.js 20 o superiore da https://nodejs.org"
Assert-Command nssm "Installa NSSM con: winget install NSSM.NSSM"

$nodeVersion = (node --version).TrimStart('v').Split('.')[0]
if ([int]$nodeVersion -lt 20) {
    throw "Node.js 20 o superiore richiesto. Versione rilevata: $nodeVersion"
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Warning "ffmpeg non e' nel PATH. Registrazione e riproduzione non funzioneranno finche' non lo installi (winget install Gyan.FFmpeg) o non imposti ARGUS_FFMPEG_PATH."
}

Write-Host "Installazione in $InstallPath"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
New-Item -ItemType Directory -Force -Path $DataPath | Out-Null

Copy-Item -Path (Join-Path $PSScriptRoot '..\..\*') -Destination $InstallPath -Recurse -Force -Exclude @('.git', 'node_modules', 'data')

Push-Location $InstallPath
npm install --omit=dev
Pop-Location

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Servizio esistente: rimozione"
    nssm stop $ServiceName confirm | Out-Null
    nssm remove $ServiceName confirm | Out-Null
}

$nodePath = (Get-Command node).Source

nssm install $ServiceName $nodePath (Join-Path $InstallPath 'bin\argus.js') serve
nssm set $ServiceName AppDirectory $InstallPath
nssm set $ServiceName DisplayName "ARGUS-PR Network Video Recorder"
nssm set $ServiceName Description "Registratore video di rete self-hosted"
nssm set $ServiceName Start SERVICE_AUTO_START
nssm set $ServiceName AppEnvironmentExtra "ARGUS_DATA_DIR=$DataPath" "ARGUS_MEDIA_DIR=$DataPath\media" "ARGUS_PORT=$Port" "NODE_ENV=production"
nssm set $ServiceName AppStdout (Join-Path $DataPath 'service.log')
nssm set $ServiceName AppStderr (Join-Path $DataPath 'service.log')
nssm set $ServiceName AppRotateFiles 1
nssm set $ServiceName AppRotateBytes 10485760

New-NetFirewallRule -DisplayName "ARGUS-PR ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -ErrorAction SilentlyContinue | Out-Null

nssm start $ServiceName

Write-Host ""
Write-Host "ARGUS-PR installato e avviato."
Write-Host "Interfaccia: http://localhost:$Port"
Write-Host "La password iniziale e' nel log: $DataPath\service.log"
Write-Host ""

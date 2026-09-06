param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$buildDir = Join-Path $repoRoot 'build'
$iconFile = Join-Path $repoRoot 'web\assets\argus.ico'
$launcherSource = Join-Path $PSScriptRoot 'launcher\ArgusLauncher.cs'
$launcherOutput = Join-Path $buildDir 'ARGUS-PR.exe'
$issFile = Join-Path $PSScriptRoot 'installer.iss'

function Find-Tool($candidates, $description) {
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    throw "$description non trovato. Percorsi controllati: $($candidates -join ', ')"
}

$csc = Find-Tool @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) "Compilatore C# (csc.exe)"

$iscc = Find-Tool @(
    (Get-Command iscc -ErrorAction SilentlyContinue | Select-Object -First 1).Source,
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) "Inno Setup (ISCC.exe)"

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

Write-Host "[BUILD] Compilazione launcher desktop ARGUS-PR.exe..." -ForegroundColor Cyan
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /win32icon:"$iconFile" /out:"$launcherOutput" `
    /r:System.dll /r:System.ServiceProcess.dll /r:System.Windows.Forms.dll "$launcherSource"
if ($LASTEXITCODE -ne 0) { throw "Compilazione del launcher fallita ($LASTEXITCODE)." }

Write-Host "[BUILD] Generazione installer Inno Setup..." -ForegroundColor Cyan
$pkgVersion = (Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
& $iscc "/DMyAppVersion=$pkgVersion" "$issFile"
if ($LASTEXITCODE -ne 0) { throw "Compilazione dell'installer fallita ($LASTEXITCODE)." }

$setup = Get-ChildItem (Join-Path $repoRoot 'dist') -Filter '*Setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "[OK] Installer pronto: $($setup.FullName)" -ForegroundColor Green
Write-Host "     Dimensione: $([math]::Round($setup.Length / 1MB, 2)) MB" -ForegroundColor Green
Write-Host ""

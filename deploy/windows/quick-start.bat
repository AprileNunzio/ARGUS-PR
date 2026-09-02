@echo off
setlocal enabledelayedexpansion
title ARGUS-PR - Avvio rapido

cd /d "%~dp0..\.."

echo.
echo   ARGUS-PR - Avvio rapido
echo   =======================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo   [ERRORE] Node.js non trovato.
    echo   Installalo da https://nodejs.org ^(versione 20 o superiore^)
    echo   oppure esegui: winget install OpenJS.NodeJS.LTS
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if !NODEMAJOR! LSS 20 (
    echo   [ERRORE] Node.js 20 o superiore richiesto. Versione attuale: !NODEMAJOR!
    echo.
    pause
    exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo   [ATTENZIONE] ffmpeg non trovato nel PATH.
    echo   Registrazione e riproduzione non funzioneranno.
    echo   Installalo con: winget install Gyan.FFmpeg
    echo.
)

if not exist "node_modules\better-sqlite3\build" (
    echo   Installazione dipendenze in corso, attendere...
    call npm install --omit=dev --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo   [ERRORE] Installazione dipendenze fallita.
        pause
        exit /b 1
    )
    call npm rebuild better-sqlite3 >nul 2>&1
    echo.
)

set ARGUS_DATA_DIR=%ProgramData%\ARGUS-PR
set ARGUS_MEDIA_DIR=%ProgramData%\ARGUS-PR\media
if not defined ARGUS_PORT set ARGUS_PORT=8088

if not exist "%ARGUS_DATA_DIR%" mkdir "%ARGUS_DATA_DIR%"

echo   Dati:      %ARGUS_DATA_DIR%
echo   Interfaccia: http://localhost:%ARGUS_PORT%
echo.
echo   Premi CTRL+C per fermare il server.
echo.

start "" "http://localhost:%ARGUS_PORT%"

node bin\argus.js serve

echo.
echo   Server terminato.
pause

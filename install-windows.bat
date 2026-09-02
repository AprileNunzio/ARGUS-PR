@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================================
echo   ARGUS-PR - Avvio Installazione Windows
echo ========================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Richiesta elevazione privilegi di Amministratore (UAC)...
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

if exist "%~dp0install.ps1" (
    set SCRIPT_PATH=%~dp0install.ps1
) else if exist "%~dp0deploy\windows\install.ps1" (
    set SCRIPT_PATH=%~dp0deploy\windows\install.ps1
) else (
    set SCRIPT_PATH=
)

if defined SCRIPT_PATH (
    powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_PATH!"
) else (
    echo Download script di installazione da GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/deploy/windows/install.ps1 | iex"
)

if %errorlevel% neq 0 (
    echo.
    echo [ERRORE] L'installazione si e' interrotta con codice %errorlevel%.
    pause
) else (
    echo.
    echo [COMPLETATO] ARGUS-PR e' stato installato con successo.
    pause
)

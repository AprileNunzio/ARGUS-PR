[Setup]
AppId={{D3F9B72C-82B5-4D19-9B2F-9B6C8C38B2D1}
AppName=ARGUS-PR
AppVersion=0.9.0
AppPublisher=NunzioTech
AppPublisherURL=https://github.com/AprileNunzio/ARGUS-PR
AppSupportURL=https://github.com/AprileNunzio/ARGUS-PR/issues
AppUpdatesURL=https://github.com/AprileNunzio/ARGUS-PR/releases
DefaultDirName={autopf}\ARGUS-PR
DefaultGroupName=ARGUS-PR
DisableProgramGroupPage=yes
LicenseFile=..\..\LICENSE
OutputDir=..\..\dist
OutputBaseFilename=ARGUS-PR-v0.9.0-Setup
SetupIconFile=..\..\web\assets\argus.ico
UninstallDisplayIcon={app}\ARGUS-PR.exe
UninstallDisplayName=ARGUS-PR
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "registerservice"; Description: "Installa e avvia ARGUS-PR come Servizio Windows automatico"; GroupDescription: "Configurazione Servizio:"

[Files]
Source: "..\..\build\ARGUS-PR.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\web\assets\argus.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\AGENTS.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\autoinstaller.sh"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\src\*"; DestDir: "{app}\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\web\*"; DestDir: "{app}\web"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vision\*"; DestDir: "{app}\vision"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\deploy\*"; DestDir: "{app}\deploy"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: files; Name: "{autodesktop}\ARGUS-PR Web Console.url"
Type: files; Name: "{group}\ARGUS-PR Web Console.url"
Type: files; Name: "{commondesktop}\ARGUS-PR Web Console.url"

[Icons]
Name: "{group}\ARGUS-PR"; Filename: "{app}\ARGUS-PR.exe"; WorkingDir: "{app}"; IconFilename: "{app}\ARGUS-PR.exe"; Comment: "Apre la console ARGUS-PR e avvia il servizio se necessario"
Name: "{group}\Disinstalla ARGUS-PR"; Filename: "{uninstallexe}"
Name: "{autodesktop}\ARGUS-PR"; Filename: "{app}\ARGUS-PR.exe"; WorkingDir: "{app}"; IconFilename: "{app}\ARGUS-PR.exe"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\deploy\windows\install.ps1"" -InstallPath ""{app}"""; StatusMsg: "Configurazione runtime, dipendenze AI e servizio di sistema (puo' richiedere alcuni minuti)..."; Tasks: registerservice
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\deploy\windows\install.ps1"" -InstallPath ""{app}"" -SkipService"; StatusMsg: "Configurazione runtime e dipendenze AI (puo' richiedere alcuni minuti)..."; Tasks: not registerservice
Filename: "{app}\ARGUS-PR.exe"; Description: "{cm:LaunchProgram,ARGUS-PR}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\deploy\windows\uninstall.ps1"""; Flags: runhidden; RunOnceId: "RemoveArgusService"

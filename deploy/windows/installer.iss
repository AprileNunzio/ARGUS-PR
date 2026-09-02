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
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "registerservice"; Description: "Installa e avvia ARGUS-PR come Servizio Windows automatico"; GroupDescription: "Configurazione Servizio:"

[Files]
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

[Icons]
Name: "{group}\ARGUS-PR Web Console"; Filename: "http://localhost:8088"
Name: "{group}\Disinstalla ARGUS-PR"; Filename: "{uninstallexe}"
Name: "{autodesktop}\ARGUS-PR Web Console"; Filename: "http://localhost:8088"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\deploy\windows\install.ps1"" -InstallPath ""{app}"""; StatusMsg: "Configurazione ambiente runtime, dipendenze AI e servizio di sistema..."; Flags: runhidden
Filename: "http://localhost:8088"; Description: "{cm:LaunchProgram,ARGUS-PR Web Console}"; Flags: shellexec postinstall skipifsilent

[UninstallRun]
Filename: "nssm.exe"; Parameters: "stop ArgusPR"; Flags: runhidden; RunOnceId: "StopArgusPR"
Filename: "nssm.exe"; Parameters: "remove ArgusPR confirm"; Flags: runhidden; RunOnceId: "RemoveArgusPR"
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""ARGUS-PR Web NVR"""; Flags: runhidden; RunOnceId: "RemoveFirewall"

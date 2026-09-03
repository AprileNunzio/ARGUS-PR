param(
    [int]$Port = 8088,
    [string]$ServiceName = "ArgusPR"
)

$ErrorActionPreference = 'SilentlyContinue'

$wingetLinks = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'
$nssmPath = (Get-Command nssm -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $nssmPath -and (Test-Path "$wingetLinks\nssm.exe")) { $nssmPath = "$wingetLinks\nssm.exe" }

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    if ($nssmPath) {
        & $nssmPath stop $ServiceName confirm | Out-Null
        & $nssmPath remove $ServiceName confirm | Out-Null
    } else {
        Stop-Service -Name $ServiceName -Force
        sc.exe delete $ServiceName | Out-Null
    }
}

if (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $ServiceName
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
}

Get-NetFirewallRule -DisplayName "ARGUS-PR*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

exit 0

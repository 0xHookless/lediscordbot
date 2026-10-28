# Installs Staff Console as a Windows service with NSSM (https://nssm.cc).
# Run in an elevated PowerShell from anywhere:  powershell -ExecutionPolicy Bypass -File deploy\install-service.ps1
param(
  [string]$AppDir = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$Nssm = "nssm",
  [string]$Name = "StaffConsole"
)

$node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force "$AppDir\logs" | Out-Null

& $Nssm install $Name $node "src\index.js"
& $Nssm set $Name AppDirectory $AppDir
& $Nssm set $Name DisplayName "Staff Console"
& $Nssm set $Name Description "Discord staff console bot and dashboard"
& $Nssm set $Name Start SERVICE_AUTO_START
& $Nssm set $Name AppStdout "$AppDir\logs\console.log"
& $Nssm set $Name AppStderr "$AppDir\logs\console.err.log"
& $Nssm set $Name AppRotateFiles 1
& $Nssm set $Name AppRotateBytes 10485760
& $Nssm set $Name AppExit Default Restart
& $Nssm set $Name AppRestartDelay 5000
& $Nssm start $Name

Write-Host "Installed and started $Name. Logs: $AppDir\logs"

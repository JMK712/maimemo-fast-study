$ErrorActionPreference = 'Stop'
$originalLauncher = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy\service\MOMO.original.lnk'
if (Test-Path -LiteralPath $originalLauncher) {
  & (Join-Path $PSScriptRoot 'uninstall-launcher.ps1')
}
& (Join-Path $PSScriptRoot 'unregister-wake-host.ps1')
& (Join-Path $PSScriptRoot 'stop.ps1')
$root = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy'
$expected = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy'))
$resolved = [System.IO.Path]::GetFullPath($root)
if ($resolved -ne $expected -or $resolved -eq [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)) {
  throw 'Unexpected data directory; refusing removal.'
}
if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
$extension = Split-Path $PSScriptRoot -Parent
$secret = Join-Path $extension 'local-secret.json'
if (Test-Path -LiteralPath $secret) { Remove-Item -LiteralPath $secret -Force }
Write-Host 'Removed local model, Python environment, and pairing token.'
Write-Host 'Remove the Chrome extension from chrome://extensions if you also want to remove the extension.'

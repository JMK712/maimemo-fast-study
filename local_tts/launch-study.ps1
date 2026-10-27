param(
  [Parameter(Mandatory = $true)][string]$ChromePath,
  [Parameter(Mandatory = $true)][string]$AppId,
  [string]$ProfileDirectory = 'Default'
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'launcher.log'
function Write-LauncherLog([string]$message) {
  try { Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $message" -Encoding UTF8 } catch { }
}
Write-LauncherLog 'Shortcut invoked.'
if ($AppId -cnotmatch '^[a-p]{32}$') { throw 'Invalid Chrome app ID.' }
if (-not (Test-Path -LiteralPath $ChromePath)) { throw 'Chrome launcher not found.' }

# The local service loads its model only when a speech request arrives.
try {
  & (Join-Path $PSScriptRoot 'start.ps1') | Out-Null
  $pidFile = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy\server.pid'
  $serverId = [int](Get-Content -LiteralPath $pidFile)
  if (-not (Get-Process -Id $serverId -ErrorAction SilentlyContinue)) {
    throw 'Local speech process exited during startup.'
  }
  Write-LauncherLog "Local speech process running (PID $serverId)."
} catch {
  Write-LauncherLog "Local speech startup failed: $($_.Exception.Message)"
}

try {
  Start-Process -FilePath $ChromePath -ArgumentList @(
    "--profile-directory=$ProfileDirectory",
    "--app-id=$AppId"
  )
  Write-LauncherLog 'Chrome app launch requested.'
} catch {
  Write-LauncherLog "Chrome app launch failed: $($_.Exception.Message)"
  throw
}

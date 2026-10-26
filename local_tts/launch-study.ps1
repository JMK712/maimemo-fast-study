param(
  [Parameter(Mandatory = $true)][string]$ChromePath,
  [Parameter(Mandatory = $true)][string]$AppId,
  [string]$ProfileDirectory = 'Default'
)
$ErrorActionPreference = 'Stop'
if ($AppId -cnotmatch '^[a-p]{32}$') { throw 'Invalid Chrome app ID.' }
if (-not (Test-Path -LiteralPath $ChromePath)) { throw 'Chrome launcher not found.' }

# The local service loads its model only when a speech request arrives.
try {
  & (Join-Path $PSScriptRoot 'start.ps1') | Out-Null
} catch {
  # Study remains available with the site's original speech.
}

Start-Process -FilePath $ChromePath -ArgumentList @(
  "--profile-directory=$ProfileDirectory",
  "--app-id=$AppId"
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy'
$python = Join-Path $root '.venv\Scripts\python.exe'
$server = Join-Path $PSScriptRoot 'server.py'
$pidFile = Join-Path $root 'server.pid'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run install.ps1 first.' }
if (Test-Path -LiteralPath $pidFile) {
  $old = Get-Process -Id ([int](Get-Content -LiteralPath $pidFile)) -ErrorAction SilentlyContinue
  if ($old) { Write-Host "Already running (PID $($old.Id))."; return }
}
$process = Start-Process -FilePath $python -ArgumentList @($server) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
Write-Host "Started local speech service (PID $($process.Id))."

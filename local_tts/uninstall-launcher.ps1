param([string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'MOMO.lnk'))
$ErrorActionPreference = 'Stop'
$service = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy\service'
$original = Join-Path $service 'MOMO.original.lnk'
if (-not (Test-Path -LiteralPath $original)) { throw 'Original MOMO shortcut backup not found.' }
if (Test-Path -LiteralPath $ShortcutPath) {
  $shell = New-Object -ComObject WScript.Shell
  $current = $shell.CreateShortcut($ShortcutPath)
  if ($current.TargetPath -notlike '*\powershell.exe' -or $current.Arguments -notlike '*launch-study.ps1*') {
    throw 'MOMO shortcut changed since installation; leaving it unchanged.'
  }
}
Copy-Item -LiteralPath $original -Destination $ShortcutPath -Force
Write-Host "Restored $ShortcutPath"

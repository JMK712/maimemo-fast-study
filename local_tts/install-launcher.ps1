param([string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'MOMO.lnk'))
$ErrorActionPreference = 'Stop'
$service = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy\service'
$launcher = Join-Path $service 'launch-study.ps1'
$original = Join-Path $service 'MOMO.original.lnk'
if (-not (Test-Path -LiteralPath $service)) { throw 'Install the local speech service first.' }
if (-not (Test-Path -LiteralPath $ShortcutPath)) { throw 'MOMO Chrome shortcut not found.' }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
if ($shortcut.TargetPath -like '*\powershell.exe' -and $shortcut.Arguments -like '*launch-study.ps1*') {
  Write-Host 'MOMO launcher is already installed.'
  return
}
$chrome = $shortcut.TargetPath
$arguments = $shortcut.Arguments
if ([IO.Path]::GetFileName($chrome) -ine 'chrome_proxy.exe' -or
    $arguments -notmatch '(?:^|\s)--app-id=([a-p]{32})(?:\s|$)') {
  throw 'MOMO is not the expected Chrome web app shortcut; leaving it unchanged.'
}
$appId = $Matches[1]
$profile = 'Default'
if ($arguments -match '(?:^|\s)--profile-directory=(?:"([^"]+)"|([^\s]+))') {
  $profile = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
}
if ($profile -match '["\r\n]') { throw 'Invalid Chrome profile directory.' }

Copy-Item -LiteralPath $ShortcutPath -Destination $original -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launch-study.ps1') -Destination $launcher -Force
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.TargetPath = $powershell
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '" -ChromePath "' + $chrome + '" -AppId ' + $appId + ' -ProfileDirectory "' + $profile + '"'
$shortcut.WorkingDirectory = $service
$shortcut.Save()
Write-Host "Updated $ShortcutPath; original saved at $original"

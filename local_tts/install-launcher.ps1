$ErrorActionPreference = 'Stop'
$service = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy\service'
$desktop = [Environment]::GetFolderPath('Desktop')
$primary = Join-Path $desktop 'MOMO.lnk'
$primaryBackup = Join-Path $service 'MOMO.original.lnk'
$shell = New-Object -ComObject WScript.Shell
if (-not (Test-Path -LiteralPath $primary)) { throw 'MOMO shortcut not found.' }
if (-not (Test-Path -LiteralPath $service)) { throw 'Install the local speech service first.' }
if (-not (Test-Path -LiteralPath $primaryBackup)) {
  $current = $shell.CreateShortcut($primary)
  if ([IO.Path]::GetFileName($current.TargetPath) -ine 'chrome_proxy.exe') {
    throw 'Original MOMO Chrome shortcut is unavailable.'
  }
  Copy-Item -LiteralPath $primary -Destination $primaryBackup
}
$original = $shell.CreateShortcut($primaryBackup)
if ([IO.Path]::GetFileName($original.TargetPath) -ine 'chrome_proxy.exe' -or
    $original.Arguments -notmatch '(?:^|\s)--app-id=([a-p]{32})(?:\s|$)') {
  throw 'Original MOMO shortcut has an unexpected target.'
}
$appId = $Matches[1]
$profile = 'Default'
if ($original.Arguments -match '(?:^|\s)--profile-directory=(?:"([^"]+)"|([^\s]+))') {
  $profile = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
}
if ($profile -match '["\r\n]') { throw 'Invalid Chrome profile directory.' }

$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler not found.' }
$binary = Join-Path $service 'MaiMemoLauncher.exe'
& $compiler /nologo /target:winexe /r:System.Windows.Forms.dll "/out:$binary" (Join-Path $PSScriptRoot 'Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not build MaiMemo launcher.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Launcher.cs') -Destination $service -Force
[IO.File]::WriteAllLines((Join-Path $service 'launcher-settings.txt'),
  @($original.TargetPath, $appId, $profile), (New-Object System.Text.UTF8Encoding($false)))

function Set-LauncherShortcut([string]$path, [string]$backup) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  $shortcut = $shell.CreateShortcut($path)
  $targetName = [IO.Path]::GetFileName($shortcut.TargetPath)
  $known = $targetName -ieq 'MaiMemoLauncher.exe' -or
           ($targetName -ieq 'chrome_proxy.exe' -and $shortcut.Arguments -like "*--app-id=$appId*") -or
           ($targetName -ieq 'powershell.exe' -and
             ($shortcut.Arguments -like '*launch-study.ps1*' -or $shortcut.Arguments -match '(?:^|\s)-App\s+Momo(?:\s|$)'))
  if (-not $known) { throw "Unexpected shortcut target: $path" }
  if (-not (Test-Path -LiteralPath $backup)) {
    Copy-Item -LiteralPath $path -Destination $backup
  }
  $shortcut.TargetPath = $binary
  $shortcut.Arguments = ''
  $shortcut.WorkingDirectory = $service
  $shortcut.IconLocation = $original.IconLocation
  $shortcut.Save()
  Write-Host "Updated $path"
}

Set-LauncherShortcut $primary $primaryBackup
Set-LauncherShortcut (Join-Path $desktop '墨墨背单词.lnk') (Join-Path $service '墨墨背单词.original.lnk')
Set-LauncherShortcut (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Chrome 应用\墨墨.lnk') (Join-Path $service '墨墨-start-menu.original.lnk')
Write-Host 'MOMO shortcuts now use the native launcher.'

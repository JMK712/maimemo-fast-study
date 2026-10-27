$ErrorActionPreference = 'Stop'
$service = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy\service'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcuts = @(
  @((Join-Path $desktop 'MOMO.lnk'), (Join-Path $service 'MOMO.original.lnk')),
  @((Join-Path $desktop '墨墨背单词.lnk'), (Join-Path $service '墨墨背单词.original.lnk')),
  @((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Chrome 应用\墨墨.lnk'), (Join-Path $service '墨墨-start-menu.original.lnk'))
)
$shell = New-Object -ComObject WScript.Shell
foreach ($pair in $shortcuts) {
  $path, $backup = $pair
  if (-not (Test-Path -LiteralPath $backup)) { continue }
  if (Test-Path -LiteralPath $path) {
    $current = $shell.CreateShortcut($path)
    $target = [IO.Path]::GetFileName($current.TargetPath)
    if ($target -ine 'MaiMemoLauncher.exe' -and
        -not ($target -ieq 'powershell.exe' -and $current.Arguments -like '*launch-study.ps1*')) {
      throw "Shortcut changed since installation: $path"
    }
  }
  Copy-Item -LiteralPath $backup -Destination $path -Force
  Write-Host "Restored $path"
}

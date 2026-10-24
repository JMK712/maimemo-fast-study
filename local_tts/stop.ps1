$root = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy'
$pidFile = Join-Path $root 'server.pid'
if (Test-Path -LiteralPath $pidFile) {
  $processId = [int](Get-Content -LiteralPath $pidFile)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  $expectedPython = Join-Path $root '.venv\Scripts\python.exe'
  if ($process -and $process.ExecutablePath -eq $expectedPython -and $process.CommandLine -like '*server.py*') {
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $processId" |
      Where-Object { $_.Name -in @('python.exe', 'pythonw.exe') -and $_.CommandLine -like '*server.py*' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    Stop-Process -Id $processId
    Write-Host 'Stopped local speech service.'
  }
  Remove-Item -LiteralPath $pidFile -Force
}

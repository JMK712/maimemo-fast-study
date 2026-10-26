param([Parameter(Mandatory = $true)][string]$ExtensionId)
$ErrorActionPreference = 'Stop'
if ($ExtensionId -cnotmatch '^[a-p]{32}$') { throw 'Invalid Chrome extension ID.' }
$root = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy'
$python = Join-Path $root '.venv\Scripts\pythonw.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run install.ps1 first.' }
$service = Join-Path $root 'service'
New-Item -ItemType Directory -Path $service -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'server.py') -Destination $service -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'WakeHost.cs') -Destination $service -Force
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# compiler not found.' }
$binary = Join-Path $service 'MaiMemoWakeHost.exe'
& $compiler /nologo /target:winexe "/out:$binary" (Join-Path $service 'WakeHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not build native wake host.' }
$origin = "chrome-extension://$ExtensionId/"
Set-Content -LiteralPath (Join-Path $service 'extension-origin.txt') -Value $origin -NoNewline -Encoding ascii
$manifest = Join-Path $service 'com.maimemo.faststudy.wake.json'
@{ name = 'com.maimemo.faststudy.wake'; description = 'Wake the local MaiMemo speech service on demand'; path = $binary; type = 'stdio'; allowed_origins = @($origin) } |
  ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifest -Encoding ascii
$registry = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Google\Chrome\NativeMessagingHosts\com.maimemo.faststudy.wake')
try { $registry.SetValue('', $manifest) } finally { $registry.Close() }
Write-Host 'Registered on-demand local speech wake host.'

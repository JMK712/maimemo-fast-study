param([string]$PythonPath, [string]$ExtensionId)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'MaiMemoFastStudy'
$models = Join-Path $root 'models'
$extension = Split-Path $PSScriptRoot -Parent
$venv = Join-Path $root '.venv'
$venvPython = Join-Path $venv 'Scripts\python.exe'
New-Item -ItemType Directory -Force -Path $models | Out-Null

function Get-VerifiedFile([string]$name, [string]$url, [string]$sha256) {
  $target = Join-Path $models $name
  if ((Test-Path -LiteralPath $target) -and (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash -eq $sha256) { return }
  $temporary = "$target.download"
  try {
    Invoke-WebRequest -Uri $url -OutFile $temporary
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $temporary).Hash -ne $sha256) { throw "Checksum mismatch: $name" }
    Move-Item -LiteralPath $temporary -Destination $target -Force
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
}

Get-VerifiedFile 'kokoro-v1.0.onnx' 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx' 'BEB0D1848DEE9A49DA392CC3DF26958D46CFA35D321EDF434F52949153F0DF3A'
Get-VerifiedFile 'voices-v1.0.bin' 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin' 'BCA610B8308E8D99F32E6FE4197E7EC01679264EFED0CAC9140FE9C29F1FBF7D'

if (-not (Test-Path -LiteralPath $venvPython)) {
  if (Get-Command uv -ErrorAction SilentlyContinue) {
    if ($PythonPath) { & uv venv --python $PythonPath $venv }
    else { & uv venv --python 3.12 $venv }
  } elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.12 -m venv $venv
  } else {
    throw 'Install Python 3.12 or uv, then rerun this installer.'
  }
  if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment.' }
}
if (Get-Command uv -ErrorAction SilentlyContinue) {
  & uv pip install --python $venvPython 'kokoro-onnx==0.6.0'
} else {
  & $venvPython -m pip install 'kokoro-onnx==0.6.0'
}
if ($LASTEXITCODE -ne 0) { throw 'Could not install Kokoro runtime.' }

$tokenFile = Join-Path $root 'secret.txt'
if (-not (Test-Path -LiteralPath $tokenFile)) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [System.IO.File]::WriteAllText($tokenFile, [Convert]::ToHexString($bytes).ToLowerInvariant())
}
$token = [System.IO.File]::ReadAllText($tokenFile).Trim()
@{ token = $token } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $extension 'local-secret.json') -NoNewline -Encoding ascii
Write-Host "Installed offline model and local token in $root"
if ($ExtensionId) { & (Join-Path $PSScriptRoot 'register-wake-host.ps1') -ExtensionId $ExtensionId }
Write-Host 'Reload the unpacked Chrome extension. If no ExtensionId was supplied, register the wake host separately.'

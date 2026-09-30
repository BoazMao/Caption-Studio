param([string]$Python = "python")
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot ".tools\whisperx"
& $Python -m venv $environmentPath
if ($LASTEXITCODE -ne 0) { throw "Python 3.10–3.13 is required to create the WhisperX environment." }
$environmentPython = Join-Path $environmentPath "Scripts\python.exe"
& $environmentPython -m pip install -r (Join-Path $PSScriptRoot "requirements-whisperx.txt")
if ($LASTEXITCODE -ne 0) { throw "WhisperX installation failed. Check the pip output above." }
Write-Output "WhisperX Python executable: $environmentPython"
Write-Output "Choose this executable in Settings, then use Check WhisperX setup. Models download on first use."

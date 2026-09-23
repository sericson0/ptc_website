$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$VenvPath = Join-Path $RepoRoot ".ptc-venv"
$PythonPath = Join-Path $VenvPath "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $PythonPath)) {
  Write-Host "Creating the private local-AI environment..."
  py -3 -m venv $VenvPath
}

Write-Host "Installing local Whisper (no OpenAI API credits)..."
& $PythonPath -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot "requirements-local.txt")

Write-Host "Local Whisper is ready. The speech model downloads automatically on the first video."

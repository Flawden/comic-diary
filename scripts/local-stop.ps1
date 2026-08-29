$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host ""
Write-Host "===== STOP COMIC DIARY LOCAL ====="

docker compose stop app db

if ($LASTEXITCODE -ne 0) {
    throw "Failed to stop Comic Diary containers"
}

Write-Host ""
Write-Host "Comic Diary Docker services stopped."

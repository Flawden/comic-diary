$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$env:DATABASE_URL = "postgresql://comic_diary:comic_diary_dev@localhost:5433/comic_diary"

function Test-DockerReady {
    cmd.exe /d /c "docker info >nul 2>&1"
    return ($LASTEXITCODE -eq 0)
}

Write-Host ""
Write-Host "======================================"
Write-Host "       COMIC DIARY LOCAL START"
Write-Host "======================================"
Write-Host ""
Write-Host "Project: $ProjectRoot"

Write-Host ""
Write-Host "===== DOCKER ====="

if (-not (Test-DockerReady)) {
    Write-Host "Docker is not ready."

    $DockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

    if (-not (Test-Path $DockerDesktop)) {
        throw "Docker Desktop executable was not found"
    }

    Write-Host "Starting Docker Desktop..."
    Start-Process $DockerDesktop

    $DockerReady = $false

    for ($i = 1; $i -le 60; $i++) {
        Start-Sleep -Seconds 2

        if (Test-DockerReady) {
            $DockerReady = $true
            break
        }

        Write-Host "Waiting for Docker... $i/60"
    }

    if (-not $DockerReady) {
        throw "Docker Desktop did not become ready"
    }
}

Write-Host "Docker: OK"

Write-Host ""
Write-Host "===== STOP CONTAINERIZED APP ====="

cmd.exe /d /c "docker compose stop app >nul 2>&1"

Write-Host ""
Write-Host "===== DATABASE ====="

docker compose up -d db

if ($LASTEXITCODE -ne 0) {
    throw "Failed to start PostgreSQL"
}

Write-Host "Waiting for PostgreSQL..."

$Healthy = $false

for ($i = 1; $i -le 30; $i++) {
    $Status = cmd.exe /d /c "docker inspect --format=""{{.State.Health.Status}}"" comic-diary-db 2>nul"

    if ($Status.Trim() -eq "healthy") {
        $Healthy = $true
        break
    }

    Write-Host "Database health check... $i/30"
    Start-Sleep -Seconds 1
}

if (-not $Healthy) {
    docker compose logs db --tail 100
    throw "PostgreSQL did not become healthy"
}

Write-Host "PostgreSQL: healthy"

Write-Host ""
Write-Host "===== MIGRATIONS ====="

npx.cmd drizzle-kit migrate

if ($LASTEXITCODE -ne 0) {
    throw "Database migration failed"
}

Write-Host "Migrations: OK"

Write-Host ""
Write-Host "===== PORT 3000 ====="

$Listener = Get-NetTCPConnection `
    -LocalPort 3000 `
    -State Listen `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($Listener) {
    $ExistingProcess = Get-Process `
        -Id $Listener.OwningProcess `
        -ErrorAction SilentlyContinue

    Write-Host "Port 3000 is occupied."
    Write-Host "PID: $($Listener.OwningProcess)"

    if ($ExistingProcess) {
        Write-Host "Process: $($ExistingProcess.ProcessName)"
    }

    throw "Port 3000 must be free"
}

Write-Host "Port 3000: free"

Write-Host ""
Write-Host "======================================"
Write-Host "          COMIC DIARY READY"
Write-Host "======================================"
Write-Host ""
Write-Host "http://localhost:3000"
Write-Host ""
Write-Host "Ctrl+C = stop Next.js"
Write-Host "PostgreSQL remains running."
Write-Host ""

$NextCli = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"

if (-not (Test-Path $NextCli)) {
    throw "Next.js CLI was not found. Run npm install first."
}

node.exe $NextCli dev

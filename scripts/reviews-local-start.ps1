param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$reviewContainer = 'comic-reviews-pg17-20261120'
$reviewMetadata = & docker inspect $reviewContainer --format '{{index .Config.Labels "comic-diary.reviews"}}|{{json .NetworkSettings.Ports}}|{{.State.Running}}' 2>$null
if ($LASTEXITCODE -ne 0) {
    & docker run -d --name $reviewContainer --label comic-diary.reviews=20261120 -p 127.0.0.1:55545:5432 -e POSTGRES_USER=review01_qa -e POSTGRES_PASSWORD=synthetic_review_only -e POSTGRES_DB=review01_review postgres:17-alpine
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create isolated review demo DB' }
    $reviewMetadata = & docker inspect $reviewContainer --format '{{index .Config.Labels "comic-diary.reviews"}}|{{json .NetworkSettings.Ports}}|{{.State.Running}}'
}
$reviewParts = $reviewMetadata -split '\|',3
if ($reviewParts[0] -ne '20261120') { throw 'Refused: container is not owned by this demo' }
$reviewPorts = $reviewParts[1] | ConvertFrom-Json
$reviewBindings = @($reviewPorts.'5432/tcp')
if ($reviewBindings.Count -ne 1 -or $reviewBindings[0].HostIp -ne '127.0.0.1' -or $reviewBindings[0].HostPort -ne '55545') { throw 'Refused: unexpected DB port mapping' }
if ($reviewParts[2] -ne 'true') { & docker start $reviewContainer | Out-Null }
$reviewReady = $false
for ($reviewAttempt=0; $reviewAttempt -lt 30; $reviewAttempt++) {
    & docker exec $reviewContainer pg_isready -U review01_qa -d review01_review *> $null
    if ($LASTEXITCODE -eq 0) { $reviewReady=$true; break }
    Start-Sleep -Milliseconds 500
}
if (-not $reviewReady) { throw 'Disposable PostgreSQL did not become ready' }
$env:DATABASE_URL = 'postgresql://review01_qa:synthetic_review_only@127.0.0.1:55545/review01_review'
$env:REVIEWS_TEST_DATABASE_URL = $env:DATABASE_URL
$env:COMIC_DIARY_PUBLIC_ORIGIN = 'http://127.0.0.1:3111'
$env:NEXT_TELEMETRY_DISABLED = '1'
Remove-Item Env:RESEND_API_KEY -ErrorAction SilentlyContinue
$reviewOffFlags = @('PASSWORD_RESET_REQUEST_ENABLED','PASSWORD_RESET_REQUEST_MAIL_READY','PASSWORD_RESET_REDEEM_ENABLED','AUTH_RECOVERY_WORKER_ENABLED','AUTH_RECOVERY_DISPATCH_ENABLED','AUTH_RECOVERY_SENDER_VERIFIED','AUTH_RECOVERY_RESEND_CONFIG_READY','REGISTRATION_ENABLED','REGISTRATION_ACTIVATION_REDEEM_ENABLED','AUTH_ACTIVATION_RESEND_CONFIG_READY','AUTH_ACTIVATION_SENDER_VERIFIED','AUTH_ACTIVATION_DISPATCH_ENABLED','AUTH_ACTIVATION_WORKER_ENABLED','AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED','AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED','AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED')
foreach ($reviewFlag in $reviewOffFlags) { Set-Item -Path "Env:$reviewFlag" -Value 'false' }
& node scripts/migrate-production.mjs
if ($LASTEXITCODE -ne 0) { throw 'Disposable migration failed' }
& node --import tsx scripts/reviews-local-demo.ts
if ($LASTEXITCODE -ne 0) { throw 'Synthetic demo seed failed' }
# Direct local login uses the existing development loopback identity contract.
# Production login requires the trusted nginx X-Real-IP header; do not weaken AUTH.
& node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3111

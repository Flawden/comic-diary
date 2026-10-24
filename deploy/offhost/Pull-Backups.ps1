param([string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'ComicDiaryBackup\config.json'))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pull-Core.ps1')
$exitCode=0;$lock=$null;$stage=$null;$archive=$null;$log=$null
function Write-PullLog {
    param([string]$Message)
    $line=([DateTimeOffset]::Now.ToString('o'))+' '+$Message
    if ($script:log) { Add-Content -LiteralPath $script:log -Value $line -Encoding UTF8 }
    Write-Host $Message
}
try {
    $config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($config.managedBy -ne $script:PullManagedBy) { throw 'Unknown pull configuration.' }
    $root=Assert-LocalPath $config.destination
    if ((Get-Content -LiteralPath (Join-Path $root '.managed-v1') -Raw).Trim() -ne $script:PullManagedBy) { throw 'Unmanaged backup destination.' }
    try { $lock=[IO.File]::Open((Join-Path $root '.pull.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
    catch { Write-Host 'RESULT=SKIPPED; another pull is active or destination is unavailable';exit 1 }
    $script:log=Join-Path $root 'pull.log'
    $raw=Invoke-TextProcess $config.sshExe (Get-PullSshArguments $config @('list'))
    if ($raw.Length -gt 2097152) { throw 'Inventory too large.' }
    $inventory=$raw | ConvertFrom-Json
    if ($inventory.schemaVersion -ne 1) { throw 'Unsupported inventory version.' }
    $backups=@($inventory.backups)
    $names=@($backups | ForEach-Object { $_.name })
    if ($names.Count -eq 0 -or $names.Count -gt 1000 -or @($names | Sort-Object -Unique).Count -ne $names.Count) { throw 'Invalid backup inventory.' }
    $now=[DateTimeOffset]::UtcNow
    foreach ($backup in $backups) {
        $stamp=Assert-Manifest $backup
        if ($stamp -gt $now.AddMinutes(5)) { throw 'Backup timestamp is in the future; check clock.' }
    }
    $latest=@($backups | Where-Object { $_.name -ceq $inventory.latest })
    if ($latest.Count -ne 1) { throw 'Latest backup missing.' }
    $latestTime=Assert-Manifest $latest[0]
    if (($now-$latestTime).TotalHours -gt 36) { throw 'Latest server backup is older than 36 hours.' }
    $downloaded=0;$existing=0
    foreach ($backup in @($backups | Sort-Object { [DateTimeOffset]::Parse($_.completedAt) })) {
        $target=Join-Path $root $backup.name
        if (Test-Path -LiteralPath $target) {
            [void](Assert-LocalPath $target)
            $marker=Get-Content -LiteralPath (Join-Path $target '.verified.json') -Raw | ConvertFrom-Json
            if ($marker.managedBy -ne $script:PullManagedBy -or $marker.backup.name -cne $backup.name) { throw 'Unrecognized existing backup directory.' }
            Assert-BackupFiles $target $backup -AllowMarker
            $existing++;continue
        }
        $size=[long]0
        foreach ($entry in $backup.files) { $size += [long]$entry.size }
        $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($root))
        if ($drive.AvailableFreeSpace -lt (2*$size+268435456)) { throw 'Not enough free space for archive and verified extraction.' }
        $tag=[Guid]::NewGuid().ToString('N')
        $archive=Join-Path $root ('.download-'+$tag+'.tar')
        $stage=Join-Path $root ('.partial-'+$tag)
        Write-PullLog ('DOWNLOADING='+$backup.name)
        Receive-BackupArchive $config $backup.name $archive
        Expand-VerifiedArchive $config.tarExe $archive $stage $backup
        $proof=@{managedBy=$script:PullManagedBy;verifiedAt=[DateTimeOffset]::UtcNow.ToString('o');backup=$backup}
        [IO.File]::WriteAllText((Join-Path $stage '.verified.json'),($proof | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
        Remove-Item -LiteralPath $archive -Force;$archive=$null
        Move-Item -LiteralPath $stage -Destination $target;$stage=$null
        $downloaded++
        Write-PullLog ('VERIFIED='+$backup.name)
    }
    # Delete only older, still-valid copies created by this tool. Manual/corrupt
    # directories and partial transfers never become deletion candidates.
    $candidates=@()
    foreach ($folder in @(Get-ChildItem -LiteralPath $root -Directory -Force)) {
        if ($folder.Name -notmatch '^backup-\d{8}T\d{6}Z-[0-9a-f]{8}$') { continue }
        try {
            [void](Assert-LocalPath $folder.FullName)
            $proof=Get-Content -LiteralPath (Join-Path $folder.FullName '.verified.json') -Raw | ConvertFrom-Json
            if ($proof.managedBy -ne $script:PullManagedBy -or $proof.backup.name -cne $folder.Name) { continue }
            Assert-BackupFiles $folder.FullName $proof.backup -AllowMarker
            $candidates += [PSCustomObject]@{folder=$folder.FullName;name=$folder.Name;date=(Assert-Manifest $proof.backup);latest=($folder.Name -ceq $inventory.latest)}
        } catch { Write-PullLog ('RETENTION_SKIPPED='+$folder.Name) }
    }
    $ordered=@($candidates | Sort-Object @{Expression='latest';Descending=$true},@{Expression='date';Descending=$true})
    foreach ($item in @($ordered | Select-Object -Skip 30)) {
        Remove-Item -LiteralPath $item.folder -Recurse -Force
        Write-PullLog ('RETENTION_REMOVED='+$item.name)
    }
    Write-PullLog ('RESULT=PASS; downloaded='+$downloaded+'; already_verified='+$existing+'; latest='+$inventory.latest)
    Write-PullLog ('DESTINATION='+$root)
} catch {
    $exitCode=1
    Write-PullLog ('RESULT=FAIL; '+$_.Exception.Message)
} finally {
    if ($archive -and (Test-Path -LiteralPath $archive)) { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    if ($null -ne $lock) { $lock.Dispose() }
}
exit $exitCode

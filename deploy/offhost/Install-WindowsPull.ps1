param([string]$Destination = (Join-Path $env:USERPROFILE 'Backups\ComicDiary'))
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pull-Core.ps1')
$root=Assert-LocalPath $Destination
$installRoot=Assert-LocalPath (Join-Path $env:LOCALAPPDATA 'ComicDiaryBackup')
$key=Assert-LocalPath (Join-Path $env:USERPROFILE '.ssh\id_ed25519_comic_diary_backup')
$sshExe=(Get-Command ssh.exe -ErrorAction Stop).Source
$scpExe=(Get-Command scp.exe -ErrorAction Stop).Source
$keygenExe=(Get-Command ssh-keygen.exe -ErrorAction Stop).Source
$tarExe=(Get-Command tar.exe -ErrorAction Stop).Source
foreach ($folder in @($root,$installRoot)) {
    if (Test-Path -LiteralPath $folder) {
        $items=@(Get-ChildItem -LiteralPath $folder -Force)
        if ($items.Count -gt 0) {
            $marker=Join-Path $folder '.managed-v1'
            if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne $script:PullManagedBy) { throw "Unmanaged nonempty directory: $folder" }
        }
    } else { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
    Set-PrivateAcl $folder
    [IO.File]::WriteAllText((Join-Path $folder '.managed-v1'),$script:PullManagedBy,(New-Object Text.UTF8Encoding($false)))
}
$keyParent=Split-Path -Path $key -Parent
if (-not (Test-Path -LiteralPath $keyParent)) { New-Item -ItemType Directory -Path $keyParent | Out-Null }
# Reuse only this tool's dedicated key. Existing admin keys are never overwritten.
if (-not (Test-Path -LiteralPath $key)) {
    if (Test-Path -LiteralPath ($key+'.pub')) { throw 'Orphaned public key exists; inspect it before retrying.' }
    [void](Invoke-TextProcess $keygenExe @('-t','ed25519','-N','','-f',$key,'-C',$script:PullManagedBy))
}
Set-PrivateAcl $key
$derived=(Invoke-TextProcess $keygenExe @('-y','-P','','-f',$key)).Trim()
if ($derived -notmatch '^(ssh-ed25519 [A-Za-z0-9+/=]+)(?:[ \t]+[^\r\n]*)?$') {
    throw 'Unexpected key format.'
}
$derived = $Matches[1]
[IO.File]::WriteAllText(($key+'.pub'),$derived+' '+$script:PullManagedBy+"`n",(New-Object Text.UTF8Encoding($false)))
# Pin the public host key through the already-trusted administrative SSH connection.
$hostKey=(Invoke-TextProcess $sshExe @('-o','ConnectTimeout=20','lab','cat /etc/ssh/ssh_host_ed25519_key.pub')).Trim()
if ($hostKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/=]+(?: .*)?$') { throw 'Could not obtain trusted host key.' }
$hostParts=$hostKey -split '\s+'
$knownHosts=Join-Path $installRoot 'known_hosts'
[IO.File]::WriteAllText($knownHosts,('2.26.67.21 '+$hostParts[0]+' '+$hostParts[1]+"`n"),(New-Object Text.UTF8Encoding($false)))
$emptyConfig=Join-Path $installRoot 'ssh_config'
if ($knownHosts.Contains('"') -or $knownHosts.Contains("`n")) { throw 'Invalid known hosts path.' }
$sshConfigText='Host *'+"`n"+'    UserKnownHostsFile "'+$knownHosts.Replace('\','/')+'"'+"`n"
[IO.File]::WriteAllText($emptyConfig,$sshConfigText,(New-Object Text.UTF8Encoding($false)))
& $sshExe lab 'install -d -m 700 comic-diary-pull-install'
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare server staging directory.' }
$sources=@('exporter.py','ssh_entry.py','install_server.py') | ForEach-Object { Join-Path $PSScriptRoot $_ }
& $scpExe @sources ($key+'.pub') 'lab:comic-diary-pull-install/'
if ($LASTEXITCODE -ne 0) { throw 'Could not transfer exporter and public key.' }
& $sshExe -tt -o ServerAliveInterval=15 -o ServerAliveCountMax=4 lab 'sudo python3 ~/comic-diary-pull-install/install_server.py ~/comic-diary-pull-install/id_ed25519_comic_diary_backup.pub'
if ($LASTEXITCODE -ne 0) { throw 'Server exporter installation failed.' }
foreach ($name in @('Pull-Core.ps1','Pull-Backups.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $installRoot $name) -Force }
$config=@{managedBy=$script:PullManagedBy;destination=$root;keyPath=$key;knownHosts=$knownHosts;emptyConfig=$emptyConfig;sshExe=$sshExe;tarExe=$tarExe}
$configPath=Join-Path $installRoot 'config.json'
[IO.File]::WriteAllText($configPath,($config | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
$config=$config | ConvertTo-Json | ConvertFrom-Json
# Prove the new identity works for export and refuses general commands.
$inventory=Invoke-TextProcess $sshExe (Get-PullSshArguments $config @('list'))
if (($inventory | ConvertFrom-Json).schemaVersion -ne 1) { throw 'Unexpected server inventory.' }
$refused=$false
try { [void](Invoke-TextProcess $sshExe (Get-PullSshArguments $config @('id'))) } catch { $refused=$true }
if (-not $refused) { throw 'Backup identity unexpectedly permits non-export commands.' }
$powerShell=Join-Path $PSHOME 'powershell.exe'
& $powerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installRoot 'Pull-Backups.ps1') -ConfigPath $configPath
if ($LASTEXITCODE -ne 0) { throw 'First verified download failed; scheduled task was not changed.' }
$taskName='ComicDiary-BackupPull'
$existingTask=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.Description -ne $script:PullManagedBy) { throw 'Unmanaged task with this name already exists.' }
$arguments='-NoProfile -ExecutionPolicy Bypass -File '+(Get-WindowsArguments @((Join-Path $installRoot 'Pull-Backups.ps1')))+' -ConfigPath '+(Get-WindowsArguments @($configPath))
$action=New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$triggers=@((New-ScheduledTaskTrigger -Daily -At '04:00'),(New-ScheduledTaskTrigger -AtLogOn -User $user))
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 45) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30)
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$task=New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description $script:PullManagedBy
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime,LastTaskResult,NextRunTime
Write-Host 'INSTALL=PASS; verified off-host copy downloaded; daily 04:00 PC local time and at logon; keep 30 verified managed copies.'
Write-Host ('DESTINATION='+$root)
Write-Host 'RESTORE_FROM_OFF_HOST_COPY=NOT_TESTED; files and SHA-256 transfer verified, restore drill remains separate.'

# Comic Diary Windows pull helpers. PowerShell 5.1 compatible.
Set-StrictMode -Version Latest
$script:PullManagedBy = 'comic-diary-windows-pull-v1'
$script:PullFiles = @('database.dump','media.tar.gz','backup.json','media-manifest.json','dump-list.txt','SHA256SUMS','SUCCESS.json')

function Assert-LocalPath {
    param([string]$Path)
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -notmatch '^[A-Za-z]:\\') { throw 'A local Windows drive is required.' }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked/reparse path refused.' }
        }
        $parent = Split-Path -Path $cursor -Parent
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $full
}

function Set-PrivateAcl {
    param([string]$Path)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $isDirectory = Test-Path -LiteralPath $Path -PathType Container
    if ($isDirectory) {
        $acl = New-Object Security.AccessControl.DirectorySecurity
    } else {
        $acl = New-Object Security.AccessControl.FileSecurity
    }
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    if (Test-Path -LiteralPath $Path -PathType Container) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    } else { $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow') }
    $acl.SetOwner($sid)
    $acl.AddAccessRule($rule)
    if ($isDirectory) {
        [IO.Directory]::SetAccessControl($Path, $acl)
    } else {
        [IO.File]::SetAccessControl($Path, $acl)
    }
}

function Get-WindowsArguments {
    param([string[]]$Values)
    # Every argument is quoted independently; Windows filenames cannot contain quotes.
    $quoted = foreach ($value in $Values) {
        if ($value.Contains('"') -or $value.Contains("`n") -or $value.Contains("`r")) { throw 'Invalid process argument.' }
        '"' + ($value -replace '(\\+)$','$1$1') + '"'
    }
    return $quoted -join ' '
}

function Invoke-TextProcess {
    param([string]$Executable,[string[]]$Values,[int]$TimeoutSeconds=120)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$Executable
    $info.Arguments=Get-WindowsArguments $Values
    $info.UseShellExecute=$false
    $info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    $process = New-Object Diagnostics.Process
    $process.StartInfo=$info
    try {
        [void]$process.Start()
        $stdout=$process.StandardOutput.ReadToEndAsync()
        $stderr=$process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds*1000)) { $process.Kill();throw 'Process timed out.' }
        $text=$stdout.GetAwaiter().GetResult()
        [void]$stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "Process failed ($($process.ExitCode)): $([IO.Path]::GetFileName($Executable))" }
        return $text
    } finally { $process.Dispose() }
}

function Get-PullSshArguments {
    param($Config,[string[]]$RemoteCommand)
    return @('-T','-F',$Config.emptyConfig,'-i',$Config.keyPath,
        '-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
        '-o','ConnectTimeout=15',
        '-o','ServerAliveInterval=15','-o','ServerAliveCountMax=4','-o','Compression=no',
        '-p','22','flawden@2.26.67.21') + $RemoteCommand
}

function Receive-BackupArchive {
    param($Config,[string]$Name,[string]$Target)
    if ($Name -notmatch '^backup-\d{8}T\d{6}Z-[0-9a-f]{8}$') { throw 'Invalid backup name.' }
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$Config.sshExe
    $info.Arguments=Get-WindowsArguments (Get-PullSshArguments $Config @('get',$Name))
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $process=New-Object Diagnostics.Process;$process.StartInfo=$info
    $file=$null
    try {
        $file=[IO.File]::Open($Target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        [void]$process.Start()
        $stderr=$process.StandardError.ReadToEndAsync()
        # Binary copy: PowerShell text pipelines corrupt database/media archives.
        $copy=$process.StandardOutput.BaseStream.CopyToAsync($file)
        if (-not $copy.Wait(1800000)) { $process.Kill();throw 'Backup download timed out.' }
        $copy.GetAwaiter().GetResult()
        if (-not $process.WaitForExit(15000)) { $process.Kill();throw 'SSH did not finish.' }
        [void]$stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw 'Backup download failed.' }
    } finally {
        if ($null -ne $file) { $file.Dispose() }
        try { if (-not $process.HasExited) { $process.Kill() } } catch {}
        $process.Dispose()
    }
}

function Assert-Manifest {
    param($Backup)
    if ($Backup.name -notmatch '^backup-\d{8}T\d{6}Z-[0-9a-f]{8}$') { throw 'Invalid backup identity.' }
    $stamp=[DateTimeOffset]::Parse($Backup.completedAt,[Globalization.CultureInfo]::InvariantCulture)
    if ($Backup.completedAt -notmatch '(Z|[+-]\d\d:\d\d)$') { throw 'Timestamp needs timezone.' }
    $names=@($Backup.files | ForEach-Object { $_.name })
    if ($names.Count -ne 7 -or @($names | Sort-Object -Unique).Count -ne 7) { throw 'Incomplete or duplicate file manifest.' }
    foreach ($entry in $Backup.files) {
        if ($entry.name -cnotin $script:PullFiles -or $entry.sha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'Invalid file manifest.' }
        $size=[long]$entry.size
        if ($size -le 0 -or $size -gt 549755813888 -or $entry.size -ne $size) { throw 'Invalid file size.' }
    }
    return $stamp
}

function Assert-BackupFiles {
    param([string]$Folder,$Backup,[switch]$AllowMarker)
    [void](Assert-Manifest $Backup)
    $expected=@($script:PullFiles)
    if ($AllowMarker) { $expected += '.verified.json' }
    $items=@(Get-ChildItem -LiteralPath $Folder -Force)
    if ($items.Count -ne $expected.Count) { throw 'Unexpected backup directory contents.' }
    foreach ($item in $items) {
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Name -cnotin $expected) { throw 'Unexpected file/link in backup.' }
    }
    foreach ($entry in $Backup.files) {
        $path=Join-Path $Folder $entry.name
        if ((Get-Item -LiteralPath $path).Length -ne [long]$entry.size) { throw 'Backup file size mismatch.' }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256) { throw 'Backup SHA-256 mismatch.' }
    }
}

function Expand-VerifiedArchive {
    param([string]$TarExe,[string]$Archive,[string]$Folder,$Backup)
    $listing=Invoke-TextProcess $TarExe @('-tf',$Archive)
    $names=@($listing -split '\r?\n' | Where-Object { $_ -ne '' })
    if ($names.Count -ne 7 -or @($names | Sort-Object -Unique).Count -ne 7) { throw 'Unexpected archive entries.' }
    foreach ($name in $names) { if ($name -cnotin $script:PullFiles) { throw 'Unsafe archive path.' } }
    # Server emits fixed-name regular USTAR files; reject links/devices as well.
    $details=Invoke-TextProcess $TarExe @('-tvf',$Archive)
    foreach ($line in @($details -split '\r?\n' | Where-Object { $_ -ne '' })) {
        if (-not $line.StartsWith('-')) { throw 'Nonregular archive member.' }
    }
    New-Item -ItemType Directory -Path $Folder | Out-Null
    [void](Invoke-TextProcess $TarExe @('-xf',$Archive,'-C',$Folder))
    Assert-BackupFiles $Folder $Backup
}

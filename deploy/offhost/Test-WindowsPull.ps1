Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
foreach ($script in @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1')) {
    $tokens=$null;$errors=$null
    [void][Management.Automation.Language.Parser]::ParseFile($script.FullName,[ref]$tokens,[ref]$errors)
    if ($errors.Count -gt 0) { throw "PowerShell parse error in $($script.Name): $errors" }
}
. (Join-Path $PSScriptRoot 'Pull-Core.ps1')
function Must-Fail { param([scriptblock]$Code) $failed=$false;try { & $Code } catch { $failed=$true };if (-not $failed) { throw 'Expected rejection did not occur.' } }
$temp=Join-Path $env:TEMP ('ComicDiary pull test '+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    $source=Join-Path $temp 'source';New-Item -ItemType Directory -Path $source | Out-Null
    $entries=@()
    foreach ($name in $script:PullFiles) {
        $path=Join-Path $source $name
        [IO.File]::WriteAllBytes($path,[byte[]]@(0,255,13,10,88,89,90))
        $entries += [PSCustomObject]@{name=$name;size=7;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $backup=[PSCustomObject]@{name='backup-20261024T031700Z-1234abcd';completedAt='2026-10-24T03:17:00+00:00';files=$entries}
    Assert-BackupFiles $source $backup
    $tar=(Get-Command tar.exe).Source
    $archive=Join-Path $temp 'binary archive.tar'
    [void](Invoke-TextProcess $tar @('-cf',$archive,'-C',$source,'.'))
    # Only exact, flat names from server are accepted, not ./foo variants.
    Must-Fail { Expand-VerifiedArchive $tar $archive (Join-Path $temp 'refused') $backup }
    Remove-Item -LiteralPath $archive
    [void](Invoke-TextProcess $tar (@('-cf',$archive,'-C',$source) + $script:PullFiles))
    $target=Join-Path $temp 'verified copy'
    Expand-VerifiedArchive $tar $archive $target $backup
    [IO.File]::WriteAllBytes((Join-Path $target 'database.dump'),[byte[]]@(0,255,13,10,88,89,91))
    Must-Fail { Assert-BackupFiles $target $backup }
    $bad=$backup | ConvertTo-Json -Depth 6 | ConvertFrom-Json
    $bad.files[0].name='../database.dump'
    Must-Fail { Assert-Manifest $bad }
    $bad=$backup | ConvertTo-Json -Depth 6 | ConvertFrom-Json
    $bad.files[0].sha256='not-a-hash'
    Must-Fail { Assert-Manifest $bad }
    $bad=$backup | ConvertTo-Json -Depth 6 | ConvertFrom-Json
    $bad.files[1].name=$bad.files[0].name
    Must-Fail { Assert-Manifest $bad }
    Must-Fail { Get-WindowsArguments @('bad"argument') }
    # Empty passphrase must remain an explicit empty argument in the process string.
    if ((Get-WindowsArguments @('-N','')) -ne '"-N" ""') { throw 'Empty argument lost.' }
    $keygen=(Get-Command ssh-keygen.exe).Source
    $key=Join-Path $temp 'test key'
    [void](Invoke-TextProcess $keygen @('-t','ed25519','-N','','-f',$key,'-C','ci-only'))
    $pub=(Invoke-TextProcess $keygen @('-y','-P','','-f',$key)).Trim()
    if ($pub -notmatch '^ssh-ed25519 ') { throw 'Key roundtrip failed.' }
    # Run the actual binary-capture function against a local byte-emitting process.
    $mock=Join-Path $temp 'mock ssh.exe'
    Add-Type -TypeDefinition @'
using System;
class BinaryMock {
    static void Main(string[] args) {
        Console.Error.WriteLine("diagnostic must not enter archive");
        var output=Console.OpenStandardOutput();
        byte[] bytes=new byte[65536];
        for(int i=0;i<bytes.Length;i++) bytes[i]=(byte)(i%256);
        output.Write(bytes,0,bytes.Length);
    }
}
'@ -OutputAssembly $mock -OutputType ConsoleApplication
    $mockConfig=[PSCustomObject]@{sshExe=$mock;emptyConfig='unused';keyPath='unused'}
    $binary=Join-Path $temp 'captured bytes.tar'
    Receive-BackupArchive $mockConfig $backup.name $binary
    $bytes=[IO.File]::ReadAllBytes($binary)
    if ($bytes.Length -ne 65536) { throw 'Binary capture length changed.' }
    for ($i=0;$i -lt $bytes.Length;$i++) { if ($bytes[$i] -ne ($i%256)) { throw 'Binary stdout changed.' } }
    Write-Host 'WINDOWS_PULL_TESTS=PASS; PS5 parser, binary tar/hash roundtrip, unsafe/duplicate names, tampering and empty-argument key generation'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }

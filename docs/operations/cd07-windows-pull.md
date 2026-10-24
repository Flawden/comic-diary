# Windows off-host backup pull

## Installation

Prerequisites: trusted `ssh lab` administrator connection, Windows OpenSSH client,
Windows tar.exe, Windows PowerShell 5.1 and a local NTFS destination. Wait for the
Windows backup client CI job to pass before installing. Run as your usual Windows
user, not another elevated account:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\IdeaProjects\comic-diary\deploy\offhost\Install-WindowsPull.ps1"
```

The installer creates a dedicated key at
`~/.ssh/id_ed25519_comic_diary_backup`, transfers ONLY its public half and exporter
source through the existing administrative connection, and asks for sudo once.
It preserves existing administrative keys. It refuses unmanaged conflicting paths,
tasks and keys. Installation is repeatable with the same managed key.

The root-owned helper exposes only `list` and `get backup-<timestamp>-<id>` for
completed automatic backups. The forced SSH command disables port forwarding,
PTY, agent and X11 forwarding through the authorized_keys `restrict` option. It
cannot run arbitrary commands, write files or export arbitrary server paths.
A narrow sudo rule permits this helper; its Python argument validation is the
command boundary. The helper directory is root-owned and not writable by flawden.
No SSH daemon restart, incoming Windows ports or VPN is required.

The server host key is pinned through the existing trusted `lab` SSH connection.
Automated downloads use their dedicated key/config and strict host verification.
Private key, config and copies have ACLs limited to the current Windows user.
There is no additional encryption at rest: protect the Windows account and disk;
SSH encrypts transport. Dumps contain personal data and must never enter Git.

## Transfer and retention

Default destination: `%USERPROFILE%\Backups\ComicDiary`. First installation
fetches all still-retained server snapshots, oldest first, without recompressing
already-compressed dump/media files. It verifies SHA-256 and sizes of all seven
files, then atomically promotes a fresh temporary directory. Transfer failures do
not replace completed copies. Existing copies are rechecked; corrupt or foreign
folders cause a visible failure or are excluded from retention, never silently
accepted. A `.verified.json` records the source manifest and verification time.

Only after the first successful download does installation register
`ComicDiary-BackupPull`: daily 04:00 **Windows local time**, plus at user logon,
catch-up enabled, three retry attempts at 30-minute intervals, no parallel runs.
The task uses the current user's interactive session without storing a password.
It can run while that session is locked, but not while the user is logged out.
An offline/shut-down PC catches up at the next available logged-in run. Snapshots
already removed from the server's 14-copy window cannot be recovered by this pull.
Keep 30 verified managed copies locally; unmanaged files are preserved. Budget
space for all copies plus one archive and extraction. Logs: destination `pull.log`.

Manual run and task evidence:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\ComicDiaryBackup\Pull-Backups.ps1"
Get-ScheduledTaskInfo -TaskName ComicDiary-BackupPull
```

Success requires `RESULT=PASS` from the actual pull and `INSTALL=PASS`, not merely
successful task registration. No real server or Windows task execution has yet
been confirmed for this implementation. CI tests parsing, binary stdout capture,
archive extraction/hashes, tampering, unsafe names and key argument handling.
Python tests cover read-only export, path boundaries and public-key parsing.

## Remaining acceptance

Restore a downloaded automatic snapshot in isolation and verify DB, media and
application values. This is separate from transfer hash verification and the
previous VPS-only restore drill. Telegram currently confirms the server backup;
it has no Windows receipt and must not claim successful off-host transfer. A full
VPS/network outage cannot be reported by monitoring located on that same VPS.

To disable pulling: `Disable-ScheduledTask -TaskName ComicDiary-BackupPull`.
To revoke this identity on the VPS, remove only the authorized_keys line ending
`comic-diary-windows-pull-v1`. Keep administrator keys and existing copies.

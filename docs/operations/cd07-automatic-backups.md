# CD-07: daily managed backups

Implementation is versioned in `deploy/backup`. Server installation is a separate
operator action; committing the files does not itself enable a timer.

## Install on the production host

Copy the five files from `deploy/backup` to a private staging directory on the host:
`backup.py`, `test_backup.py`, `install.sh`, `comic-diary-backup.service` and
`comic-diary-backup.timer`. Then run:

```bash
sudo bash ~/comic-diary-backup-install/install.sh
```

The installer validates syntax, runs eight unit tests without production access,
checks the calendar, and refuses symlinks or unrelated existing target files. It
backs up any previously managed installation under the manual backups directory,
installs root-owned files, reloads systemd, runs a real backup immediately and checks
its status. Only after success does it enable the timer. It does not restart the
application or DB. If first execution fails, the new timer is not enabled; review
`journalctl -u comic-diary-backup.service`. Repeated installation saves earlier files.

## Schedule and scope

The timer runs daily at 03:15 Europe/Moscow with up to five minutes of random delay.
`Persistent=true` catches a missed scheduled run when the timer resumes. A first
installation/catch-up can therefore create an additional immediate backup.
The service has a 45-minute timeout and lowered CPU/I/O priority. It uses the local
Docker socket, no custom user Docker context, and root-only file permissions.

Each run resolves the currently running Compose `app`/`db` services from
`/opt/comic-diary/compose.yml`. It creates a custom PostgreSQL dump and validates its
archive catalogue, then copies local media, rejects links/special files, creates a
gzip tar archive and reads every archived file to compare SHA-256 with the capture.
Media capture follows the dump and is not an atomic DB/storage snapshot. External
cover URLs are not copied. Full restoration remains a separate drill.

Completed copies are published under:

```text
/opt/comic-diary/backups/automatic/backup-YYYYMMDDTHHMMSSZ-xxxxxxxx/
```

Files: `database.dump`, `dump-list.txt`, `media.tar.gz`, `media-manifest.json`,
`backup.json`, `SHA256SUMS`, and `SUCCESS.json`. Metadata records local image IDs and
available repository digests, never environment secrets. It does not export image
binaries, Compose/.env, host or reverse proxy configuration. These are separate
host-loss recovery requirements.

A file lock rejects overlapping runs. Incomplete staging is removed on a handled
failure; previous complete backups and last-success are preserved. Abrupt host
failure/SIGKILL may leave `.partial-*` directories for manual review. No automatic
cleanup targets those or manual drill/transfer folders.

## Retention

Keep the latest successful copy plus the newest 13 other verified managed copies.
Retention runs only after a new verified copy has been published. It checks hashes
of eligible old backups before counting/deleting them. Unrecognized, linked,
incomplete or corrupt directories are preserved and skipped. Thus there may be more
than 14 directories when corrupt/unmanaged entries exist; review logs/disk usage.
Fourteen copies are not necessarily fourteen days if manual runs are frequent.

## Read-only status and logs

```bash
sudo python3 /usr/local/lib/comic-diary/backup.py --status
sudo systemctl list-timers --all comic-diary-backup.timer --no-pager
sudo systemctl show comic-diary-backup.service -p Result -p ExecMainStatus
sudo journalctl -u comic-diary-backup.service -n 60 --no-pager
```

Status verifies the most recent backup's checksum manifest and a maximum age of 36
hours. Service failures appear in systemd/journal; no email/chat alerts are installed.
`last-attempt.json` records the last attempt separately from `last-success.json`.
Failures log their type and current stage without dumping Docker stderr or secrets.

For a manual backup: `sudo systemctl start comic-diary-backup.service`.
To pause future scheduled runs: `sudo systemctl disable --now comic-diary-backup.timer`.
This does not delete any backups or stop a backup already executing.

## Off-host and restore limitations

This timer stores backups on the production host. It does not provide automatic
separate-storage protection. The manually transferred and checksum-verified copy of
2026-10-18 remains evidence for one off-host copy, not a recurring transfer setup.
Choose a separate destination/credentials before implementing encrypted automated
transfer. Do not commit or send database dumps; they contain account/session data.
Use the existing isolated restoration drill regularly and after storage/schema
changes. A readable dump catalogue and checksums alone do not prove a full restore.

## Validation

Eight Python unit tests with an injected Docker adapter cover publication/checksums,
failures at dump/archive catalogue/media capture, no concurrent runs, root symlink
refusal, stale/corrupt status, safe retention and same-timestamp newest protection.
Installer success/failure/unmanaged-target behavior was simulated. Bash syntax,
systemd unit syntax and calendar were checked locally (a Docker service stub was
needed because Docker/systemd is unavailable in the authoring environment).
Real first backup and timer activation require server output; scheduled execution
requires observing the next run. No operational PASS is claimed from unit tests.

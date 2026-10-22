# CD-07: backup and recovery runbook

The scripts in `deploy/scripts` are run manually on the production Docker host as root.
They expect `/opt/comic-diary/compose.yml`, running Compose services `app` and `db`, and
`MEDIA_ROOT=/app/data/media`. They resolve immutable local image IDs from the running
containers. They do not pull moving image tags or modify application configuration.

## Database drill

```bash
sudo bash deploy/scripts/CHECK_COMIC_DIARY_DB_RESTORE.sh
```

Creates a custom-format PostgreSQL dump with no role ownership/ACL requirements,
checks SHA-256, restores into a disposable container of the same PostgreSQL image,
and reads key table counts. The temporary container has no network or published port.
Public-schema constraints must be validated. This is a database-only drill.

## Database, media and application drill

```bash
sudo bash deploy/scripts/CHECK_COMIC_DIARY_FULL_RESTORE.sh
```

Creates a fresh dump, captures media after the database snapshot, archives media and
extracts it into a separate directory. Symlinks/special files and unsafe archive paths
are rejected. Source and restored file hashes must match. Every `/media/covers/` URL
in the restored database must have a valid file and identical HTTP response bytes.
Concurrent uploads may produce unreferenced files in the archive; a referenced file
missing from the capture fails the drill. This is not an atomic storage snapshot.

The restored DB and the exact current app image run in a new internal Docker network.
No ports are published. Only restored media is mounted, read-only. Import is disabled
in the copy. HTTP checks cover catalog/login/register, anonymous account redirection,
401/no-store for anonymous export, all published shared comic pages and locally
referenced cover bytes/content types. Other remote cover URLs are not fetched.

Temporary app/DB containers, including anonymous DB volumes, and the private network
are removed on success/failure. Dump/archive/checksums/log/manifests remain in the
printed root-only backup folder. Interrupted host/Docker failures may require manual
cleanup: identify only resources with `comic-diary.cd07.restore-probe=true`; never use
broad prune commands. Retained captured/restored media uses extra disk space.

A successful drill proves the tested snapshot can be restored and served. It does not
switch the production application, test authenticated diary UI in the restored copy,
recover the entire host, verify remote media, or establish recurring off-host backups.

## Off-host copy

Package only `database.dump`, `media.tar.gz`, `SHA256SUMS`, `check.log`,
`archive-list.txt`, and `media-manifest.json` from a successful full drill. Generate a
SHA-256 for the outer archive. Transfer over SSH to separate storage, verify the
outer checksum, extract, then verify the dump and media archive against SHA256SUMS.
Restrict access: database dumps contain account hashes, sessions and personal data.
Do not commit dumps, credentials or exports to Git. Keep a copy of the exact app image
reference and PostgreSQL version with the backup; local image IDs alone do not make
an image available after a host loss. Retention, encryption, periodic transfer and
restore schedules still need an explicit operational setup.

## Incident recovery boundary

Do not restore over production merely to repeat this drill. For a real incident,
first preserve the current database/media and configuration, provision new volumes,
restore into those volumes and validate the application before an explicit cutover.
Reissue secrets/revoke restored sessions when the incident requires it. App image,
Compose/.env, registry access, TLS/reverse proxy and host configuration are separate
recovery requirements. The scripts do not copy production secrets into reports.

## Evidence: 2026-10-18

Operator supplied successful output for version `3475343`:

- DB-only drill: `/opt/comic-diary/backups/cd07-db-restore-aTcPAZrO`.
- Full drill: `/opt/comic-diary/backups/cd07-full-restore-nzi1UOlk`.
- Restored counts: users 2, comics 5, chapters 6, user_comics 1, user_chapter_reads 3.
- Three archived media files matched the restored file manifest; one referenced local
  cover passed HTTP SHA-256 comparison. Five published comic pages returned success.
- PostgreSQL image: `sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`.
- App image: `sha256:2f3b727e0e4322bfa6e0e0e32abe356fe0150d8132da5d8202b628da74d2607d`.
- Off-host archive and inner checksums passed on the operator's Windows computer:
  `C:\Users\Atell\Downloads\comic-diary-backup-20261018-180041`.
- Operator confirmed live-site account counters/library retention/theme/reload and
  phone catalog/library/account checks. This is manual production smoke, not an
  automated browser suite or authenticated restored-copy verification.

## CI release gate

The `database` job uses a disposable PostgreSQL 17 service, repeats all migrations on
an empty database, runs seed twice, then checks chapter reading/batch/movement/series
publication, account counters/export and static authorization contracts. Publishing
requires both `verify` and `database`. These probes are not browser automation and do
not replace reviewing CSRF/session/rate-limit behavior, load or accessibility tests.
A first real CI run is required before this new gate is considered proven on GitHub.


## Follow-up: daily backup implementation

CI run 39139359170 at 145d6a9 passed the new PostgreSQL gate, Verify, publish and
production deployment, as confirmed by operator-supplied `gh run view` output.
Daily managed backup code and installation/status procedure now live in
`deploy/backup` and `docs/operations/cd07-automatic-backups.md`. Server installation
and timer evidence remain pending; recurring off-host transfer remains open.

# Web release readiness — 2026-10-23

This is the current acceptance index. Older roadmap sections and delivery notes
remain as history; a deployed implementation and a verified workflow are separate
states. No open item below is closed by a screenshot, unit test or green build alone.

## Confirmed evidence

| Area | Evidence | Result / boundary |
| --- | --- | --- |
| Authentication program | `r6-authentication-program-closure.md` | R6 closed at documented evidence baseline; current regression remains a release concern |
| White Dragon library/shell | `409f824`, CI 39821631109 | Verify, real PostgreSQL checks, image and production deploy passed |
| White Dragon reader pages | `d629907`, CI 39937740617 | Same four jobs passed; operator positive visual feedback |
| Themes/counters/JSON export | CD-06 acceptance at `3475343` | First-release scope accepted; no event timeline or JSON restore implied |
| DB/media recovery drill | `/opt/comic-diary/backups/cd07-full-restore-nzi1UOlk`, operator log 2026-10-18 | DB restore, media roundtrip, public app/cover HTTP checks passed |
| Manual off-host copy | Windows `comic-diary-backup-20261018-180041`, operator log | Outer/inner hashes passed; one copy, not recurring automation |
| Daily backup installation | Operator log 2026-10-22; `backup-20261022T164845Z-81d03560` | Eight tests, first verified backup, enabled/active timer passed |
| First scheduled backup | Operator systemctl/journal/status logs 2026-10-23 | Timer/service started 03:18:38 Moscow, completed 03:18:39, service exit 0 and checksummed fresh backup passed |
| Release evidence tooling | `ccbb77d`, CI 39943925506 | Verify, PostgreSQL, image and deploy passed |
| Backup code CI/deploy | `813efef`, CI 39816827137 | All four jobs passed |
| Responsive reader fixtures | `docs/design/white-dragon.md` | Four pages × four widths; themes, disclosures and selected error/form contracts passed locally |

CI links:
- https://github.com/Flawden/comic-diary/actions/runs/39937740617
- https://github.com/Flawden/comic-diary/actions/runs/39821631109
- https://github.com/Flawden/comic-diary/actions/runs/39816827137

## Remaining gates, in order

1. First scheduled-backup execution is CONFIRMED by the operator logs of
   2026-10-23. For subsequent read-only verification use
   `deploy/scripts/CHECK_COMIC_DIARY_RELEASE_STATUS.sh`. This is read-only. It
   requires a fresh timer trigger and successful service invocation starting
   within 90 seconds of that trigger, plus fresh checksummed backup and successful
   last-attempt state. A later manual start, reboot, queued job or stale trigger
   produces REVIEW instead of a false scheduled PASS; inspect the journal then.
2. Run the updated isolated full restore drill with its adjacent
   `CHECK_COMIC_DIARY_RESTORED_DIARY.cjs`. New authenticated checks are prepared,
   not yet proven on the server. They render account/library/updates/work pages
   and compare exported statuses, tracking, numeric progress, all ratings, notes
   and chapter marks with SQL in the restored DB. Up to five active existing
   accounts with diary entries are checked; no eligible account makes the check
   fail as unexercised. Random short-lived probe sessions exist only in the
   disposable DB and are removed. This is HTTP acceptance, not password login or
   browser interaction acceptance.
3. Finish the live desktop/mobile checklist below after the redesign.
4. Choose separate backup storage and notification destination. Then configure
   encrypted recurring transfer, destination retention, failure/staleness alerts
   and verify a restore from a transferred automatic backup. These facilities are
   not configured by this checkpoint. The production backup timer is local only.
5. Complete security/accessibility/performance release review, including AC-19/20
   from the product specification. Record exact evidence before closure.

## Live acceptance checklist

Use your own account and a deliberate test entry. Do not post credentials, cookie
values, dumps, exports or private diary contents in issue/CI logs. Record only
PASS/FAIL and the tested commit/device. Restore any intentional diary test edits.

| Scenario | Desktop | Mobile |
| --- | --- | --- |
| Login, logout and expired-session navigation | pending | pending |
| Theme survives reload/navigation; visible keyboard focus | pending | pending |
| Catalog search/sort/combined filters/reset | pending | pending |
| Library status filters, list/grid and long titles | pending | pending |
| Read/unread mark survives reload; main/special/revision remain distinct | pending | pending |
| Rating and multiline note save/reload/clear | pending | pending |
| Tracking toggle retains diary; updates load and retry correctly | pending | pending |
| JSON download opens and matches visible personal data | pending | pending |
| Profile name/password feedback; other-device session behavior | pending | pending |
| Admin batch/revision/cover save and import after layout changes | pending | pending |
| Touch target, keyboard order, 200% zoom and no clipped controls | pending | pending |

Positive visual feedback on the deployed redesign is recorded, but does not mark
these functional scenarios passed. Earlier CD-05/CD-06 acceptance remains valid as
historical evidence; this table is the post-redesign regression checklist.

## Operator commands

Put the three check files in one private directory on the server:

```bash
sudo bash ~/comic-diary-release-checks/CHECK_COMIC_DIARY_RELEASE_STATUS.sh
sudo bash ~/comic-diary-release-checks/CHECK_COMIC_DIARY_FULL_RESTORE.sh
```

The status check changes no configuration and starts no backup. The restore drill
reads production for a new snapshot and restores it to an internal disposable
Docker network without published ports; it does not replace the production DB.
It retains its root-only backup/log and removes temporary containers/network.
Do not rerun a manual backup before collecting timer evidence unless needed:
manual execution overwrites the service's most recent invocation timestamps.

Local verification for this checkpoint: Bash/Node syntax, 13 Python backup/status
unit tests and three Node comparator/isolation tests. Real Docker/systemd recovery
and notification/off-host delivery cannot be established in the authoring runtime.


## Ubuntu systemctl timestamp correction — 2026-10-23

The first release-status script returned INVALID_TIMESTAMPS because this host's
systemctl renders LastTriggerUSecMonotonic as `1d 20h 58min 26.960273s`, while
ExecMain*TimestampMonotonic values are integer microseconds. Both forms are now
parsed exactly, including decimal seconds, with unknown/invalid values rejected.
The matching-window, stale/future, successful-exit and last-backup checks remain.

Operator evidence: timer trigger and service start at 03:18:38 Moscow; successful
exit at 03:18:39; journal BACKUP=PASS for
`backup-20261023T001839Z-665c23d1`; status verifies hashes/freshness and last attempt.
This closes the first scheduled-run gate, not off-host/alerts/restore acceptance.
Regression tests use the exact supplied monotonic values. Updated script execution
on the host remains to be collected; the prior FAIL was a checker parsing error.

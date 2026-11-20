# RELEASE-01 rollout plan — production actions NOT performed

20 November 2026. This document is a plan for a separate, explicitly approved
release. RELEASE-01A only builds a candidate, pushes its feature branch, opens a
Draft PR and verifies CI. It does not authorize production execution.

## Candidate and compatibility

Base integrated checkpoint a96eadd05597e849d2f22d03f87c27f722c3e88f;
accepted activation checkpoint 8b6e78cbea7abcc4930ffc4f01ed61cf06b1afbb.
The candidate includes current Tea/Paper/Night, RATE, threaded COMMUNITY/moderation,
password recovery and registration activation. No merge/cherry-pick is needed.

Before rollout, record actual deployed SHA/image digest and database migration
journal from an approved operator session. Do not assume last observed production
SHA a5119b2 is still current. Compare the exact candidate migration journal with
production; check every applied SQL hash, no drift or partial/manual migration.
On that last observed base, migrations 0031 through 0046 are outstanding; apply
only the missing ordered journal entries using the existing migration runner.
0031-0044 add AUTH token/outbox/control/security state; 0045 adds COMMUNITY;
0046 appends activation dispatch_started_at and its CHECK. Do not replay AUTH DDL,
rewrite applied migrations or use schema push. Verify required indexes/checks,
control singleton rows default OFF, pending/legacy account policy and runtime
permissions. Historical users keep verification_required_at NULL; do not backfill
all users as pending. Confirm an existing ADMIN_SECURITY account can still sign in.

Schema additions are generally backward compatible for the previous application,
but verify against an exact restored backup and the previous immutable image.
Do not promise a down migration or roll back the DB by dropping new tables.
Fresh columns/check validation can acquire locks: measure duration on the restored
copy, set an approved maintenance window and fail on unexpected lock waits.

## Backup and restore gate

1. Freeze risky administrative mutations for the cutover window; record timestamp,
   running image digest, schema journal, current public origin and flags.
2. Use the project's existing protected backup mechanism for a consistent pg_dump
   plus role/extension metadata and uploaded media. Keep secret/AEAD key backup
   separate, encrypted and access controlled. No secrets in review ZIP or Git.
3. Verify successful dump exit, nonzero archive, SHA-256 and pg_restore --list.
   A readable listing alone is not a restore test.
4. Restore into a new disposable DB of the supported PostgreSQL major; validate
   user/comic/chapter/membership/progress/rating counts, constraints, login/session
   compatibility, media references and migration journal. Run existing restored-
   diary checks and restore smoke against the restored app.
5. Rehearse all missing migrations and candidate OFF smoke on that restored copy.
   Preserve signed-off backup hashes, restore evidence and measured downtime.
   Stop rollout if restore or schema comparison fails.

## Initial deployment, all mail features OFF

Infrastructure supplied by owner: VPS lab 2.26.67.21, app loopback 127.0.0.1:18082,
current HTTPS vhost comic-diary.2-26-67-21.sslip.io. No access/change was made here.
Use only an immutable image built from the exact approved SHA, pinned digest.
Public registration, activation, password request/redeem, activation/recovery
worker/dispatch/config-ready/sender-verified/operator switches remain OFF initially.
Both persisted mail gates must be OFF; do not let migration/startup turn them ON.
Preserve non-AUTH flags according to the approved product release decision.

Deploy through the project's restricted, reviewed deployment workflow only after
separate approval. Run additive migrations once with the migration role; start
runtime with least-privileged role. Verify readiness, catalog, illustrated work,
login, chapter navigation/marks/personal ratings, community read/write/moderation,
health/build SHA and default-OFF auth boundaries. Verify that invalid Origin fails
before mutation, client IP comes from the trusted proxy and logs contain no PII,
mail content, codes or credentials. Check worker OFF means no provider HTTP.
Do not expose port 18082 publicly; retain reverse-proxy isolation and health checks.

## dracoteka.com and HTTPS

Resend verification of a mail domain does not configure website DNS/TLS.
A separately approved operator must inspect actual DNS, intended A/AAAA, IPv6
routing and existing vhosts before changes. Prepare the dracoteka.com HTTPS vhost,
valid certificate/renewal and upstream 127.0.0.1:18082, retaining known-good vhost
until cutover checks pass. Configure canonical COMIC_DIARY_PUBLIC_ORIGIN and both
AUTH public origins to the exact chosen HTTPS origin without trailing slash.
Forward canonical Host and overwrite X-Real-IP; never trust arbitrary client
X-Forwarded-* for identity. Check Origin/Host enforcement using the public proxy.
Plan any www redirect explicitly, avoid redirecting authentication POST bodies to
another host. Host-only cookies do not move between domains: expect a new login.
Update owner bookmarks and verify login/activation URLs have no codes in query/hash.

## Existing Resend secret — separate protected handoff

Owner reports dracoteka.com Verified, sending DNS configured, one sending API key
already stored on lab at /etc/comic-diary/resend-api-key, root:root 600. The key is
not attached to the running container. Do not create a new key/provider/account.
Do not read, copy, print, change or test that file during RELEASE-01A.

Future operator-approved handoff must supply RESEND_API_KEY at runtime through
protected deployment secret provisioning, outside Git/build args/image layers/
command arguments/history/CI artifacts. This app reads RESEND_API_KEY, not an
unimplemented RESEND_API_KEY_FILE option. A root-only launcher/secret manager may
prepare a mode-600 ephemeral runtime env file outside the repo and pass its PATH
to the container launcher; review Docker/admin visibility and cleanup separately.
Do not mount a root:root 600 file expecting the nonroot app to read it directly.
Do not weaken source file permissions to solve that mismatch. Never log the value.
Provide durable separate 32-byte AEAD keys for activation and recovery; back them
up securely. Match key IDs to queued ciphertext and do not casually rotate keys.
Confirm sender mailbox/domain and key sending scope, without logging credentials.
See AUTH_ACTIVATION_RUNBOOK.md and existing recovery runbook for exact env names.

## Controlled test and staged enabling

1. Keep public intake OFF. Configure correct sender/origin/AEAD settings and only
   then opt in config readiness, redemption, sender-verified, dispatch and worker.
   Persisted gates remain OFF while checking worker health and no accidental HTTP.
2. Read operator status from the canonical same-origin ADMIN_SECURITY session.
   Enable activation gate by audited generation CAS only after readiness. Do not
   use fake authorization objects or direct outbox edits to bypass the protocol.
3. In a controlled window enable registration, submit ONE owner's approved test
   address, observe one job/attempt and one provider classification. Confirm inbox
   receipt independently, then activate with a newly chosen password and log in.
   No auto-login, old password invalid, code single use, old sessions revoked.
   Record status/counts and timing only, never mail body/code/token/key.
4. Distinguish HTTP provider accepted from actual delivery. If uncertain, do not
   retry/requeue the job or repeat HTTP. Pause intake/gate and investigate. A fresh
   user-requested code is a separately reviewed issuance, subject to limits.
5. Recovery has its own flags, readiness and persisted gate. If one-mail budget is
   strictly enforced, keep recovery intake/gate OFF until separately approved
   owner recovery test. Do not claim real recovery delivery from the activation
   email alone. Its full mock regression is already a prerequisite.
6. After signed-off receipt and metrics, gradually enable public intake LAST.
   Monitor request 4xx/5xx/rate limits, READY age, in_flight age, uncertain/rejected,
   worker health, DB lock wait/deadlock, latency and provider rate/errors. Never
   log recipient/code/payload. No automatic retry of uncertain or stale ownership.

## Stop/rollback

Stop new intake first. Authorized operator OFF on each DB gate blocks new starts;
already committed starts may complete and finalize after OFF. Allow bounded
in-flight HTTP/finalization, then disable dispatch/worker. Retain redemption for
already issued codes when safe. Do not clear reservation/start/claim markers or
reset attemptCount, generation or terminal states.

If application rollback is needed, restore the previous approved immutable image
and compatible flags/origin. Keep additive DB schema; verify old app behavior and
health. Reverting public origin may require fresh login. A DB restore is a last
resort approved incident action with an explicit data-loss window and writes
stopped, not an automatic reaction to an application error. Preserve the failed
release's forensic snapshot and reconcile later writes before restoring backup.
No destructive down migration, forced reset or replay of ambiguous mail attempts.

## Acceptance evidence required before production

Approved release SHA/digest, green exact-SHA remote CI links, latest visual report,
verified backup+restore and migration rehearsal, all-AUTH-OFF smoke, DNS/TLS/Host
checks, secret handoff review, named operator/test mailbox approval, rollback owner
and monitoring window. Missing evidence blocks rollout, not local development.

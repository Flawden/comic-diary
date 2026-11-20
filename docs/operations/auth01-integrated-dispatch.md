# AUTH-01 integrated recovery dispatch

Implementation baseline: `96987060cbfe1f12cab2971ec78ab0b2ed8a56d7`.
No production activation is performed by this change. No real Resend credential
is needed to build or test it. Never put real credentials in CI or chat.

## Runtime and permission boundary

`/forgot-password` requests a manually entered code. The same 202 acknowledgement
is returned for known, unknown, inactive and unverified accounts, including
account-specific enqueue failures. Origin, bounded JSON and persistent IP/account
limits remain enforced. Existing verified-mailbox eligibility and 20-minute TTL
are unchanged. Unverified historical accounts do not become recovery-eligible.
The reset endpoint consumes the code, changes the Argon2id password and revokes
all sessions atomically; it does not automatically log in or modify the diary.

Explicit server instrumentation registers a 10-second worker only when
`AUTH_RECOVERY_WORKER_ENABLED=true`. Per process it runs one tick at a time,
handles up to ten jobs, and never retries the HTTP for a claimed job.

Flow: exclusive PostgreSQL claim -> authenticated preflight -> fence -> persisted
operator reservation -> locked final preflight -> durable start commit -> one
Resend POST -> existing outcome bridge -> reserved PostgreSQL finalizer.
The reserved finalizer requires `dispatch_started_at` both in its locked row
validation and in the conditional SQL UPDATE for accepted/rejected/uncertain.
Reservation alone cannot settle a provider result.

The network function is private. No external authorization object, receipt,
recipient, message or idempotency key is accepted. The serialized body consists
only of primitives copied from validated configuration and the decrypted job.
The final transaction binds the claim, reservation generation, token, digest and
stored idempotency key. Its successful commit is the network authorization point.
`CONTROL -> USER -> TOKEN -> OUTBOX` locks protect it. No DB transaction spans HTTP.

`dispatch_started_at` is irreversible through the application. A second process
cannot claim the item; start additionally requires a NULL marker. A paused worker
rejects a handoff older than 15 seconds. HTTP has a 10-second whole-exchange timeout,
no redirects, no retries and a 4096-byte response cap. `accepted` means provider
request acceptance, never inbox delivery. Ambiguous statuses, invalid responses,
exceptions and timeouts are `uncertain`.

OFF committed before the final authorization point blocks the attempt. OFF or
token revocation after it cannot atomically cancel an external HTTP operation.
There is no exactly-once delivery promise. A crash after start can lose a mail
without sending it; availability is deliberately sacrificed to prevent a repeat.
The historical claim-only finalizer has been removed from the runtime API.
Claiming, fencing or reservation alone cannot record a provider outcome through
that removed path. The only provider settlement API is the reserved finalizer,
which requires a committed start. Stale-claim recovery remains a distinct
accounting operation: it accepts no provider result and never sends or requeues.

## Crash recovery

`attempt_count` is the historical exclusive-claim counter, not proof of HTTP.
Public dispatch results distinguish `attempted=false`, `recorded`, and
`not_recorded`. A DB failure after an accepted response never permits another POST.
Abandoned timeout is five minutes, inclusive (`timestamp <= recovery cutoff`).
For an in-flight row without `dispatch_started_at`, age starts at `claimed_at`.
After a committed start, age starts at `dispatch_started_at` instead: an old claim
with a fresh start is not abandoned. Each recovery invocation fixes its cutoff
once to application time minus five minutes. Both the candidate SELECT and the
conditional UPDATE apply the same predicate to live database columns; after
waiting for CONTROL -> USER -> TOKEN -> OUTBOX locks, a freshly committed start
therefore prevents terminalization. A row crossing the cutoff after discovery
may wait until a later worker tick. The next worker ticks terminalize abandoned
rows as uncertain, without HTTP or requeue, even if the operator DB gate is OFF. If the
whole worker is disabled, recovery resumes when it is explicitly re-enabled;
an operator can also invoke the internal recovery function in a reviewed tool.
An already committed terminal outcome is left intact. No secrets, provider bodies,
codes, emails or message content are logged by dispatch.

### Recovery decision: no automatic pre-start requeue

The conservative policy also applies when `dispatch_started_at IS NULL`.
Consequently an eligible email can be lost after claim/fence/reservation and
BEFORE any HTTP, not only after start. The NULL marker makes that case observable
but does not currently grant retry authority. A regression test pauses the old
worker after reservation, recovers its stale claim as uncertain, then resumes it:
the worker performs zero HTTP and the job stays terminal.

Technically, a different protocol could recycle only a NULL-start row while
holding the same CONTROL/USER/TOKEN/OUTBOX locks, recheck NULL inside UPDATE,
atomically clear all claim/fence/reservation fields, and create a fresh ownership
epoch. Every old-worker path would need an exact old-claim/epoch check before
start. If start wins the row lock first, recycling must refuse; if recycling
wins, the old worker's subsequent start must refuse. A standalone lease check,
an unlocked NULL check or clearing fields in separate transactions is insufficient.

That transition contradicts the existing explicit `in_flight` never-to-READY
policy and its protective contracts (`auth-r1c2a-recovery-outbox-policy.test.mjs`).
It is NOT implemented or claimed production-proven here. Adopting it requires a
separate policy decision, ownership-history design and cross-process race tests.
The current no-requeue implementation and historical policy tests are retained.

## Server configuration (names only)

All switches default to OFF. Configure the app service through protected server
environment storage; Compose forwards these names and defaults switches to false.

| Setting | Purpose |
| --- | --- |
| `COMIC_DIARY_PUBLIC_ORIGIN` | Canonical deployment HTTPS origin |
| `AUTH_RECOVERY_PUBLIC_ORIGIN` | Must equal the deployment origin |
| `AUTH_RECOVERY_FROM_ADDRESS`, `AUTH_RECOVERY_SENDER_DOMAIN` | Exact From mailbox and matching verified domain |
| `RESEND_API_KEY` | Real send-only server secret, no fallback |
| `PASSWORD_RESET_OUTBOX_KEY_ID` | Stable encryption-key identifier |
| `PASSWORD_RESET_OUTBOX_KEY_BASE64` | Independently generated 32-byte AES key in canonical base64 |
| `AUTH_RECOVERY_RESEND_CONFIG_READY` | Explicit configuration preflight opt-in |
| `AUTH_RECOVERY_SENDER_VERIFIED` | Operator declaration AFTER verifying domain/sender in Resend |
| `AUTH_RECOVERY_DISPATCH_ENABLED` | Explicit network opt-in |
| `AUTH_RECOVERY_WORKER_ENABLED` | Explicit worker startup opt-in |
| `PASSWORD_RESET_REQUEST_ENABLED`, `PASSWORD_RESET_REQUEST_MAIL_READY` | Public request opt-ins |
| `PASSWORD_RESET_REDEEM_ENABLED` | Mandatory for dispatcher readiness and operator ON, as well as redemption |

Syntax validation is not DNS proof. A real Resend key, provider-verified sender,
complete configuration and PostgreSQL gate are all required for live acceptance.
Do not enable public requests without the worker. Never use `NEXT_PUBLIC_` for
secrets. Existing C5 test adapter remains isolated and is not used by production.

Retain the AES key until its queued jobs have expired or settled. To rotate the
single active key, disable requests, drain/expire old jobs for at least their
20-minute TTL, recover abandoned work, then replace key ID and secret together.
Do not silently substitute a key for an existing identifier.

## Explicit future operator procedure (NOT executed)

| Phase | Redemption | Worker | Dispatch runtime | PostgreSQL gate | Public request flags |
| --- | --- | --- | --- | --- | --- |
| Default | OFF | OFF | OFF | OFF | both OFF |
| Prepared runtime | ON | ON | ON, complete sender/secrets | OFF | both OFF |
| Explicit network permission | ON | ON | ON | ON | both OFF |
| Public operation | ON | ON | ON | ON | both ON |

This table describes a future approved launch, not current production settings.

1. Review/approve/release the local change, apply additive migrations through 0044
   using the ordinary controlled release procedure. Existing migrations are intact.
2. Use the owner's already verified `dracoteka.com` sender domain and existing
   send-only Resend key, prepared on the VPS; do not create a replacement key.
   Confirm website HTTPS/public origin separately, and provision a separate AES
   outbox key through protected server configuration. See `deploy/README.md` for
   Compose interpolation and deploy-gate preservation requirements. No secret
   file is opened or configured by this documentation change.
3. **Prepare redemption and worker, keep public requests OFF.** Inject secrets,
   sender/origin settings; set `PASSWORD_RESET_REDEEM_ENABLED=true`,
   `AUTH_RECOVERY_RESEND_CONFIG_READY=true`, `AUTH_RECOVERY_SENDER_VERIFIED=true`,
   `AUTH_RECOVERY_DISPATCH_ENABLED=true`, `AUTH_RECOVERY_WORKER_ENABLED=true`.
   Keep BOTH `PASSWORD_RESET_REQUEST_ENABLED=false` and
   `PASSWORD_RESET_REQUEST_MAIL_READY=false`. Restart the app. The worker is
   registered and can inspect readiness, but the persisted gate still defaults
   OFF and blocks new network attempts. Environment changes require a restart;
   DB gate transitions do not. Redemption OFF disables claiming/sending even if
   dispatch is configured, and the operator ON command refuses it.
4. **Explicitly enable the persisted gate.** Confirm worker/runtime readiness
   and review any pre-existing READY backlog with approved operator tooling:
   gate ON can drain it immediately, even while public requests remain OFF.
   Read `node scripts/auth-recovery-control.mjs status` inside the app container.
   Enable once with `node scripts/auth-recovery-control.mjs on GENERATION` using
   that exact generation. The script is included in the runtime image, is never
   called automatically and performs no HTTP. A stale generation is refused.
5. **Enable public requests last.** Only after worker readiness AND successful
   persisted gate ON, set BOTH request flags to true and restart the app, retaining
   redemption/worker/dispatch settings. Then perform the separately approved
   controlled-mail acceptance, manual inbox confirmation, redeem and session checks.
6. **Emergency stop:** `... off CURRENT_GENERATION` blocks new authorizations
   immediately; then disable both request flags and restart the app. A prior
   authorization/external operation cannot be cancelled atomically. For planned
   draining, disable public request flags/restart first while leaving worker and
   redemption enabled, then switch the DB gate OFF when draining is complete.

If request flags remain ON while the DB gate is OFF, the public request endpoint
does NOT treat gate OFF as a provider-readiness failure. Eligible requests still
create READY encrypted jobs and every valid address gets the generic 202 reply;
no HTTP is performed by dispatch. Jobs may expire while paused; enabling the gate
can send only those still valid after locked preflight. The UI can remain visible
until request flags are disabled and the app restarted. Do not interpret 202 as
delivery or as proof the gate is ON. This behavior is covered by integration tests.

No source rewrite is needed for these settings. Key injection, domain purchase,
release, migrations on production and the real-mail test require separate approval.

## Reproducible verification

Unit/structural tests: `node --import tsx --test src/modules/auth/*.test.ts`,
`node --test scripts/auth-*.test.mjs`. All source-contract assertions are retained;
Windows-only path/EOL handling is normalized without changing expected content.

Integration: migrate a fresh disposable PostgreSQL, then set
`AUTH01_DISPATCH_TEST_DATABASE_URL` and run
`node --import tsx --test scripts/auth-dispatch-integration.test.ts`.
The suite permits only the exact local QA target on port 55491 or the repository's
disposable GitHub CI database. It blocks unmocked fetch, uses synthetic credentials,
tests a real loopback mock HTTP server, and cleans its account/diary fixtures.
CI runs it on PostgreSQL 17. Local QA can use the installed PostgreSQL 18.

Browser acceptance: `scripts/auth-recovery-browser.mjs`, localhost 3108/3109 only,
three themes and widths 320/1440; request success/429/503/offline, code entry and
password-change success. Every auth POST is mocked. The persisted gate must be OFF
and no READY outbox may exist. Images/manifests are saved under ignored `.qa/`.

Also run typecheck, lint, production build and repeat migration. No real key,
sender domain, production database or email is used in these checks.

## Dependency release gate

The unchanged baseline lockfile currently produces three production alerts from
`npm audit --omit=dev`: `next` critical, `sharp` high and `source-map-js` high.
These are registry advisory results, not proof that every affected feature is used
by this app. This AUTH-01 change does not update dependencies or run audit fix.
Review and remediate them before a live/public release; green functional tests do
not close dependency advisories. The local report is `.qa/dependency-audit.json`.

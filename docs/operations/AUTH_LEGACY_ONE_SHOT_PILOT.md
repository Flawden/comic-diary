# One-shot legacy email verification pilot

Local implementation based on `ca60fb2b25f83ee1b5698c5ae3eb06865806a882`.
This document does not authorize production SQL, deployment, enabling flags, or mail.
The existing legacy verification runbook remains the authority for prerequisites.

## Durable policy

Migration 0048 adds six nullable fields to the existing activation CONTROL row.
No separate dispatcher, queue, bearer authorization, or retry path is introduced.
An unarmed row (all pilot fields NULL) retains existing general activation behavior.
An armed row restricts dispatch to user 1, purpose `legacy_email_verification`, and
one pinned outbox ID. This is an explicit operational mode, not enabled by default.

Extending CONTROL avoids introducing a second policy lock into every dispatch.
Issuance and start acquire CONTROL FOR UPDATE at entry; neither upgrades SHARE.
Claim/recovery acquire CONTROL FOR SHARE before USER. Request then locks USER,
SESSION, TOKEN, OUTBOX. Paths without a session omit SESSION. Updating CONTROL
again after OUTBOX is a write through an already held exclusive lock, not a new
acquisition. Existing finalizers retain their lock sequence and settle committed
starts even after OFF or pilot close.

The pin is committed with challenge/outbox issuance. Dispatch budget is consumed
with `dispatch_started_at` in the same transaction. HTTP follows only successful
transaction acknowledgement. Lost acknowledgement can sacrifice delivery; it
never authorizes another POST. Rejected/uncertain outcomes and abandoned jobs are
terminal. There is no refund, requeue, or recovery of a lost pilot opportunity.

An UPDATE trigger makes non-NULL pilot identity, pin, used timestamp and closed
timestamp immutable. The outbox pin intentionally has no FK: deleting a job must
not erase its tombstone. Direct privileged deletion/restoration of CONTROL is
outside the application threat model. No operator command resets or rearms it.

## Operator interface (future separately approved rollout only)

Inside the app image, with existing protected configuration supplied normally:

```
node scripts/auth-activation-pilot-control.mjs status
node scripts/auth-activation-pilot-control.mjs arm EXPECTED_GENERATION
node scripts/auth-activation-pilot-control.mjs close EXPECTED_GENERATION
```

`arm` requires activation gate OFF at the supplied generation, no existing pilot,
all 16 AUTH switches OFF, recovery gate OFF, eligible
user 1, and empty READY/IN_FLIGHT queues. It creates a random pilot UUID and fixes
user 1. It does not change gates or generation. `close` requires activation OFF
at the exact generation and permanently closes the existing pilot. `status` is
read-only and prints no email, payload, credentials, or session secret.

All 16 switches are checked independently, even if another switch would currently
prevent runtime sending. Runtime enables them only for the exact string `true`;
absence defaults to OFF. Arming accepts only absence or the exact string `false`.
Empty strings, uppercase spellings, whitespace, `0`/`1`, and unknown values are
refused without echoing configuration values. Pass the app's effective environment
to the CLI; an incomplete environment cannot prove the configuration of a different
running app. Do not supply a sanitized or artificial OFF environment in production.

The checked switches are:

```
PASSWORD_RESET_REQUEST_ENABLED
PASSWORD_RESET_REQUEST_MAIL_READY
PASSWORD_RESET_REDEEM_ENABLED
AUTH_RECOVERY_WORKER_ENABLED
AUTH_RECOVERY_DISPATCH_ENABLED
AUTH_RECOVERY_SENDER_VERIFIED
AUTH_RECOVERY_RESEND_CONFIG_READY
REGISTRATION_ENABLED
REGISTRATION_ACTIVATION_REDEEM_ENABLED
AUTH_ACTIVATION_RESEND_CONFIG_READY
AUTH_ACTIVATION_SENDER_VERIFIED
AUTH_ACTIVATION_DISPATCH_ENABLED
AUTH_ACTIVATION_WORKER_ENABLED
AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED
AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED
AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED
```

These checks apply at `arm` only. After a successful arm, separately approved
activation configuration can be enabled in the sequence below. They do not change
the runtime config parser, persisted gate, dispatch budget, or subsequent close.

`status` adds an `outbox` object from one read-only SQL snapshot:

- `pinned`: whether a durable outbox ID is assigned.
- `exists`: whether that exact outbox row exists.
- `state`: the existing lifecycle state, or NULL when absent.
- `dispatchStarted` and `finalized`: boolean presence markers, never job timestamps.

`pinned=false,exists=false` means no job has been assigned.
`pinned=true,exists=false` means the pinned row is unexpectedly missing: stop and
investigate; do not clear the pin or retry. Other job fields are never selected.
`close` warns after successful commit if start was already committed (including
when the spent budget survives a missing job). HTTP may still complete and its
outcome may still settle. This warning does not cancel or refund the attempt.

Before any future activation, use a homogeneous version with 0048 support and all
workers OFF. Arm and verify durable state FIRST. Keep recovery and registration
OFF throughout this activation pilot. Prepare sender/encryption/readiness while
intake is OFF; enable legacy redemption, activation operational configuration and
worker according to the existing runbook; enable persisted activation gate next;
enable legacy request intake LAST. These are separate authorized operator actions,
not commands executed by this implementation. The account authenticates through
its existing session and current password on request and redemption.

All other activation jobs are filtered before claim LIMIT and rechecked under
CONTROL at start. Recovery likewise leaves unrelated IN_FLIGHT jobs untouched.
Other users cannot create pilot legacy jobs. Pending registration retains its
normal issuer but its jobs cannot be dispatched while the pilot exists.

After the single attempt: disable request intake, turn activation gate OFF using
its normal audited operator API, stop the worker by the approved configuration
procedure, inspect status/outcome, then close. A committed start can still perform
its one HTTP exchange after OFF/close; wait for settlement or terminal recovery.
Never retry on uncertainty. Redemption can remain available for the issued code
under its existing expiry/password/session rules.

## Compatibility, stop conditions, rollback

Changing generation, flags, worker process, or ON/OFF never clears the budget.
Closing does NOT restore general sending, even if the gate is later ON. General
release after the pilot requires a separately reviewed policy change; do not clear
pilot fields manually. An unarmed installation retains existing normal behavior.

Abort rollout if identity, queue emptiness, generation, key readiness, mixed worker
versions, or sender prerequisites differ from the approved state. A consumed
budget with no delivered email is an expected fail-closed outcome, not permission
to rearm. Recovery worker isolation remains an operator prerequisite; this pilot
does not change the separate password recovery dispatcher.

Application rollback to a pre-pilot image is permitted only with ALL AUTH OFF and
gates OFF: old code does not enforce pilot restrictions. Preserve schema 0048 and
the durable pilot tombstone; do not reverse migrations or restore the DB merely
to retry mail. Local tests cannot prove actual provider delivery or production
permissions. Those need a separate approval and controlled rollout.

## Verification

CI runs the pure policy/schema contracts and PostgreSQL 17 upgrade, concurrency,
HTTP boundary and fault-injection tests. The PG suite uses synthetic users/keys,
mock transport and disposable DB guards. It covers request/worker races, forbidden
identity/purpose/job substitutions, replay, all three provider classifications,
crashes before/after start and HTTP, lost commit acknowledgements, new Node worker,
generation/flag changes, close versus blocked start, pending preservation,
enqueue/start rollback, code redemption, password/session preservation, and
write-once constraints. Existing activation, legacy, recovery and purpose tests
remain mandatory. No real Resend requests are needed.

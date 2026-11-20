# AUTH-01 independent review — Round 2

Worktree: `C:\Users\Atell\IdeaProjects\comic-diary-auth01-nightshift`.
Branch: `codex/auth01-dispatch-nightshift-20261118`.
Unchanged HEAD: `96987060cbfe1f12cab2971ec78ab0b2ed8a56d7`.
Review baseline: `AUTH01-NIGHTSHIFT-REVIEW-20261119-045400.zip`.
This report supersedes the corresponding Round 1 finalizer/readiness statements.

## Findings and fixes

Both mandatory findings were valid defects in the first implementation.

**A — started reservation required.** The reserved finalizer now rejects all
provider classifications unless the locked row contains `dispatchStartedAt`.
The exact SQL UPDATE also includes `dispatch_started_at IS NOT NULL`, alongside
the original claim, generation, state, attempt-count and reservation conditions.
Finalization after OFF remains possible for a previously started attempt.

Three behavioral PostgreSQL tests pause the real dispatcher after reservation
but before start, attempt accepted/rejected/uncertain settlement, and verify the
entire row is unchanged, still in_flight, with zero HTTP. After resumption the
real committed start and normal mock HTTP/settlement succeed. Existing positive
rejected/uncertain cases also run through the real start boundary.

**B — redemption readiness required.** Dispatcher `readConfig()` now requires
`PASSWORD_RESET_REDEEM_ENABLED === "true"`. The explicit operator ON command
requires it too. A behavioral test verifies OFF/unexpected values preserve READY,
cause zero HTTP, refuse operator ON and leave the DB gate/generation unchanged.

Claim/finalizer comments now describe their actual integration. No dependency
upgrade or historical policy relaxation was performed.

## Necessary CI probe maintenance

The older C4 PostgreSQL probe previously simulated only reservation and would
incorrectly fail its positive settlement cases after this fix. It now first
asserts all pre-start outcomes are blocked, then commits a start-marker fixture
before its original positive/competition/OFF cases. It never sends HTTP.
Original assertions and its exact disposable GitHub CI guard remain intact.

The C4 source contract gained an additional guard for the in-memory AND SQL start
conditions. The new behavior tests are in `auth-dispatch-integration.test.ts`,
already invoked in the PostgreSQL CI job without name filters. The workflow also
invokes the C4 source contract. `evidence/ci-wiring.log` verifies those entries.
No remote GitHub run was triggered: push remains forbidden. The older exact-CI
probe itself was not run locally by impersonating GitHub Actions; the actual
dispatcher behavior is covered by the local PG17/PG18 suite.

## Recovery decision and limitation

No automatic in_flight -> READY transition was added. The existing outbox policy
and protective tests explicitly prohibit re-claim/requeue of in_flight work.
`recoverAbandonedPasswordResetDispatches()` still terminalizes old claims as
uncertain, including NULL-start claims. This can lose an email BEFORE any HTTP,
for example after a crash immediately after claim or reservation.

The new stale-worker test pauses after reservation, ages/reconciles that claim
as uncertain, then resumes the old worker: it cannot start or send, and a second
worker does not reclaim the job. This demonstrates the current conservative
policy, not a proposed requeue protocol.

A NULL-start-only retry protocol is technically plausible with atomic locked
reset, a fresh ownership epoch and exact stale-claim checks on every path. Start
and recovery would have to serialize: start wins -> never reset; reset wins ->
old start refuses. Ownership history/attempt-count semantics and cross-process
race coverage would also need redesign. It contradicts the agreed no-requeue
policy, so it requires a separate explicit decision and is not presented as a
completed or proven alternative. Detailed reasoning is in the updated runbook.

## Operator sequence clarified

1. Keep both public request flags OFF while preparing verified sender settings
   and secrets. Enable redemption, dispatch runtime and worker; restart the app.
2. Confirm runtime/worker readiness; review any READY backlog. Explicitly enable
   the persisted DB gate with its current generation. It may drain that backlog.
3. Enable BOTH public request flags last and restart; keep redemption available.
4. For emergency stop, turn the DB gate OFF immediately, then disable requests
   and restart. A prior authorized operation cannot be atomically cancelled.

If request flags remain ON while the DB gate is OFF, eligible requests still
enqueue READY jobs and receive the generic 202 response. No new HTTP starts;
jobs can expire during the pause. The UI stays visible until flags are disabled
and the app restarted. A new integration test records this exact behavior.

## Local verification

| Check | Round 2 result |
| --- | --- |
| Auth unit tests | 199/199 PASS |
| Auth source contracts | 326/326 PASS |
| Integration on PostgreSQL 18.1 | 47/47 PASS |
| Integration on PostgreSQL 17.11 | 47/47 PASS |
| Repeated migrations on both temporary databases | PASS |
| Browser enabled/mock | 6/6 combinations, three themes x 320/1440 |
| Browser disabled | 6/6 combinations |
| Browser errors | 429/503/offline checked in every enabled combination |
| Typecheck, lint, Next production build | PASS |
| Docker build and runtime OFF smoke, network=none | PASS |
| Workflow parse and new-test wiring | PASS |
| Dependency audit | 3 affected production packages; not remediated |

Full TAP/build/migration/browser outputs, manifests and package/advisory metadata
are in the review bundle's `evidence/` directory. Every browser auth POST was
mocked; the QA server blocks server-side fetch before Next instrumentation.
There were no real API requests to Resend and no real email deliveries.

## Dependency evidence, without upgrades

| Package | Installed and locked | npm audit aggregate affected range | Published fix candidate |
| --- | --- | --- | --- |
| next | 16.3.3 | 16.0.0 - 16.4.4 | 16.4.6 |
| sharp | 0.35.4 | <0.35.5 | 0.35.5 |
| source-map-js | 1.2.1 | 1.0.0 - 1.2.1 | 1.2.2 |

The complete `npm audit --omit=dev --json` is included unchanged. The package
versions were read from installed files and compared with package-lock. All 15
advisory IDs, per-advisory affected ranges and first-patched branches were read
from GitHub Advisory metadata; the candidate versions were verified as published
through npm registry metadata, without installing them. See
`evidence/dependency-summary.md` and `dependency-advisories.json` for exact sources.
Next 16.4.6 is the audit-recommended candidate covering the reported set, not the
first patch of every individual advisory. This is not an exploitability review.

## Review artifacts and remaining risks

The new archive contains current source including all AUTH modules (also the
unchanged ones), DB index/schema, required source context, migrations, tests,
configuration, reports, full evidence, a file/hash manifest, full HEAD diff and
a separate Round 2 diff against the reviewed archive. Its README distinguishes
changed source from unchanged context. It is a review supplement to the fixed
Git checkpoint, not a standalone checkout with all binary UI assets/dependencies.

No .env files, installed dependencies, database files/dumps/rows, generated email
bodies, real keys or personal user records are included. Synthetic fixtures and
mail-template SOURCE code remain necessary review context. Browser screenshots
show blank request forms or cleared success forms, not codes or email contents.

Remaining release gates: independent review, the forbidden-until-approved
publication/deployment, dependency advisories, provider/domain/secret setup and
controlled real-mail acceptance. At-most-once availability tradeoffs, including
pre-HTTP loss, remain explicit. Neither this round nor green tests proves inbox
delivery or closes unrelated legacy email-verification policy.

## Round 2 source changes

- `src/modules/auth/password-reset-request-outbox-finalize-reserved.ts` — mandatory start, SQL predicate, comments.
- `src/modules/auth/password-reset-dispatch.ts` — redemption readiness and explicit recovery limitation.
- `scripts/auth-recovery-control.mjs` — refuse ON without redemption.
- `src/modules/auth/password-reset-request-outbox-claim.ts` — accurate integration comments.
- `scripts/auth-dispatch-integration.test.ts` — six additional behavioral cases.
- `scripts/auth-r1c2c4-outcome-contract.test.mjs` — additional SQL/start/CI assertion.
- `scripts/auth-r1c2c4-recovery-finalize-pg-probe.ts` — required start fixtures, stronger negatives.
- `docs/operations/auth01-integrated-dispatch.md` — phased launch, gate-OFF behavior, recovery rationale.
- This report.

No commit, push, merge, deploy, production SQL, real Resend request or dependency
upgrade was performed. All changes remain local in the existing isolated branch.

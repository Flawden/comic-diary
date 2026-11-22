# Closed beta release — 22 November 2026

Release target: 25 November, invitation-only. This dated acceptance record
supersedes the October readiness index for the areas below; it does not turn
the personal project idea notebook into release requirements.

## Verified live baseline

- Base deployed commit: `c83f8d0850efb83500b69a633fceba85c4bac916`.
- PostgreSQL 17, journal 52, last migration `0051_beta_registration_invitations`.
- Owner separately approved activation preparation, gate transition and intake.
  Activation gate is ON generation 3; recovery remains ON generation 1.
- All seven recovery flags remain true. Activation worker/config/operator/redeem
  flags and both beta invitation flags are true. Legacy verified-status support
  remains true. Public `REGISTRATION_ENABLED` and legacy request intake remain false.
- Legacy pilot stays closed, pinned to outbox 1, with its dispatch budget spent.
  Invitation dispatch uses its existing separate allowance, not a reset pilot.
- First real invitation: owner completed mailbox verification and reported entry.
  Read-only server evidence: invitation 1 activated, user 6 active/verified USER,
  one invitation-bound pending-activation job accepted and finalized. No extra
  real test messages are required for the UX follow-up.
- Scheduled server backup completed successfully on 22 November at
  `00:18:57.461893Z`. Repository backup script matches canonical Git bytes.
  Windows off-host task last result 0; latest local copy's manifest, sizes and
  SHA-256 checks passed and its age was less than 36 hours.

## Follow-up behavior

Invitation registration first asks only for the invited email and requests a
code. At the second step, the mailbox owner supplies the code and chooses the
password once with confirmation. Until then the pending account has an
unshared random Argon2id credential and cannot log in. Redeem replaces it.
The older `register` request remains supported for already-open pages.
The new strict `request` body accepts only intent, invitation and email.

Creation, invitation binding and encrypted outbox remain in the existing
transaction and lock order. Register/request replay never resends or replaces
the pending credential. Resend is explicit and retains existing limits,
expiry/revoke enforcement and token invalidation. No new migration, queue,
dispatcher, configuration flag or recovery change is introduced.

Unread confirmation distinguishes the diary rating from an independent public
rating. Removing a work from the library reports an unknown outcome after a
lost response and asks for refresh; it does not blindly retry a mutation.

## Acceptance

- 332 source unit tests passed; typecheck, ESLint and production build passed.
- 22 invitation PostgreSQL integration tests passed, including email-first
  concurrency, replay, foreign email/account-ID injection, activation credential
  replacement, existing expiry/revoke/fault and closed-pilot contracts.
- Real local API browser acceptance passed in Tea 1440, Paper 390 and Night 320:
  ADMIN-only invitations, public registration closed, email-only first step,
  pending login denied, code/password activation and subsequent login.
  Provider HTTP was blocked; synthetic credentials only.
- Additional two-account browser acceptance passed in all three themes/widths:
  unread cancel/confirm, public vote preservation, private-rating deletion,
  other-user isolation, removal failure, committed removal with response lost,
  re-add with diary/history preserved. No external requests or page errors.
- Full remote CI, Docker acceptance and post-deploy evidence belong to the PR
  and deployment run; their results must be checked before declaring release.

## Boundaries and operator actions

- Do not open public registration for the closed beta. ADMIN creates individual
  email-bound links; the link is shown once and must be sent privately.
- Opening a link spends nothing. Pending registration can resume using the same
  valid invitation; revoke/expiry stops activation and further dispatch. Already
  activated accounts retain access. Invitations do not change existing users.
- Existing recovery remains available; no keys, senders or recovery flags change
  for this release. Do not reset the legacy pilot or its budget.
- Missing editorial pages/minutes/age/genres remain missing, not guessed values.
  Editors must check actual chapter links and metadata for their release titles.
  External reader behavior is outside this app's control.
- Server and off-host backups are verified; this audit does not claim a new full
  off-host DB/media restore drill. Previous migration 0051 restore and old-image
  compatibility evidence remains separate from this no-migration follow-up.
- Rollback to an image older than invitation support requires disabling
  activation redeem as well as invitation intake/dispatch and the activation
  gate: old redeem code cannot enforce invitation revoke/expiry. Never execute
  rollback, down migration or DB restore automatically after deployment failure.
- Avatars, payment/donor roles, a hosted reader and page comments remain future
  work. Existing chapter art stays centered; this change does not restyle it.

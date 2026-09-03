# R6.5B Ephemeral Role Matrix Proof

Status: **CLOSED / PASS**

Baseline application SHA:

`79c1e5572ae16b4c2fe908b4ecb257d84c895632`

Evidence log SHA256:

`344b08b85d43d4d38b585663ddc341372dc717a1a099f016886f02381662ff5d`

The complete proof log is operator-local and is not committed. This document records only the sanitized closure evidence.

## Execution model

R6.5B used disposable infrastructure derived from the exact production application image while keeping production immutable.

The proof created an isolated Docker network, an isolated PostgreSQL 17 database, and two disposable application instances. One application instance ran with the bulk-import feature gate enabled and the other with it disabled.

All ephemeral users, sessions, catalog data, personal library state, containers, database storage, and network resources were destroyed after the proof.

## Role matrix proved through HTTP

- Roles: `USER`, `EDITOR`, `ADMIN`.
- All three roles can use their own personal library.
- Personal library state is isolated by the authenticated session user id.
- Client-supplied `userId` cannot redirect a personal mutation to another account.
- `USER` cannot mutate the shared catalog.
- `EDITOR` can mutate the shared catalog.
- `EDITOR` cannot administer users.
- `EDITOR` cannot execute bulk import.
- `ADMIN` can cross the account-administration authorization boundary.
- `ADMIN` can cross the bulk-import authorization boundary only while the feature gate is enabled.
- Disabled bulk import returns the expected service-unavailable boundary.
- Cross-origin mutations are rejected.
- Sessions are stored as digests and are server-side revoked on logout.

## Isolation evidence

Two independent USER accounts wrote different private library state for the same disposable comic.

The HTTP views and database invariants proved that each account saw only its own personal state. A mutation from USER A containing USER B's id still modified USER A's session-bound row and left USER B unchanged.

## Production safety

Production was read only during this proof.

The production database fingerprint matched before and after execution, the deployed SHA remained `79c1e5572ae16b4c2fe908b4ecb257d84c895632`, and all disposable infrastructure was destroyed.

`PRODUCTION_WRITES=NONE`

`EPHEMERAL_FIXTURES=DESTROYED`

`R6_5B_ROLE_MATRIX_CLOSURE=PASS`

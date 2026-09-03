# R6.5 Remaining Role-Matrix Closure

## Purpose

The core production authentication path is closed with a real production ADMIN. The remaining R6.5 acceptance items must be closed **outside production** so that USER/EDITOR test accounts, test sessions, catalog fixtures and personal-library fixtures never pollute the live database.

This is evidence closure, not a redesign of the authorization model.

## Authority model under test

- **USER**: normal authenticated personal-library authority only.
- **EDITOR**: USER authority plus explicitly delegated shared-catalog create/update authority.
- **ADMIN**: USER + EDITOR authority plus account/security administration and explicitly authorized system operations.
- **Bulk import**: ADMIN-only and still independently guarded by `ADMIN_IMPORT_ENABLED`.
- All role checks remain server-side permission checks rather than UI-only or scattered role-name checks.

## Existing evidence to preserve

Previous R6 work already established substantial parts of the matrix:

- R6.3D3 ephemeral HTTP editor mutation proof passed: USER denied shared-catalog mutation, EDITOR create/update allowed, ADMIN create/update allowed, EDITOR bulk import denied, personal library rows unchanged and account authority unchanged.
- R6.4C ephemeral HTTP account-administration proof passed: USER and EDITOR denied ADMIN_USERS, ADMIN role/activation mutations allowed, target sessions revoked, and the last-active-ADMIN invariant held.
- R6.3D2 local authorization contract passed: anonymous/USER/EDITOR denied bulk import, ADMIN permitted by role boundary, and `ADMIN_IMPORT_ENABLED` retained as an independent kill switch. The earlier durable HTTP proof for this stage was interrupted, so the final R6.5 closure must freshly exercise this boundary in an ephemeral environment.

## Fresh non-production closure required

Run one isolated ephemeral integration environment with a fresh database and disposable USER, EDITOR and ADMIN accounts. It must prove, in one durable run:

1. **USER behavior**
   - normal authenticated USER access works;
   - USER may read/write only that USER's personal library;
   - USER cannot mutate shared catalog;
   - USER cannot access account/security administration;
   - USER cannot run bulk import.

2. **Personal-data isolation**
   - USER A cannot read or mutate USER B personal-library state;
   - EDITOR shared-catalog authority does not grant access to another user's private library;
   - denied requests produce zero personal-data mutation.

3. **EDITOR behavior**
   - EDITOR inherits normal USER capability;
   - EDITOR can create and update shared catalog content;
   - canonical validation/reference protections remain enforced;
   - EDITOR cannot access ADMIN_USERS or account/security operations;
   - EDITOR cannot run bulk import.

4. **ADMIN behavior**
   - ADMIN can perform the explicitly authorized account-administration path;
   - role/activation changes revoke target sessions where required;
   - last-active-ADMIN protection remains enforced;
   - ADMIN may reach the bulk-import authorization boundary only when the independent feature flag permits it.

5. **Bulk-import feature flag**
   - USER denied;
   - EDITOR denied;
   - ADMIN with `ADMIN_IMPORT_ENABLED=false` receives the disabled/kill-switch outcome;
   - ADMIN with `ADMIN_IMPORT_ENABLED=true` passes authorization into normal request validation/processing;
   - the proof does not need to perform a real external VK import to establish the authorization boundary.

6. **Request-boundary invariants**
   - anonymous requests rejected;
   - cross-origin mutation requests rejected;
   - authorization executes before mutation body processing where the current contract requires it;
   - rejected requests create no database mutation.

7. **Cleanup**
   - ephemeral app/database/network removed;
   - production network, application and database untouched;
   - `PRODUCTION_WRITES=NONE` for this closure stage.

## Existing probes to include

Where present on the checkpointed source tree, rerun the existing executable contracts rather than replacing them:

- `scripts/auth-permissions-probe.ts`
- `scripts/auth-personal-mutation-authorization-probe.ts`
- `scripts/auth-admin-import-authorization-probe.ts`
- `scripts/auth-shared-catalog-authorization-probe.ts`
- `scripts/auth-admin-account-http-authorization-probe.ts`

The integration proof remains authoritative for runtime behavior; static probes are supporting guards.

## Closure condition

R6.5 is fully closed only when both are true:

- `R6_5_CORE_PRODUCTION_PROOF=CLOSED`
- `R6_5_NON_PRODUCTION_ROLE_MATRIX=CLOSED`

No additional production role fixtures are required or permitted for this closure.

<!-- R6_5B_CLOSURE_BEGIN -->

## R6.5B execution closure

Status: **CLOSED / PASS**

Execution baseline: `79c1e5572ae16b4c2fe908b4ecb257d84c895632`

Ephemeral proof log SHA256: `344b08b85d43d4d38b585663ddc341372dc717a1a099f016886f02381662ff5d`

The originally pending non-production role-matrix closure has now been executed against isolated disposable infrastructure using the exact production application image.

Closure evidence:

- USER / EDITOR / ADMIN HTTP login and session identity: PASS
- personal library access for all roles: PASS
- USER A / USER B personal-state isolation: PASS
- client-supplied user id override: ignored
- EDITOR shared-catalog authority: PASS
- USER shared-catalog denial: PASS
- EDITOR account-administration denial: PASS
- EDITOR bulk-import denial: PASS
- ADMIN account-administration authorization: PASS
- ADMIN bulk import with feature flag enabled: PASS
- ADMIN bulk import with feature flag disabled: expected 503
- cross-origin mutation denial: PASS
- digest-only session storage: PASS
- logout / server-side session revocation: PASS
- ephemeral fixture teardown: PASS
- production database fingerprint unchanged: PASS
- production writes: NONE

`R6_5_NON_PRODUCTION_ROLE_MATRIX=CLOSED`

`R6_5=CLOSED`
<!-- R6_5B_CLOSURE_END -->

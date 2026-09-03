# R6.5 Production Authentication Proof

## Status

**CLOSED — core production authentication proof passed.**

Production source baseline used for the proof:

`17a39e30635b6bdd1137fb5341423064ddeded9c`

Evidence log SHA-256:

`f06fedc3160bfe40f3f8c7b80dbff65c5f199881aa433f2b2b0739b239f298a3`

The evidence log itself is intentionally not committed because it is an operator/runtime artifact. The committed record stores only non-secret acceptance facts and the evidence digest.

## Proven production behavior

The continuous production proof established all of the following on the exact baseline above:

- the production runtime matched the expected deployment SHA and bootstrap artifact;
- the database was pristine before bootstrap: zero users, zero active ADMIN accounts, zero sessions and zero personal-library rows;
- a pre-write production database backup was created before the bootstrap mutation;
- the first real production ADMIN was created through the operator-only bootstrap CLI;
- the permanent account stored an Argon2id password hash;
- an intentionally wrong password was rejected with no session creation;
- normal login succeeded for the production ADMIN;
- the session cookie was HttpOnly, Secure and SameSite=Lax;
- only a SHA-256 digest of the session token was persisted server-side;
- the authenticated ADMIN could enter the protected library;
- the ADMIN_USERS permission boundary accepted the authenticated ADMIN without performing an account mutation;
- anonymous ADMIN_USERS access was rejected;
- cross-origin ADMIN_USERS access was rejected;
- logout removed the server-side session;
- the stale cookie was rejected after logout;
- final database state contained exactly one active ADMIN, zero sessions and zero user-comics rows;
- no USER/EDITOR test fixtures and no library test fixtures were created in production.

## Production mutation accounting

Permanent production write:

- first real ADMIN account.

Ephemeral production write:

- one login session, subsequently revoked by normal logout.

No role-matrix fixtures were created in production.

## Acceptance markers

`PRODUCTION_ADMIN=CREATED_AND_VERIFIED`  
`PASSWORD_STORAGE=ARGON2ID_ONLY`  
`NORMAL_LOGIN=PASS`  
`SESSION_COOKIE=HTTPONLY_SECURE`  
`SESSION_STORAGE=DIGEST_ONLY`  
`ADMIN_USERS_AUTHORIZATION=PASS_NON_MUTATING`  
`LOGOUT_SERVER_REVOCATION=PASS`  
`FINAL_ACTIVE_ADMINS=1`  
`FINAL_SESSIONS=0`  
`TEST_FIXTURES=NONE`  
`R6_5_CORE_PRODUCTION_PROOF=CLOSED`

## Security note

The raw production ADMIN password is not part of this record and must never be committed or copied into project logs. The production ADMIN email is also intentionally omitted from this committed evidence record.

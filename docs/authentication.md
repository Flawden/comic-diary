# Comic Diary Authentication

## R6 direction

Comic Diary uses the existing `users` table as the canonical identity record.

Authentication must not introduce a parallel account table because
`user_comics` already references `users.id` and contains the reader's durable
progress, ratings and personal notes.

The initial role model intentionally contains only:

- `USER`;
- `ADMIN`.

`ADMIN` is a normal user with all USER capabilities plus explicitly authorized
administrative capabilities.

The architecture may be extended later, but R6 must not introduce role
proliferation without a concrete requirement.

## R6.1 data model

R6.1 extends the existing `users` table additively with:

- `password_hash`;
- `role`;
- `is_active`.

Existing rows default to:

- role `USER`;
- active `true`;
- no password hash.

`password_hash` is deliberately nullable during migration because the existing
development reader predates authentication.

R6.2 will define the password-account creation and login contract. Passwords
must never be stored directly and must not use a general-purpose fast hash such
as SHA-256. The intended password KDF is Argon2id or an equivalent dedicated
password hashing algorithm.

## Sessions

Authenticated browser sessions use an opaque, high-entropy random token.

The raw token belongs only in the browser cookie.

PostgreSQL stores only a SHA-256 digest of the random token in `sessions`.

The session record contains:

- user ID;
- token hash;
- expiry time;
- creation time;
- last-seen time.

Session deletion is safe and does not delete the user. Deleting a user cascades
their sessions.

The browser cookie contract for R6.2 should use:

- `HttpOnly`;
- `Secure` in production;
- `SameSite=Lax`;
- an explicit expiry/max age;
- a narrow application-owned cookie name.

Authentication secrets must never use localStorage.

## Authorization

Authentication and authorization are separate responsibilities.

A valid session identifies a user.

Privileged server actions must additionally verify:

- the user still exists;
- `is_active = true`;
- the required role or permission.

Hiding an ADMIN button in the browser is only UX and is never an authorization
boundary.

The existing catalog import feature flag remains independent:

`ADMIN` role AND `ADMIN_IMPORT_ENABLED=true`

are both required before production catalog import may become available.

The feature flag remains a kill switch after the temporary R5 admin-import
secret is removed.

## Migration compatibility

R6 must preserve the existing reader identity and all `user_comics` rows.

R6.1 therefore performs only additive authentication schema changes.

No R6.1 migration may:

- recreate the users table;
- replace user IDs;
- delete users;
- delete `user_comics`;
- rewrite reading progress;
- rewrite ratings;
- rewrite personal notes.

## Stage boundaries

R6.1 provides the database model only.

It does not yet:

- authenticate requests;
- create password accounts;
- issue real login sessions;
- replace `DEV_USER_EMAIL`;
- authorize ADMIN routes;
- remove the temporary admin-import gate.

Those changes belong to R6.2-R6.5 and must be introduced behind explicit
server-side boundaries.

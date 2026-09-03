# R7.2B — account page and self-service password change

## Scope

R7.2B adds the minimum safe self-service account surface:

- authenticated `/account`;
- read-only display of the current account email, display name, and role;
- same-origin password change at `POST /api/account/password`;
- current-password reauthentication;
- the same new-password policy already used by public registration;
- Argon2id password hashing through the existing password helper;
- shared persistent rate limiting for password-change attempts;
- atomic password update, revoke-all old sessions, and replacement current session.

R7.2B deliberately does **not** add:

- public forgot/reset-password email recovery;
- email change;
- role or activation controls;
- arbitrary target-user IDs;
- a new account/session table;
- a schema migration.

## Authorization

`/account` resolves the existing server-side authenticated user.

Anonymous requests are redirected to:

`/login?next=%2Faccount`

The password API derives the target account only from `getCurrentUser()`.
The request body cannot select another user and cannot change email, role,
activation state, or any other authority-bearing field.

## Mutation boundary

The API accepts exactly:

- `currentPassword`
- `newPassword`
- `newPasswordConfirm`

Same-origin is required before processing the mutation.

The request is JSON-only and bounded to 16 KiB.

## Password policy

The new password reuses `isRegistrationPasswordAllowed()`:

- at least 10 characters;
- not whitespace-only;
- at most 256 UTF-8 bytes.

Hashing uses the existing Argon2id helper.

The new password must differ from the current password.

## Current-password rate limit

Valid password-change requests consume a shared PostgreSQL bucket:

- scope: `account-password-user-v1`
- identity: authenticated server-side user ID
- maximum: 10 attempts
- window: 15 minutes

The generic limiter persists only a SHA-256 key. The raw identity is not
stored in `auth_rate_limits`.

Limiter backend failure is fail-closed with HTTP 503.

Blocked requests return HTTP 429 and `Retry-After`.

## Atomic session rotation

`changeOwnPassword()` runs a single PostgreSQL transaction.

Inside the transaction it:

1. locks the active user row with `FOR UPDATE`;
2. verifies the current Argon2id password;
3. rejects unchanged/weak new passwords;
4. hashes and updates the new password;
5. deletes every existing session for that user;
6. creates one fresh high-entropy session token;
7. persists only the SHA-256 token digest.

If any write in the transaction fails, PostgreSQL rolls the whole mutation
back. The route sets the fresh raw token only in the browser cookie after
the transaction succeeds.

Therefore the successful state is never "new password but no replacement
session because a later database insert failed".

## Deferred work

Public password recovery remains deferred until Comic Diary has a real
mail/recovery-token model with expiry, one-time digests, anti-enumeration,
and rate limiting.

Email change remains deferred until an email-verification model exists.

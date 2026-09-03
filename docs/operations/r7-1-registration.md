# R7.1 Public Registration

Status: implementation candidate / local proof required.

## Scope

R7.1 introduces public self-service account creation through:

- `/register`
- `POST /api/auth/register`

No database migration is required. The existing `users` table already provides a unique email, nullable display name, password hash, `USER` default role, active state, and timestamps.

## Security contract

Public registration:

- always creates an active `USER`;
- never accepts a role, active-state, user-id, or other privileged identity selector from the client;
- normalizes email through the same identifier function used by login;
- rejects an already existing email regardless of whether that account is active or inactive;
- keeps the database unique constraint as the race-safe duplicate authority;
- hashes passwords through the established Argon2id helper;
- requires same-origin mutation requests;
- applies JSON and request-size boundaries before account creation;
- reuses the established R6 session and cookie stack for automatic login;
- never introduces a second session token or cookie type.

## Password policy

New public accounts require at least 10 characters and at most 256 UTF-8 bytes. The underlying R6 password hashing helper remains the final hashing authority.

Passwords are never normalized before hashing.

## Successful registration

A successful request returns HTTP `201`, creates exactly one active `USER`, creates a standard Comic Diary session, sets the existing `comic_diary_session` cookie, and returns the non-secret user identity.

The default UI redirect is `/library` unless a safe `next` path is supplied.

## Existing or inactive email

Public registration never overwrites, reactivates, or changes an existing account.

An existing email returns controlled `409 email_unavailable`.

## Anti-abuse / shared registration rate limit

R7.1B protects public registration with a PostgreSQL-backed fixed-window limiter.

Registration policy:

- 10 same-origin registration POST requests per trusted client IP per 15-minute window;
- shared persistent state in PostgreSQL, so the policy survives application restarts and applies across app instances;
- only the SHA-256-derived rate-limit key is stored; the raw client IP is not persisted by the limiter;
- concurrent requests for one bucket are serialized with a PostgreSQL transaction-scoped advisory lock;
- blocked requests return HTTP `429` and a `Retry-After` header;
- production registration fails closed with `503` if a trusted client identity or the shared limiter is unavailable.

### Trusted client IP

Production trusts `X-Real-IP` because the deployment topology establishes all of the following:

- the public application is reached through the host nginx;
- nginx overwrites `X-Real-IP` with `$remote_addr`;
- the application port is published only on host loopback (`127.0.0.1`);
- direct external access to the Next.js application port is not available.

The application deliberately does not derive its production rate-limit identity from arbitrary `X-Forwarded-For`.

Direct development mode falls back to loopback identity so local UI development remains usable.

### Follow-up reuse

The same shared limiter is designed for later reuse by password login. Login-specific limits can add a second hashed normalized-email dimension without changing the registration security contract.

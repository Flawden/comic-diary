# R7.2A — Login anti-bruteforce rate limit

R7.2A closes the release-blocking gap identified by the R7.2 password/account UX recon:
public registration already used the shared PostgreSQL auth limiter, while password login did not.

## Contract

`POST /api/auth/login` now consumes a dedicated login bucket before content-type checks,
body reads, JSON parsing, account lookup, or Argon2 verification.

Policy:

- scope: `login-ip-v1`;
- identity: trusted proxy-derived client IP;
- maximum: 20 requests per 15-minute fixed window;
- backend: the existing shared persistent PostgreSQL `auth_rate_limits` table;
- concurrency: the existing PostgreSQL advisory-lock implementation;
- blocked response: HTTP 429 with `Retry-After`;
- missing/invalid trusted identity in production: HTTP 503;
- limiter backend failure: fail closed with HTTP 503;
- `X-Forwarded-For` is not used as the login identity;
- raw client IP is not stored by the limiter; only the existing SHA-256-derived key is persisted.

The limiter intentionally runs before request-body parsing so malformed requests cannot bypass
the request budget or force password-verification work.

## Scope boundary

This slice does not add account settings, password change, password recovery, email change,
or session-management UI. Those remain separate self-service account work.

No schema migration is needed because R7.2A reuses the R7.1B auth-rate-limit table.

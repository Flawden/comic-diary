# BR04 — Canonical Origin / Host hardening

## Observed regression (2026-11-07)

The public `/api/admin/users/1` endpoint correctly returned 403 for
`Origin: https://probe.invalid`, but returned 401 for the same Origin combined
with a spoofed `X-Forwarded-Host` or a spoofed `Host`. A 401 means the request
reached authentication (and was still denied); it does **not** show an account
takeover. The same-origin validation had nevertheless been bypassed.

Cause: the `request-origin.ts` function derived its expected origin from
untrusted request headers. Nginx passed `Host $host`, and did not overwrite
`X-Forwarded-Host` at all. Per OWASP guidance, the expected origin should come
from trusted server configuration.

## Application contract

- **Production requires** `COMIC_DIARY_PUBLIC_ORIGIN` as a canonical HTTPS
  origin: `https://comic-diary.2-26-67-21.sslip.io` for the beta.
- No trailing slash, path, query, fragment or embedded credentials. A missing or
  invalid value **fails closed** for state-changing API requests that use
  `isSameOriginRequest`. Public GET/readiness routes still operate.
- The incoming `Origin` must match the configured origin exactly. The incoming
  `Host` must also be the canonical host; `X-Forwarded-Host` and
  `X-Forwarded-Proto` are never used to determine trust.
- Local development without this setting continues to accept its local host
  and port, but does not trust forwarded host headers.

## Required deploy order (do not push the app change before preparing server)

1. Back up `/opt/comic-diary/compose.yml` and `.env` (without displaying or
   copying their secrets into support logs).
2. Add this line **under `services.app.environment`** in the VPS `compose.yml`:

   `COMIC_DIARY_PUBLIC_ORIGIN: ${COMIC_DIARY_PUBLIC_ORIGIN:?COMIC_DIARY_PUBLIC_ORIGIN is required}`

3. Set `COMIC_DIARY_PUBLIC_ORIGIN=https://comic-diary.2-26-67-21.sslip.io`
   in the VPS Compose `.env`. Use `umask 077` and preserve file ownership.
4. From `/opt/comic-diary`, run
   `sudo docker compose -f compose.yml config --quiet`.
   Do **not** run `docker compose config` without `--quiet`, as it may expose
   secrets in the terminal or captured logs.
5. Verify that the currently running app has the variable after the next
   approved deploy. Do not print the entire process environment or DATABASE_URL.
6. Commit and push the source patch, wait for BR02 production smoke, then run
   the three anonymous PATCH probes again. Expected: normal host+origin = 401;
   foreign origin = 403; forged Host/X-Forwarded-Host = 403 (or rejected by
   Nginx with 421/444, if Nginx hostname gating is enabled).
7. Verify a **legitimate login** and a state-changing action via the browser
   on the canonical HTTPS domain. HTTP GETs / readiness alone do not test CSRF.

## Nginx defense-in-depth (per vhost, do not touch other projects)

For `/etc/nginx/sites-enabled/comic-diary`, within the HTTPS server block:

```nginx
server_name comic-diary.2-26-67-21.sslip.io;
if ($host != comic-diary.2-26-67-21.sslip.io) { return 421; }

location / {
    proxy_pass http://127.0.0.1:18082;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Keep existing proxy settings (headers, timeouts, body limits, etc).
}
```

Do not replace the entire existing location block. Back up the configuration,
edit only the Comic Diary vhost, run `sudo nginx -t`, and **reload** nginx only
if the syntax check passes. This affects the shared ingress and therefore
requires additional care. Changes to `X-Forwarded-For` and other Nginx
forwarding headers are outside this narrow hotfix.

## Tests

- `node --import tsx --test src/modules/auth/request-origin.test.ts`
- `npm run lint && npm run typecheck && npm run build`
- GitHub Actions includes the same regression suite in Verify.

## Rollback considerations

Rolling back just the app may restore the Origin spoofing vulnerability. If a
release must be rolled back, leave strict Nginx sanitization in place and
prepare a follow-up security fix. Backups and PostgreSQL migrations are not
modified by BR04. Recheck `Origin`, `Host`, normal sign-in and BR02 smoke after
any rollback. Never disable origin checks to restore logins.

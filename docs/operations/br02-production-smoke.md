# BR02 — production smoke after every deployment

**Status:** code prepared; requires GitHub Actions `PRODUCTION_BASE_URL` setup and a green live deployment before acceptance.

## Why this exists

A green build and a healthy Docker process do not prove the public site works. On
2026-11-05, PostgreSQL stopped responding after the VPS disk filled. BR02 adds an
**external public-path verification** after the immutable image is deployed.

Pipeline:

1. Validate code, PostgreSQL migration and disposable browser tests.
2. Build/publish immutable image by digest. Inject the full Git commit into the runtime image.
3. Deploy that exact digest using the existing restricted SSH deployment gate.
4. From the GitHub Actions runner, request the **public HTTPS origin** and require:
   - `GET /api/health/ready` — HTTP 200, `status=ready` after PostgreSQL `SELECT 1`, and exact expected full commit SHA;
   - `GET /` — HTTP 200 and rendered catalog heading;
   - `GET /login` — HTTP 200 and rendered login heading.
5. Retry transient failures for a bounded period. If any check never passes, the
   **Deploy production** job and CI workflow are red (nonzero exit code).

The readiness endpoint is public, read-only, uncached and does not expose
credentials or database errors. It does expose the deployed commit SHA. The
pages are checked without authentication or user data.

## One-time configuration (before pushing BR02)

Set the repository **Actions variable** to the actual public site origin (no
path, no trailing query, HTTPS):

```sh
gh variable set PRODUCTION_BASE_URL \
  --repo Flawden/comic-diary \
  --body 'https://comic-diary.2-26-67-21.sslip.io'

gh variable get PRODUCTION_BASE_URL --repo Flawden/comic-diary
```

Check that the domain above is **still the real deployed host**. It is not a
secret; it belongs in a variable, not a repository secret. Missing variables
fail **before** SSH deployment. If the site's public hostname changes, update
this variable before the next release.

## Acceptance

- CI `Verify` runs nine fake-server smoke tests (healthy, wrong release,
  database failure, broken page, redirects, invalid config, retries).
- Disposable PostgreSQL CI calls `/api/health/ready` against the running Next
  app and requires `status=ready`.
- Live CI's `Deploy production` log must show:
  `BR02=PASS; COMMIT=...; READINESS=ok; CATALOG=ok; LOGIN=ok`.
- In a safe separate test environment, temporarily make the app unable to
  connect to its test database and confirm the smoke fails. **Do not simulate
  failure by stopping production PostgreSQL or filling its disk.**

Inspect the last deployment:

```sh
gh run list --repo Flawden/comic-diary --workflow CI --limit 5
gh run view <RUN_ID> --repo Flawden/comic-diary --log-failed
```

For manual diagnosis after deploy, compare `/api/health/ready` output with
`git rev-parse HEAD` (full SHA), and inspect `docker compose ps` and application
logs over the existing administrative `ssh lab` connection. Avoid sharing
logs containing secrets.

## Safety boundaries

- **No automatic rollback.** A failed smoke flags the deployment; the newly
  started version can remain running. Schema migrations may be irreversible;
  rolling back just the application image could break compatibility.
- **No database writes and no test accounts.** BR02 only requests public pages
  and executes `SELECT 1` through the application.
- A passing smoke does **not** replace real authenticated browser checks,
  backups, restore drills, load testing, external uptime monitoring, or
  vulnerability review. It only proves three public requests responded and the
  runtime identifies itself as the expected commit.
- Public-health requests are small but still consume DB connections. Protect
  this URL from abusive traffic at the reverse proxy if needed.

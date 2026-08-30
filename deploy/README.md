# Comic Diary production deployment

## Security boundary

The production PostgreSQL service has no published host port.

The application is published only on host loopback:

`127.0.0.1:${COMIC_DIARY_HOST_PORT}:3000`

The first real deployment is therefore private and must be tested through an
SSH tunnel.

Public HTTP/HTTPS exposure belongs to the reverse proxy layer and is not part
of the application Compose stack.

## Image contract

Production Compose never builds application source on the VPS.

`COMIC_DIARY_IMAGE` points to an already-built immutable application image.

The deployment pipeline will eventually identify that image by the exact Git
commit SHA.

## Database contract

PostgreSQL data lives in the named Docker volume:

`comic_diary_pgdata`

The application image contains:

- the immutable Drizzle SQL migration history;
- `scripts/migrate-production.mjs`;
- production Node dependencies needed by the migration runner.

Production migrations are applied before switching the application to a new
image.

Migrations never edit or regenerate existing migration files.

## Admin import

`ADMIN_IMPORT_ENABLED` defaults to `false` in production.

The temporary VK catalog import administration surface must not be exposed
merely because the public application is deployed.

## Initial private smoke

The intended first server path is:

Internet: no application exposure

VPS:
`127.0.0.1:18082 -> Comic Diary app -> private Docker PostgreSQL`

Workstation:
SSH local forwarding to VPS `127.0.0.1:18082`.

Only after the private production stack is validated should the host firewall
and reverse proxy be changed for public HTTP/HTTPS.
## Container registry contract

The CI workflow publishes production application images to:

`ghcr.io/flawden/comic-diary`

For a successful push to `master`, the same verified Docker image is tagged as:

- the complete Git commit SHA;
- `master`.

The commit SHA tag is the version-oriented deployment reference.

`master` is only a convenience pointer and must never be used as the production
deployment identity.

After publication, CI also resolves the registry content digest and verifies
that the SHA and `master` tags point to the same image content.

The strongest deployment identity is therefore:

`ghcr.io/flawden/comic-diary@sha256:<digest>`

Future CD must deploy either the exact commit-addressed image or, preferably,
the exact resolved digest. It must never deploy an unqualified moving tag.

GitHub Actions publishes with its repository-scoped `GITHUB_TOKEN`.

The VPS must later receive only the minimum credentials required to pull the
private image. Registry write credentials do not belong on the VPS.
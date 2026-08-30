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
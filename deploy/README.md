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

## BR01 VPS disk protection

Disk alerts and conservative Docker-image retention are documented in
[`docs/operations/br01-disk-guard.md`](../docs/operations/br01-disk-guard.md).
The timer is installed separately on the VPS; publishing the app image does
not install it or enable automatic image deletion.

## BR02 public post-deploy smoke

The CI deploy job now verifies the public HTTPS application, PostgreSQL
readiness and exact image commit before reporting deployment success.
See [`docs/operations/br02-production-smoke.md`](../docs/operations/br02-production-smoke.md).
The `PRODUCTION_BASE_URL` GitHub Actions variable is required before deployment.


## RELEASE-01B1: AUTH configuration and server ownership

`compose.production.yml` forwards the existing recovery contract plus all 12
registration/activation settings. Every AUTH switch defaults to `false`; sender,
origin, outbox key and shared `RESEND_API_KEY` default to empty. The example env
contains names/defaults only. Empty/unset switches render as the string `false`.
An API key alone enables nothing. Persisted PostgreSQL gates remain independent.
Each AUTH public origin must exactly match `COMIC_DIARY_PUBLIC_ORIGIN` (HTTPS).
Use separate durable activation/recovery AEAD keys; retain them for existing jobs.

Legacy own-account email verification adds two default-OFF switches:
`AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED` (UI/redeem/legacy dispatch) and
`AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED` (new issuance). It reuses the
activation key, sender, persisted gate and worker; public registration can remain
OFF. Keep intake OFF until every app/worker supports purpose migration 0047.
See `docs/operations/AUTH_LEGACY_EMAIL_VERIFICATION_RUNBOOK.md` for shutdown,
mixed-version limitations and additive-schema rollback. Do not reset existing
AUTH values or replace the protected server env with the example.

The checked-in Compose is a template, not proof of the live server configuration.
Current GitHub Actions sends only `deploy SHA DIGEST` to the restricted SSH gate;
it does not contain the VPS gate implementation or a command installing this
file as `/opt/comic-diary/compose.yml`. Backup/health tools reference that server
path. Thus the actual copy/install source and whether a deployment overwrites
server files must be confirmed by the operator; they were NOT inspected on VPS.
Do not rely on manual edits of `/opt/comic-diary/compose.yml`: if the gate replaces
it from the Git template, literal settings will be lost.

Before a separately approved rollout the VPS operator must:

1. Identify the gate's exact source for `/opt/comic-diary/compose.yml`, working
   directory and Compose invocation. Confirm it preserves the protected settings
   file, changes only the intended image reference and has a rollback copy.
2. Keep AUTH values outside Git and outside a replaceable Compose template.
   Use the protected server interpolation environment/explicit `--env-file` that
   the gate actually consumes. Shell environment overrides env-file values;
   do not assume a different working directory finds the intended `.env`.
   A service `env_file:` alone does not supply Compose interpolation and explicit
   `environment:` defaults would override it. An override file works only if the
   actual invocation loads it; explicit `-f` must include each intended file.
3. Reconcile names with `production.env.example` WITHOUT copying that template
   over the real server settings or resetting existing database/image/origin values.
   Verify resolved AUTH flags/defaults using redacted status checks. Full `docker
   compose config` can expose injected secrets: do not paste/log/upload its output.
4. The existing Resend key is at `/etc/comic-diary/resend-api-key` (root:root 600).
   Do not create a replacement or change its permissions. This stage does not
   open/copy/mount it. Future approved provisioning must deliver `RESEND_API_KEY`
   securely at runtime; `RESEND_API_KEY_FILE` is not supported. Activation and
   recovery reuse the same Resend credential, with separate outbox encryption keys.
5. Confirm all AUTH flags and both DB gates OFF before launch. Later enable in
   the documented readiness -> redemption -> worker/dispatch -> operator gate ->
   public intake order, and separately authorize one real-mail check.

No workflow/gate behavior is changed here; feature-branch CI cannot deploy.
See [activation runbook](../docs/operations/AUTH_ACTIVATION_RUNBOOK.md),
[recovery runbook](../docs/operations/auth01-integrated-dispatch.md) and the
[rollout plan](../docs/operations/RELEASE01_ROLLOUT_PLAN.md).

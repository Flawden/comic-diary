# Comic Diary / AUTH-01 / R1C2C6 — Resend server configuration slot

**SERVER ONLY.** Runtime delivery credentials belong in the *server-side* secret environment of the Comic Diary process, NOT GitHub Actions CI, browser code, repository, Termux logs or chat. Never commit API keys.

R1C2C6 adds only an **inert configuration preflight**. It does **not** read `process.env`, load a `.env` file, send mail, enable a worker, modify SQL, or deploy. A syntactically valid candidate is **not a send permit**. Durable PostgreSQL dispatch authorization, manually approved recipient, and real-provider transport wiring are separate, future changes.

Required variable names (names only, DO NOT put credentials into this document):

- `AUTH_RECOVERY_RESEND_CONFIG_READY` — absent or `false` until deployment review; later `true` merely permits building a configuration candidate.
- `RESEND_API_KEY` — Resend send-only API key; store in protected server environment. Never commit.
- `AUTH_RECOVERY_FROM_ADDRESS` — e.g. `no-reply@YOUR-VERIFIED-DOMAIN.com` (example, not a configured address).
- `AUTH_RECOVERY_SENDER_DOMAIN` — exact lowercase verified domain matching the From address.
- `AUTH_RECOVERY_PUBLIC_ORIGIN` — canonical HTTPS origin, no trailing slash, e.g. `https://YOUR-DOMAIN.com`.

No working key or real domain is required to develop or run CI. Do not set the flag to `true` yet. Resend domain ownership, SPF/DKIM, production HTTPS, secrets injection, operator gate and end-to-end recovery must be verified before live use.

**Where later:** deployment service secret store, or restricted environment file on the application server loaded by the actual service manager (e.g. systemd / Docker Compose). The exact file/container must be discovered in a read-only deployment audit. A GitHub Actions secret is useful only if a future *explicitly approved* deployment pipeline needs it; current CI must never receive mail keys.

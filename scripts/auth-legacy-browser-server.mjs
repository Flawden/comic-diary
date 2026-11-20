/** Explicit disposable browser host. All server provider HTTP is blocked. */
import { createServer } from 'node:http';
import next from 'next';
const db = new URL(process.env.DATABASE_URL ?? '');
const local = db.hostname === '127.0.0.1' && db.port === '55526' && db.username === 'purpose01_qa' && db.pathname === '/purpose01_review';
const ci = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' && db.hostname === '127.0.0.1' && db.port === '5432' && db.username === 'comic_diary_ci' && db.pathname === '/comic_diary_release';
if (db.protocol !== 'postgresql:' || (!local && !ci) || db.search || db.hash) throw Error('REFUSED non-disposable browser database');
globalThis.fetch = async () => { throw Error('PROVIDER HTTP BLOCKED IN BROWSER FIXTURE'); };
// Suppress background scheduling only in this explicit fixture; request readiness
// remains synthetic-ON. Production cannot select these sentinels via environment.
globalThis.__activationWorker = setInterval(() => {}, 60_000);
globalThis.__recoveryWorker = setInterval(() => {}, 60_000);
const enabled = process.env.LEGACY_BROWSER_MODE !== 'disabled';
Object.assign(process.env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED: String(enabled), AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED: String(enabled),
  REGISTRATION_ACTIVATION_REDEEM_ENABLED: 'true', AUTH_ACTIVATION_WORKER_ENABLED: 'true', AUTH_ACTIVATION_DISPATCH_ENABLED: 'true',
  AUTH_ACTIVATION_RESEND_CONFIG_READY: 'true', AUTH_ACTIVATION_SENDER_VERIFIED: 'true',
  RESEND_API_KEY: 're_SYNTHETIC_NOT_A_REAL_KEY', AUTH_ACTIVATION_FROM_ADDRESS: 'mail@example.invalid',
  AUTH_ACTIVATION_SENDER_DOMAIN: 'example.invalid', AUTH_ACTIVATION_PUBLIC_ORIGIN: 'https://reader.example.invalid',
  COMIC_DIARY_PUBLIC_ORIGIN: 'https://reader.example.invalid', AUTH_ACTIVATION_OUTBOX_KEY_ID: 'legacy-browser',
  AUTH_ACTIVATION_OUTBOX_KEY_BASE64: Buffer.alloc(32, 23).toString('base64'),
});
const port = enabled ? 3110 : 3111;
const app = next({ dev: false, dir: process.cwd(), hostname: '127.0.0.1', port });
await app.prepare();
const handler = app.getRequestHandler();
const server = createServer((req, res) => handler(req, res));
server.listen(port, '127.0.0.1', () => console.log(`LEGACY_BROWSER_READY=${port}; PROVIDER_HTTP=BLOCKED`));
const stop = () => {
  clearInterval(globalThis.__activationWorker); clearInterval(globalThis.__recoveryWorker);
  server.closeAllConnections(); server.close(() => { void app.close().finally(() => process.exit(0)); });
};
process.stdin.on('data', data => { if (String(data).includes('stop')) stop(); });
process.on('SIGTERM', stop);

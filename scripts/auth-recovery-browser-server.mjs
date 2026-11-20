/** Disposable browser fixture. Provider HTTP is disabled in-process BEFORE
 * Next instrumentation runs, even when synthetic readiness flags are ON.
 */
import { createServer } from 'node:http';
import { Pool } from 'pg';
import next from 'next';

const url = new URL(process.env.DATABASE_URL ?? '');
const local = url.hostname === '127.0.0.1' && url.port === '55491' && url.username === 'auth01_qa' && url.pathname === '/auth01_nightshift';
const ci = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  url.hostname === '127.0.0.1' && url.port === '5432' && url.username === 'comic_diary_ci' && url.pathname === '/comic_diary_release';
if ((!local && !ci) || url.protocol !== 'postgresql:' || url.search || url.hash) throw Error('REFUSED: disposable browser database required');
const enabled = process.env.AUTH01_BROWSER_MODE === 'enabled';
const port = enabled ? 3108 : 3109;
globalThis.fetch = async () => { throw Error('ALL SERVER HTTP DISABLED IN BROWSER QA'); };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  if ((await pool.query('SELECT enabled FROM password_reset_mail_dispatch_control WHERE id=1')).rows[0]?.enabled !== false ||
      (await pool.query("SELECT count(*)::int AS n FROM password_reset_mail_outbox WHERE state='ready'")).rows[0].n !== 0) throw Error('REFUSED: gate must be OFF and queue empty');
} finally { await pool.end(); }
Object.assign(process.env, {
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  COMIC_DIARY_PUBLIC_ORIGIN: 'https://reader.example.invalid', AUTH_RECOVERY_PUBLIC_ORIGIN: 'https://reader.example.invalid',
  AUTH_RECOVERY_FROM_ADDRESS: 'no-reply@example.invalid', AUTH_RECOVERY_SENDER_DOMAIN: 'example.invalid',
  RESEND_API_KEY: 're_SYNTHETIC_NO_REAL_CREDENTIAL', PASSWORD_RESET_OUTBOX_KEY_ID: 'browser_qa',
  PASSWORD_RESET_OUTBOX_KEY_BASE64: Buffer.alloc(32, 19).toString('base64'),
});
for (const flag of ['PASSWORD_RESET_REQUEST_ENABLED', 'PASSWORD_RESET_REQUEST_MAIL_READY', 'PASSWORD_RESET_REDEEM_ENABLED',
  'AUTH_RECOVERY_RESEND_CONFIG_READY', 'AUTH_RECOVERY_WORKER_ENABLED', 'AUTH_RECOVERY_DISPATCH_ENABLED', 'AUTH_RECOVERY_SENDER_VERIFIED']) process.env[flag] = String(enabled);
const app = next({ dev: false, dir: process.cwd(), hostname: '127.0.0.1', port });
const handle = app.getRequestHandler();
await app.prepare();
const server = createServer((req, res) => handle(req, res));
server.listen(port, '127.0.0.1', () => console.log(`AUTH01_BROWSER_FIXTURE_READY=${port}; PROVIDER_HTTP=BLOCKED`));
const stop = () => { server.closeAllConnections(); server.close(() => { void app.close().finally(() => process.exit(0)); }); };
process.stdin.on('data', value => { if (String(value).includes('stop')) stop(); });
process.on('SIGTERM', stop);

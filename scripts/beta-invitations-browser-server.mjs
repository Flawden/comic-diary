/** Explicit local/CI fixture. No real provider request, secret or scheduling. */
import { createServer } from 'node:http';
import next from 'next';
const d = new URL(process.env.DATABASE_URL ?? '');
const local =
  d.hostname === '127.0.0.1' &&
  d.port === '55588' &&
  d.username === 'beta01_qa' &&
  d.pathname === '/beta01_review';
const ci =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  d.hostname === '127.0.0.1' &&
  d.port === '5432' &&
  d.username === 'comic_diary_ci' &&
  d.pathname === '/comic_diary_release';
if (!local && !ci) throw Error('Refused non-disposable browser target');
globalThis.fetch = async () => {
  throw Error('PROVIDER_HTTP_BLOCKED');
};
globalThis.__activationWorker = setInterval(() => {}, 60000);
globalThis.__recoveryWorker = setInterval(() => {}, 60000);
Object.assign(process.env, {
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  COMIC_DIARY_PUBLIC_ORIGIN: 'https://reader.example.invalid',
  REGISTRATION_ENABLED: 'false',
  REGISTRATION_ACTIVATION_REDEEM_ENABLED: 'true',
  AUTH_BETA_INVITATION_REGISTRATION_ENABLED: 'true',
  AUTH_BETA_INVITATION_DISPATCH_ENABLED: 'true',
  AUTH_ACTIVATION_WORKER_ENABLED: 'true',
  AUTH_ACTIVATION_DISPATCH_ENABLED: 'true',
  AUTH_ACTIVATION_RESEND_CONFIG_READY: 'true',
  AUTH_ACTIVATION_SENDER_VERIFIED: 'true',
  AUTH_ACTIVATION_FROM_ADDRESS: 'mail@example.invalid',
  AUTH_ACTIVATION_SENDER_DOMAIN: 'example.invalid',
  AUTH_ACTIVATION_PUBLIC_ORIGIN: 'https://reader.example.invalid',
  AUTH_ACTIVATION_OUTBOX_KEY_ID: 'beta-browser',
  AUTH_ACTIVATION_OUTBOX_KEY_BASE64: Buffer.alloc(32, 19).toString('base64'),
  RESEND_API_KEY: 're_SYNTHETIC_NOT_A_REAL_KEY',
});
const app = next({
  dev: false,
  dir: process.cwd(),
  hostname: '127.0.0.1',
  port: 3116,
});
await app.prepare();
const handler = app.getRequestHandler();
const server = createServer((req, res) => handler(req, res));
server.listen(3116, '127.0.0.1', () =>
  console.log('BETA_BROWSER_READY=3116; PROVIDER_HTTP_BLOCKED'),
);
function stop() {
  clearInterval(globalThis.__activationWorker);
  clearInterval(globalThis.__recoveryWorker);
  server.closeAllConnections();
  server.close(() => {
    void app.close().finally(() => process.exit(0));
  });
}
process.stdin.on('data', (d) => {
  if (String(d).includes('stop')) stop();
});
process.on('SIGTERM', stop);

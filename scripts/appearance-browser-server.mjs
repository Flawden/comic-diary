/** Disposable fixtures only, AUTH OFF and all provider HTTP blocked. */
import { createServer } from 'node:http';
import next from 'next';
const u = new URL(process.env.APPEARANCE_TEST_DATABASE_URL ?? '');
const local =
  u.hostname === '127.0.0.1' &&
  u.port === '55725' &&
  u.username === 'appearance_qa' &&
  u.pathname === '/appearance_review';
const ci =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  u.hostname === '127.0.0.1' &&
  u.port === '5432' &&
  u.username === 'comic_diary_ci' &&
  u.pathname === '/comic_diary_release';
if (!local && !ci) throw Error('Refused non-disposable target');
Object.assign(process.env, {
  DATABASE_URL: u.href,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  COMIC_DIARY_PUBLIC_ORIGIN: 'https://reader.example.invalid',
  MEDIA_ROOT: process.env.APPEARANCE_TEST_MEDIA_ROOT ?? '.qa/appearance-media',
});
for (const k of [
  'PASSWORD_RESET_REQUEST_ENABLED',
  'PASSWORD_RESET_REQUEST_MAIL_READY',
  'PASSWORD_RESET_REDEEM_ENABLED',
  'AUTH_RECOVERY_WORKER_ENABLED',
  'AUTH_RECOVERY_DISPATCH_ENABLED',
  'AUTH_RECOVERY_SENDER_VERIFIED',
  'AUTH_RECOVERY_RESEND_CONFIG_READY',
  'REGISTRATION_ENABLED',
  'REGISTRATION_ACTIVATION_REDEEM_ENABLED',
  'AUTH_ACTIVATION_RESEND_CONFIG_READY',
  'AUTH_ACTIVATION_SENDER_VERIFIED',
  'AUTH_ACTIVATION_DISPATCH_ENABLED',
  'AUTH_ACTIVATION_WORKER_ENABLED',
  'AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED',
  'AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED',
  'AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED',
  'AUTH_BETA_INVITATION_REGISTRATION_ENABLED',
  'AUTH_BETA_INVITATION_DISPATCH_ENABLED',
])
  process.env[k] = 'false';
delete process.env.RESEND_API_KEY;
globalThis.fetch = async () => {
  throw Error('PROVIDER_HTTP_BLOCKED');
};
const app = next({
  dev: false,
  dir: process.cwd(),
  hostname: '127.0.0.1',
  port: 3118,
});
await app.prepare();
const handler = app.getRequestHandler();
const server = createServer((req, res) => handler(req, res));
server.listen(3118, '127.0.0.1', () =>
  console.log('APPEARANCE_BROWSER_READY=3118; AUTH_OFF; PROVIDER_HTTP_BLOCKED'),
);
function stop() {
  server.closeAllConnections();
  server.close(() => void app.close().finally(() => process.exit(0)));
}
process.on('SIGTERM', stop);
process.stdin.on('data', (d) => {
  if (String(d).includes('stop')) stop();
});

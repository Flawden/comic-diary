import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, after } from 'node:test';

const activationFlags = ['REGISTRATION_ENABLED', 'REGISTRATION_ACTIVATION_REDEEM_ENABLED',
  'AUTH_ACTIVATION_RESEND_CONFIG_READY', 'AUTH_ACTIVATION_SENDER_VERIFIED',
  'AUTH_ACTIVATION_DISPATCH_ENABLED', 'AUTH_ACTIVATION_WORKER_ENABLED', 'AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED'];
const recoveryFlags = ['PASSWORD_RESET_REQUEST_ENABLED', 'PASSWORD_RESET_REQUEST_MAIL_READY',
  'PASSWORD_RESET_REDEEM_ENABLED', 'AUTH_RECOVERY_WORKER_ENABLED', 'AUTH_RECOVERY_DISPATCH_ENABLED',
  'AUTH_RECOVERY_SENDER_VERIFIED', 'AUTH_RECOVERY_RESEND_CONFIG_READY'];
const flags = [...activationFlags, ...recoveryFlags];
const settings = ['AUTH_ACTIVATION_FROM_ADDRESS', 'AUTH_ACTIVATION_SENDER_DOMAIN',
  'AUTH_ACTIVATION_PUBLIC_ORIGIN', 'AUTH_ACTIVATION_OUTBOX_KEY_ID', 'AUTH_ACTIVATION_OUTBOX_KEY_BASE64',
  'AUTH_RECOVERY_FROM_ADDRESS', 'AUTH_RECOVERY_SENDER_DOMAIN', 'AUTH_RECOVERY_PUBLIC_ORIGIN',
  'PASSWORD_RESET_OUTBOX_KEY_ID', 'PASSWORD_RESET_OUTBOX_KEY_BASE64', 'RESEND_API_KEY'];
const dir = mkdtempSync(join(tmpdir(), 'comic-compose-auth-'));
const envFile = join(dir, 'synthetic.env');
const base = { COMIC_DIARY_IMAGE: 'example.invalid/comic-diary:config-only',
  POSTGRES_DB: 'synthetic', POSTGRES_USER: 'synthetic', POSTGRES_PASSWORD: 'synthetic-only',
  COMIC_DIARY_PUBLIC_ORIGIN: 'https://reader.example.invalid', DOCKER_CONFIG: dir };
// Do not inherit AUTH values, credentials or a working-directory .env from the host.
for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'SystemDrive', 'PATHEXT', 'TEMP', 'TMP', 'ProgramFiles', 'ProgramData']) {
  if (process.env[name] !== undefined) base[name] = process.env[name];
}
function render(values = {}, contents = '') {
  writeFileSync(envFile, contents, { mode: 0o600 });
  return JSON.parse(execFileSync('docker', ['compose', '--env-file', envFile,
    '-f', resolve('deploy/compose.production.yml'), 'config', '--format', 'json'],
  { env: { ...base, ...values }, encoding: 'utf8', timeout: 30_000 }));
}
after(() => { unlinkSync(envFile); rmdirSync(dir); });

test('production Compose resolves every AUTH gate OFF and every mail setting empty', () => {
  const config = render();
  for (const name of flags) assert.equal(config.services.app.environment[name], 'false', name);
  for (const name of settings) assert.equal(config.services.app.environment[name], '', name);
  assert.equal(config.services.app.image, base.COMIC_DIARY_IMAGE);
  assert.equal(config.services.app.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services.db.ports, undefined);
});

test('empty switches cannot accidentally enable AUTH', () => {
  const config = render(Object.fromEntries(flags.map(name => [name, ''])));
  for (const name of flags) assert.equal(config.services.app.environment[name], 'false', name);
});

test('explicit synthetic operator settings reach app without running containers', () => {
  const values = Object.fromEntries([...flags.map(name => [name, 'true']),
    ...settings.map(name => [name, `synthetic-${name.toLowerCase()}`])]);
  const config = render(values);
  for (const [name, value] of Object.entries(values)) assert.equal(config.services.app.environment[name], value, name);
});

test('shell configuration overrides the explicitly selected interpolation env file', () => {
  const config = render({ REGISTRATION_ENABLED: 'false' }, 'REGISTRATION_ENABLED=true\nAUTH_ACTIVATION_FROM_ADDRESS=mail@example.invalid\n');
  assert.equal(config.services.app.environment.REGISTRATION_ENABLED, 'false');
  assert.equal(config.services.app.environment.AUTH_ACTIVATION_FROM_ADDRESS, 'mail@example.invalid');
});

test('public example contains the same safe AUTH defaults and one shared Resend key', () => {
  const example = readFileSync('deploy/production.env.example', 'utf8');
  for (const name of flags) assert.match(example, new RegExp(`^${name}=false$`, 'm'), name);
  for (const name of settings) assert.match(example, new RegExp(`^${name}=$`, 'm'), name);
  const compose = readFileSync('deploy/compose.production.yml', 'utf8');
  assert.equal((compose.match(/^\s+RESEND_API_KEY:/gm) ?? []).length, 1);
  assert.doesNotMatch(compose, /RESEND_API_KEY_FILE|\/etc\/comic-diary\/resend-api-key/);
  // Match names actually read by the runtime; helper reuse must not drop activation mappings.
  const source = readFileSync('src/modules/auth/registration-activation-config.ts', 'utf8') +
    readFileSync('src/modules/auth/registration-activation-operator-control.ts', 'utf8');
  const runtimeNames = [...source.matchAll(/(?:env|process\.env)\.((?:AUTH_ACTIVATION_|REGISTRATION_)[A-Z0-9_]+)/g)].map(m => m[1]);
  assert.equal(new Set(runtimeNames).size, 12);
  for (const name of runtimeNames) assert.ok([...flags, ...settings].includes(name), name);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = p => readFileSync(p, 'utf8');
test('all 16 operator switches retain exact-true runtime semantics and absent default OFF', () => {
  const sources = {
    'password-reset-request-config.ts': ['PASSWORD_RESET_REQUEST_ENABLED','PASSWORD_RESET_REQUEST_MAIL_READY'],
    'password-reset-dispatch.ts': ['PASSWORD_RESET_REDEEM_ENABLED','AUTH_RECOVERY_DISPATCH_ENABLED','AUTH_RECOVERY_SENDER_VERIFIED','AUTH_RECOVERY_WORKER_ENABLED'],
    'password-reset-request-resend-runtime-config.ts': ['AUTH_RECOVERY_RESEND_CONFIG_READY'],
    'registration-activation-config.ts': ['REGISTRATION_ENABLED','REGISTRATION_ACTIVATION_REDEEM_ENABLED','AUTH_ACTIVATION_DISPATCH_ENABLED','AUTH_ACTIVATION_SENDER_VERIFIED','AUTH_ACTIVATION_WORKER_ENABLED'],
    'registration-activation-operator-control.ts': ['AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED'],
    'verification-purpose.ts': ['AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED','AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED'],
  };
  const cli = read('scripts/auth-activation-pilot-control.mjs');
  const names = [...Object.values(sources).flat(),'AUTH_ACTIVATION_RESEND_CONFIG_READY'];
  assert.equal(names.length,16);assert.equal(new Set(names).size,16);
  const list = cli.match(/const authSwitches = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...list.matchAll(/'([A-Z0-9_]+)'/g)].map(m=>m[1]).sort(),names.sort());
  for(const [file,flags] of Object.entries(sources))for(const flag of flags) {
    assert.match(read('src/modules/auth/'+file),new RegExp(`\\.${flag} [!=]== "true"`));
  }
  // Activation readiness delegates to the same exact-true Resend config parser.
  assert.match(read('src/modules/auth/registration-activation-config.ts'),/AUTH_RECOVERY_RESEND_CONFIG_READY: env.AUTH_ACTIVATION_RESEND_CONFIG_READY/);
  assert.match(cli,/process\.env\[k\]!==undefined && process\.env\[k\]!=='false'/);
});
test('0048 is additive, ordered, and keeps irreversible pilot tombstones', () => {
  const sql = read('drizzle/0048_activation_one_shot_pilot.sql');
  assert.equal((sql.match(/ADD COLUMN/g) ?? []).length, 6);
  assert.doesNotMatch(sql, /DROP\s|DELETE\s|TRUNCATE\s|REFERENCES/i);
  assert.match(sql, /activation_mail_pilot_shape_check/);
  for (const field of ['pilot_id','pilot_outbox_id','pilot_dispatch_used_at','pilot_closed_at']) {
    assert.match(sql, new RegExp(`OLD\\.${field} IS NOT NULL`));
    assert.match(sql, new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`));
  }
  const journal = JSON.parse(read('drizzle/meta/_journal.json')).entries;
  assert.equal(journal[48].tag, '0048_activation_one_shot_pilot');
  assert.ok(journal[48].when > journal[47].when);
  const snapshot = JSON.parse(read('drizzle/meta/0048_snapshot.json'));
  assert.equal(snapshot.prevId, JSON.parse(read('drizzle/meta/0047_snapshot.json')).id);
});
test('request and dispatch take exclusive CONTROL initially; test and operator reach CI/image', () => {
  for (const file of ['legacy-email-verification-service.ts','registration-activation-dispatch.ts']) {
    assert.match(read('src/modules/auth/'+file), /where\(eq\((?:activationMailDispatchControl|controlTable)\.id, 1\)\)\.for\("update"\)/);
  }
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /node --import tsx --test scripts\/auth-activation-pilot-integration\.test\.ts/);
  assert.match(ci, /scripts\/auth-activation-pilot-contract\.test\.mjs/);
  assert.match(read('Dockerfile'), /scripts\/auth-activation-pilot-control\.mjs/);
});

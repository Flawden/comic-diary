import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(path, 'utf8');
const service = read('src/modules/auth/legacy-email-verification-service.ts');
test('legacy writes require current credentials, USER then SESSION locks, and live SQL guards', () => {
  assert.match(service, /await verifyPassword\(row.passwordHash, currentPassword\)/);
  assert.match(service, /account.passwordHash !== checked.passwordHash/);
  assert.ok(service.indexOf('.from(users).where(eq(users.id, checked.userId)).for("update")') < service.indexOf('.from(sessions).where(and('));
  assert.match(service, /eq\(sessions.tokenHash, checked.sessionHash\)/);
  assert.match(service, /eq\(emailVerificationTokens.purpose, "legacy_email_verification"\)/);
  assert.match(service, /eq\(users.passwordHash, checked.passwordHash\)/);
  assert.match(service, /isNull\(users.verificationRequiredAt\)/);
  assert.match(service, /expiresAt} > clock_timestamp\(\)/);
  assert.match(service, /if \(verified.length !== 1\) throw/);
  assert.doesNotMatch(service, /\.delete\(sessions\)|\.set\(\{ passwordHash|setSessionCookie|console\./);
});
test('public routes only select fixed own-account actions; no legacy bearer-only service', () => {
  for (const action of ['request', 'redeem']) {
    const source = read(`src/app/api/account/email-verification/${action}/route.ts`);
    assert.ok(source.includes(`handleLegacyVerification(request, "${action}")`));
    assert.doesNotMatch(source, /redeemEmailVerificationToken|issueEmailVerificationForUser|userId|recipient/);
  }
  for (const name of ['legacy-email-verification-http.ts', 'legacy-email-verification-service.ts']) {
    assert.doesNotMatch(read(`src/modules/auth/${name}`), /["'][^"']*\/email-verification-service["']|\bissueEmailVerificationForUser\b|\bredeemEmailVerificationToken\b/);
  }
  const boundary = read('src/modules/auth/legacy-email-verification-http.ts');
  assert.match(boundary, /isSameOriginRequest\(request\)/);
  assert.match(boundary, /readSessionToken\(request.cookies\)/);
  assert.match(boundary, /consumeAuthRateLimit/);
  assert.match(boundary, /readRegistrationActivationBody/);
});
test('CI runs real legacy integration and enabled/OFF browser evidence', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.ok(ci.includes('node --import tsx --test scripts/auth-legacy-email-verification-integration.test.ts'));
  assert.ok(ci.includes('node --import tsx scripts/auth-legacy-browser.mjs'));
  assert.ok(ci.includes('export LEGACY_BROWSER_MODE="$mode"'));
  const browser = read('scripts/auth-legacy-browser-server.mjs');
  assert.match(browser, /globalThis.fetch = async \(\) => \{ throw Error/);
  assert.match(browser, /REFUSED non-disposable browser database/);
});

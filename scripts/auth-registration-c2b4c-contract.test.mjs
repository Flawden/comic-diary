/** C2B4C offline contracts. Not a substitute for disposable PostgreSQL tests. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(path, "utf8");
const service = read("src/modules/auth/registration-activation-service.ts");
const old = read("src/modules/auth/email-verification-service.ts");
const probe = read("scripts/auth-registration-c2b4c-probe.ts");
const olderProbe = read("scripts/auth-email-verification-c2b3-probe.ts");
const ci = read(".github/workflows/ci.yml");

test("pending activation is internal-only with no public route/cookie/mail", () => {
  assert.match(service, /INTERNAL ONLY/);
  assert.doesNotMatch(service, /NextResponse|cookies\(|sendMail|setSessionCookie/);
  assert.match(service, /activatePendingRegistrationWithEmailToken/);
});
test("new activation demands mailbox token and strong replacement password", () => {
  assert.match(service, /hashEmailVerificationToken\(token\)/);
  assert.match(service, /isRegistrationPasswordAllowed\(newPassword\)/);
  assert.match(service, /hashPassword\(newPassword\)/);
  assert.match(service, /needsSecurePendingActivation\(account\)/);
  assert.match(service, /canRedeemEmailVerification\(account, challenge, now\)/);
});
test("USER then TOKEN row locks and all changes share transaction", () => {
  assert.match(service, /db\.transaction\(async \(tx\)/);
  const userLock = service.indexOf('.from(users)');
  const tokenLock = service.indexOf('.from(emailVerificationTokens)', userLock);
  assert.ok(userLock >= 0 && tokenLock > userLock);
  assert.match(service, /\.for\("update"\)/g);
  assert.match(service, /\.set\(\{ consumedAt: now \}\)/);
  assert.match(service, /\.set\(\{ passwordHash, emailVerifiedAt: now, updatedAt: now \}\)/);
  assert.match(service, /throw new Error\("Pending account activation did not persist"\)/);
});
test("activation revokes sessions and outstanding reset/verification secrets", () => {
  assert.match(service, /tx\.delete\(sessions\)/);
  assert.match(service, /tx\.update\(passwordResetTokens\)/);
  assert.match(service, /tx\.update\(emailVerificationTokens\)/);
  assert.doesNotMatch(service, /createUserSession\(/);
});
test("retired bearer redemption cannot confirm any state; pending retains lifecycle coverage", () => {
  const retired = old.split("export async function redeemEmailVerificationToken(")[1];
  assert.match(retired, /return \{ ok: false, kind: "invalid_token" \}/);
  assert.doesNotMatch(retired, /\bdb\b|ok: true/);
  assert.match(old, /!needsSecurePendingActivation\(account\)/);
  assert.match(olderProbe, /activatePendingRegistrationWithEmailToken\(token,/);
  assert.match(probe, /assert.equal\(legacyAfter.email_verified_at, null\)/);
});
test("real PostgreSQL probe refuses unknown DB before importing service", () => {
  assert.match(probe, /GITHUB_ACTIONS/);
  assert.match(probe, /comic_diary_release/);
  assert.match(probe, /ci_ephemeral_password/);
  assert.ok(probe.indexOf('assertDisposableCiTarget()') < probe.indexOf('await import('));
});
test("CI runs both C2B3 regression and new pending activation probe", () => {
  assert.match(ci, /node --import tsx scripts\/auth-email-verification-c2b3-probe\.ts/);
  assert.match(ci, /node --import tsx scripts\/auth-registration-c2b4c-probe\.ts/);
  assert.match(ci, /scripts\/auth-registration-c2b4c-contract\.test\.mjs/);
});
test("PG probe tests owner password replacement, races, replay and rollback", () => {
  for (const marker of ["NEW_PASSWORD_REPLACES_INITIAL", "CONCURRENT_ACTIVATION", "LEGACY_PENDING_SEPARATION", "EXPIRY_EMAIL_GATES", "ROLLBACK"])
    assert.match(probe, new RegExp(`AUTH01C2B4C_${marker}=PASS`));
});

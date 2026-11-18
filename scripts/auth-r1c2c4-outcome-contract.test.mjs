/** AUTH-01 R1C2C4: source-only safety contracts. NO DB, provider or network. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const finalizer = readFileSync("src/modules/auth/password-reset-request-outbox-finalize-reserved.ts", "utf8");
const adapter = readFileSync("src/modules/auth/password-reset-request-provider-outcome.ts", "utf8");
const probe = readFileSync("scripts/auth-r1c2c4-recovery-finalize-pg-probe.ts", "utf8");
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const reserve = readFileSync("src/modules/auth/password-reset-request-outbox-reserve.ts", "utf8");
test("provider outcome adapter cannot send, retry, expose credentials or DB", () => {
  assert.match(adapter, /retryAuthorized: false/);
  assert.match(adapter, /sendAuthorized: false/);
  assert.doesNotMatch(adapter, /\bfetch\s*\(|https?\.request|smtp\.|resend\.|sendMail\s*\(|process\.env|DATABASE_URL|API_KEY|providerMessageId/);
});
test("only explicit positive acceptance or definitive rejection can classify", () => {
  assert.match(adapter, /evidence\.acknowledged === true/);
  assert.match(adapter, /evidence\.definitivelyNotAccepted === true/);
  assert.match(adapter, /return UNCERTAIN/);
});
test("finalizer locks CONTROL USER TOKEN OUTBOX in that order", () => {
  const c = finalizer.indexOf("const [control] = await tx.select");
  const u = finalizer.indexOf("const [account] = await tx.select");
  const t = finalizer.indexOf("const [token] = await tx.select");
  const o = finalizer.indexOf("const [item] = await tx.select");
  assert.ok(c > 0 && c < u && u < t && t < o);
  assert.match(finalizer, /\.for\("update"\)/);
});
test("finalizer requires committed reservation generation and one claim", () => {
  assert.match(finalizer, /item\.dispatchReservationGeneration !== input\.reservationGeneration/);
  assert.match(finalizer, /item\.claimId !== input\.claimId/);
  assert.match(finalizer, /item\.attemptCount !== 1/);
  assert.match(finalizer, /isNotNull\(passwordResetMailOutbox\.dispatchReservationAt\)/);
  assert.match(finalizer, /isNull\(passwordResetMailOutbox\.finalizedAt\)/);
});
test("OFF does not hide the outcome of an already reserved attempt", () => {
  assert.match(finalizer, /if \(!control\) return BLOCKED/);
  assert.doesNotMatch(finalizer, /control\.enabled !== true/);
  assert.match(finalizer, /state: decision\.classification, finalizedAt: now/);
});
test("finalizer and provider contracts contain no sending entrypoint", () => {
  for (const source of [finalizer,adapter]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|https?\.request\s*\(|sendMail\s*\(|process\.env|setTimeout|setInterval|requeue\s*\(/);
  }
  assert.match(finalizer, /sendAuthorized: false, retryAuthorized: false/);
});
test("PG17 race probe is restricted to disposable CI and no mail", () => {
  assert.match(probe, /disposableCiUrl\(\)/);
  assert.match(probe, /GITHUB_ACTIONS/);
  assert.match(probe, /comic_diary_ci/);
  assert.match(probe, /Promise\.all\(\[/);
  assert.match(probe, /AUTH01_R1C2C4_DISPOSABLE_PG17=PASS/);
  assert.doesNotMatch(probe, /\bfetch\s*\(|sendMail\s*\(|https?\.request\s*\(/);
});
test("CI runs outcome classification and disposable PG17 probe", () => {
  assert.match(workflow, /AUTH-01 R1C2C4 provider outcome and reservation contracts \(NO mail\)/);
  assert.match(workflow, /AUTH-01 R1C2C4 disposable PostgreSQL reserved outcome finalization \(NO mail\)/);
  assert.match(workflow, /image: postgres:17-alpine/);
});
test("original reservation stays inert and default OFF", () => {
  assert.match(reserve, /sendAuthorized: false/);
  assert.match(reserve, /control\.enabled !== true/);
});

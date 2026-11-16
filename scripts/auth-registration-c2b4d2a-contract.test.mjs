/** Structural regression: mail preparation stays fully disconnected from public routes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const mail = read("src/modules/auth/registration-activation-mail.ts");
const ci = read(".github/workflows/ci.yml");
const register = read("src/app/api/auth/register/route.ts");
const redeem = read("src/app/api/auth/activate/redeem/route.ts");
const verification = read("src/modules/auth/email-verification-service.ts");

test("D2A mail contract is pure and provider neutral", () => {
  assert.match(mail, /buildPendingActivationMail/);
  assert.match(mail, /deliverPendingActivationMail/);
  assert.match(mail, /return value === "true"/);
  assert.doesNotMatch(mail, /\bfetch\(|\bSMTP\b|\bnodemailer\b|\bprocess\.env\b|\bconsole\.|\bnew Pool\b|\bdb\.transaction\b/);
});

test("activation code is not placed in links and origin is canonical HTTPS only", () => {
  assert.match(mail, /url\.protocol !== "https:"/);
  assert.match(mail, /value !== url\.origin/);
  assert.match(mail, /const activationPageUrl = `\$\{origin\}\/activate`/);
  assert.doesNotMatch(mail, /\?token=|#token=|token%3[dD]/);
});

test("redemption route and registration remain disconnected from issuing/sending", () => {
  assert.doesNotMatch(register, /deliverPendingActivationMail|buildPendingActivationMail/);
  assert.doesNotMatch(redeem, /deliverPendingActivationMail|buildPendingActivationMail|issueEmailVerificationForUser/);
  assert.match(verification, /INTERNAL ONLY/);
});

test("CI runs new pure mail tests and structural guard", () => {
  assert.match(ci, /scripts\/auth-registration-c2b4d2a-contract\.test\.mjs/);
  assert.match(ci, /src\/modules\/auth\/registration-activation-mail\.test\.ts/);
});

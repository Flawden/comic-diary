/** AUTH-01C2B4D2B1: sender boundary must remain inert and disconnected. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(path, "utf8");
const sender = read("src/modules/auth/registration-activation-sender.ts");
const ci = read(".github/workflows/ci.yml");
const redeem = read("src/app/api/auth/activate/redeem/route.ts");
const register = read("src/app/api/auth/register/route.ts");
const mail = read("src/modules/auth/registration-activation-mail.ts");

test("sender is only a pure four-field envelope guard", () => {
  assert.match(sender, /prepareActivationSenderEnvelope/);
  assert.match(sender, /Object\.keys\(message\)/);
  assert.match(sender, /Object\.freeze/);
  assert.doesNotMatch(sender, /\bfetch\s*\(|\bprocess\.env\b|\bconsole\.|\bnew Pool\b|\bdb\.transaction\b|\bnodemailer\b|\bsetTimeout\s*\(|\bwriteFile/);
});
test("no route is able to invoke sender or activation mail", () => {
  for (const source of [redeem, register]) {
    assert.doesNotMatch(source, /prepareActivationSenderEnvelope|deliverPendingActivationMail|buildPendingActivationMail/);
  }
});
test("existing mail remains off by default and keeps token out of URLs", () => {
  assert.match(mail, /return value === "true"/);
  assert.match(mail, /const activationPageUrl = `\$\{origin\}\/activate`/);
  assert.doesNotMatch(sender, /API_KEY|SECRET_KEY|SMTP_PASSWORD|authorization:/i);
});
test("CI exercises sender boundary with no outbound email", () => {
  assert.match(ci, /scripts\/auth-registration-c2b4d2b1-contract\.test\.mjs/);
  assert.match(ci, /src\/modules\/auth\/registration-activation-sender\.test\.ts/);
});

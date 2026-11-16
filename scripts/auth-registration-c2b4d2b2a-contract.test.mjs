/** AUTH-01C2B4D2B2A: candidate Resend format remains inert, no route wiring. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(path, "utf8");
const source = read("src/modules/auth/registration-activation-resend-contract.ts");
const ci = read(".github/workflows/ci.yml");
const register = read("src/app/api/auth/register/route.ts");
const redeem = read("src/app/api/auth/activate/redeem/route.ts");
const mail = read("src/modules/auth/registration-activation-mail.ts");

test("provider candidate is pure and has no active delivery or secrets", () => {
  assert.match(source, /prepareResendActivationCandidate/);
  assert.match(source, /classifyResendCandidateReply/);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bprocess\.env\b|\bconsole\.|\bsetTimeout\s*\(|\bnew Pool\b|\bdb\.transaction\b|\bwriteFileSync\b|\bnodemailer\b|Bearer /);
});
test("provider request has narrow HTTPS endpoint, text-only body, no headers", () => {
  assert.match(source, /https:\/\/api\.resend\.com\/emails/);
  assert.match(source, /Object\.freeze\(\{[\s\S]*?text: envelope\.text/);
  assert.doesNotMatch(source, /"html"|"cc"|"bcc"|"attachments"|"reply_to"/);
});
test("no public route or existing mail service connects provider candidate", () => {
  for (const other of [register, redeem, mail]) assert.doesNotMatch(other, /registration-activation-resend-contract|prepareResendActivationCandidate/);
});
test("CI validates inert Resend candidate with no outbound network", () => {
  assert.match(ci, /scripts\/auth-registration-c2b4d2b2a-contract\.test\.mjs/);
  assert.match(ci, /src\/modules\/auth\/registration-activation-resend-contract\.test\.ts/);
});

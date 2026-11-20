/** AUTH-01C2B4D2B2B: outbox reducer stays inert until durable DB orchestration. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (file) => readFileSync(file, "utf8");
const policy = read("src/modules/auth/registration-activation-outbox-policy.ts");
const register = read("src/app/api/auth/register/route.ts");
const redeem = read("src/app/api/auth/activate/redeem/route.ts");
const resend = read("src/modules/auth/registration-activation-resend-contract.ts");
const mail = read("src/modules/auth/registration-activation-mail.ts");
const ci = read(".github/workflows/ci.yml");

test("outbox outcome policy is pure: no DB, credentials, live network or log", () => {
  assert.match(policy, /deriveActivationOutboxNextState/);
  assert.doesNotMatch(policy, /\bfetch\s*\(|\bprocess\.env\b|\bconsole\.|\b(?:await|setTimeout|crypto\.randomBytes)\b|\bPool\b|\bdb\.transaction\b|\bINSERT\b|\bUPDATE\b|Bearer /);
});

test("only ready and in-flight states transition; uncertain cannot be retried", () => {
  assert.match(policy, /current !== "ready" && current !== "in_flight"/);
  assert.match(policy, /"uncertain"/);
  assert.doesNotMatch(policy, /"retry"|"requeue"|"send"|"delivered"/);
});

test("the outbox policy is not wired into public auth routes or mail transport", () => {
  for (const other of [register, redeem, resend, mail]) {
    assert.doesNotMatch(other, /registration-activation-outbox-policy|deriveActivationOutboxNextState/);
  }
});

test("CI has independent Node and TypeScript tests for the inert outbox policy", () => {
  assert.match(ci, /scripts\/auth-registration-c2b4d2b2b-contract\.test\.mjs/);
  assert.match(ci, /src\/modules\/auth\/registration-activation-outbox-policy\.test\.ts/);
});

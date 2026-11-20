/** Offline structural guard for D1; full HTTP/PG tests remain required in CI. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const route = read("src/app/api/auth/activate/redeem/route.ts");
const policy = read("src/modules/auth/registration-activation-http.ts");
const ci = read(".github/workflows/ci.yml");
const registration = read("src/app/api/auth/register/route.ts");

test("activation route is off by default and cannot issue or send challenges", () => {
  assert.match(route, /registrationActivationRedeemEnabled\(process\.env\.REGISTRATION_ACTIVATION_REDEEM_ENABLED\)/);
  assert.match(route, /activatePendingRegistrationWithEmailToken/);
  assert.doesNotMatch(route, /issueEmailVerificationForUser|sendMail|emailTransport|createUserSession|setSessionCookie/);
  assert.match(route, /clearSessionCookie\(response\)/);
});

test("origin, trusted IP, persistent rate limit and security headers are required", () => {
  for (const marker of ["isSameOriginRequest(request)", "readTrustedClientIp(request.headers)", "consumeAuthRateLimit({", "registration-activation-redeem-ip-v1", "Retry-After", "Cache-Control", "Referrer-Policy", "no-referrer"]) {
    assert.match(route + policy, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.ok(route.indexOf("consumeAuthRateLimit({") < route.indexOf("readRegistrationActivationBody(request)"));
});

test("streaming size limits and strict JSON keys precede redemption", () => {
  assert.match(policy, /request\.body\.getReader\(\)/);
  assert.match(policy, /total > REGISTRATION_ACTIVATION_REDEEM_MAX_BODY_BYTES/);
  assert.match(policy, /keys\.length !== 3/);
  assert.match(policy, /newPassword !== newPasswordConfirm/);
  assert.match(route, /parseRegistrationActivationBody\(json\)/);
});

test("CI verifies both pure contract and HTTP boundary tests", () => {
  assert.match(ci, /scripts\/auth-registration-c2b4d1-contract\.test\.mjs/);
  assert.match(ci, /src\/modules\/auth\/registration-activation-http\.test\.ts/);
});

test("real signup stays pending and does not set cookies", () => {
  assert.match(registration, /activationRequired: true/);
  assert.doesNotMatch(registration, /setSessionCookie|createUserSession/);
});

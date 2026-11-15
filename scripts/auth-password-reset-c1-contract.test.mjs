import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/auth/password-reset/redeem/route.ts", "utf8");
const http = readFileSync("src/modules/auth/password-reset-http.ts", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const probe = readFileSync("scripts/auth-password-reset-c1-api-probe.ts", "utf8");

test("redeem endpoint is disabled by default and contains no issuance or mail sender", () => {
  assert.match(route, /passwordResetRedeemEnabled\(process\.env\.PASSWORD_RESET_REDEEM_ENABLED\)/);
  assert.match(route, /recovery_unavailable/);
  assert.doesNotMatch(route, /issuePasswordResetForUser|sendPasswordResetEmail|sendMail/);
  assert.match(http, /setting === "true"/);
});

test("route has origin, trusted IP, persisted rate limit and bounded JSON input", () => {
  for (const expr of [
    /isSameOriginRequest\(request\)/,
    /readTrustedClientIp\(request\.headers\)/,
    /consumeAuthRateLimit/,
    /readPasswordResetBody\(request\)/,
    /parsePasswordResetBody\(parsedJson\)/,
    /redeemPasswordResetToken\(fields\.token, fields\.newPassword\)/,
  ]) assert.match(route, expr);
  assert.match(http, /PASSWORD_RESET_REDEEM_MAX_BODY_BYTES = 4096/);
  assert.match(http, /bytes > PASSWORD_RESET_REDEEM_MAX_BODY_BYTES/);
});

test("success clears stale auth cookie and sends safe response headers", () => {
  assert.match(route, /clearSessionCookie\(response\)/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /"Referrer-Policy": "no-referrer"/);
  assert.doesNotMatch(route, /console\.(log|error)|rawToken|searchParams/);
});

test("CI exercises pure parser and live HTTP boundary against disposable PostgreSQL", () => {
  assert.match(ci, /node --import tsx --test src\/modules\/auth\/password-reset-http\.test\.ts/);
  assert.match(ci, /node --test scripts\/auth-password-reset-c1-contract\.test\.mjs/);
  assert.match(ci, /node --import tsx scripts\/auth-password-reset-c1-api-probe\.ts/);
  assert.match(probe, /GITHUB_ACTIONS !== "true"/);
  assert.match(probe, /comic_diary_release/);
  assert.match(probe, /AUTH01C1_HTTP_REDEEM_AND_ONE_TIME=PASS/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_RESET_REDEEM_IP_MAX_REQUESTS,
  PASSWORD_RESET_REDEEM_MAX_BODY_BYTES,
  parsePasswordResetBody,
  passwordResetRedeemEnabled,
  readPasswordResetBody,
} from "./password-reset-http";

const url = "https://example.invalid/api/auth/password-reset/redeem";

function request(body: string, headers: HeadersInit = {}): Request {
  return new Request(url, { method: "POST", body, headers });
}

test("public redemption is disabled unless explicitly opted in", () => {
  for (const value of [undefined, "", "1", "TRUE", " true ", "false"]) {
    assert.equal(passwordResetRedeemEnabled(value), false);
  }
  assert.equal(passwordResetRedeemEnabled("true"), true);
});

test("valid payload requires exactly three fields and matching passwords", () => {
  const good = { token: "x".repeat(43), newPassword: "A-strong-secret-123!", newPasswordConfirm: "A-strong-secret-123!" };
  assert.deepEqual(parsePasswordResetBody(good), { ok: true, token: good.token, newPassword: good.newPassword });
  assert.deepEqual(parsePasswordResetBody({ ...good, newPasswordConfirm: "different" }), { ok: false, reason: "password_mismatch" });
});

test("rejects unexpected keys, invalid types, arrays and prototypes", () => {
  const good = { token: "x".repeat(43), newPassword: "Secret-123!", newPasswordConfirm: "Secret-123!" };
  for (const malformed of [
    null, [], "string", { ...good, extra: 1 },
    { ...good, token: 123 }, { ...good, newPassword: null },
    { ...good, newPasswordConfirm: false },
    { ...good, __proto__: null, surprise: true },
    { token: "", newPassword: "", newPasswordConfirm: "" },
  ]) {
    assert.deepEqual(parsePasswordResetBody(malformed), { ok: false, reason: "invalid_request" });
  }
});

test("accepts small bodies and rejects over-limit declared lengths", async () => {
  const small = await readPasswordResetBody(request('{"hello":"world"}'));
  assert.deepEqual(small, { ok: true, raw: '{"hello":"world"}' });
  const huge = request("hello", { "content-length": String(PASSWORD_RESET_REDEEM_MAX_BODY_BYTES + 1) });
  assert.deepEqual(await readPasswordResetBody(huge), { ok: false, reason: "request_too_large" });
  const invalid = request("hello", { "content-length": "not-a-number" });
  assert.deepEqual(await readPasswordResetBody(invalid), { ok: false, reason: "invalid_request" });
});

test("enforces actual streamed body cap even without trustworthy Content-Length", async () => {
  const limit = PASSWORD_RESET_REDEEM_MAX_BODY_BYTES;
  const oversized = request("a".repeat(limit + 1));
  assert.deepEqual(await readPasswordResetBody(oversized), { ok: false, reason: "request_too_large" });
  const boundary = request("a".repeat(limit));
  assert.equal((await readPasswordResetBody(boundary)).ok, true);
});

test("rate limit provides a finite per-IP cap", () => {
  assert.ok(PASSWORD_RESET_REDEEM_IP_MAX_REQUESTS >= 1);
  assert.ok(PASSWORD_RESET_REDEEM_IP_MAX_REQUESTS <= 20);
});

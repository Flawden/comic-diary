import assert from "node:assert/strict";
import test from "node:test";

import {
  REGISTRATION_ACTIVATION_REDEEM_IP_MAX_REQUESTS,
  REGISTRATION_ACTIVATION_REDEEM_MAX_BODY_BYTES,
  parseRegistrationActivationBody,
  readRegistrationActivationBody,
  registrationActivationRedeemEnabled,
  // @ts-expect-error TS5097: standalone Node type-stripping requires .ts; CI uses tsx.
} from "./registration-activation-http.ts";

const url = "https://example.invalid/api/auth/activate/redeem";
const token = "A".repeat(43);
const valid = { token, newPassword: "new-owner-password-2026", newPasswordConfirm: "new-owner-password-2026" };

function request(body: string, headers: HeadersInit = {}): Request {
  return new Request(url, { method: "POST", body, headers });
}

test("redemption is disabled without exact operator opt-in", () => {
  for (const value of [undefined, "", "1", "TRUE", " true ", "false", "on"]) {
    assert.equal(registrationActivationRedeemEnabled(value), false);
  }
  assert.equal(registrationActivationRedeemEnabled("true"), true);
});

test("exact payload with matching replacement passwords", () => {
  assert.deepEqual(parseRegistrationActivationBody(valid), { ok: true, token, newPassword: valid.newPassword });
  assert.deepEqual(parseRegistrationActivationBody({ ...valid, newPasswordConfirm: "wrong" }), { ok: false, reason: "password_mismatch" });
});

test("malformed or extraneous fields are rejected", () => {
  for (const bad of [null, [], "string", {}, { ...valid, extra: "a" },
    { ...valid, token: 123 }, { ...valid, token: "B".repeat(42) },
    { ...valid, token: "?".repeat(43) }, { ...valid, newPassword: null },
    { ...valid, newPasswordConfirm: false }, { ...valid, newPassword: "" },
    { ...valid, newPassword: "😀".repeat(65), newPasswordConfirm: "😀".repeat(65) },
  ]) {
    assert.deepEqual(parseRegistrationActivationBody(bad), { ok: false, reason: "invalid_request" });
  }
});

test("enforces declared length, rejects malformed declared bytes", async () => {
  assert.deepEqual(await readRegistrationActivationBody(request("hello", { "content-length": "bogus" })), { ok: false, reason: "invalid_request" });
  assert.deepEqual(await readRegistrationActivationBody(request("hello", { "content-length": String(REGISTRATION_ACTIVATION_REDEEM_MAX_BODY_BYTES + 1) })), { ok: false, reason: "request_too_large" });
  assert.deepEqual(await readRegistrationActivationBody(request("hello", { "content-length": "00005" })), { ok: false, reason: "invalid_request" });
});

test("enforces actual streamed limit independent of the header", async () => {
  const boundary = "x".repeat(REGISTRATION_ACTIVATION_REDEEM_MAX_BODY_BYTES);
  assert.deepEqual(await readRegistrationActivationBody(request(boundary)), { ok: true, raw: boundary });
  assert.deepEqual(await readRegistrationActivationBody(request(boundary + "x")), { ok: false, reason: "request_too_large" });
});

test("limits activation token attempts per trusted IP", () => {
  assert.ok(REGISTRATION_ACTIVATION_REDEEM_IP_MAX_REQUESTS > 0);
  assert.ok(REGISTRATION_ACTIVATION_REDEEM_IP_MAX_REQUESTS <= 12);
});

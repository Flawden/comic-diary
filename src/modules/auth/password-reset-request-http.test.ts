import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_RESET_REQUEST_ACCOUNT_MAX_REQUESTS,
  PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS,
  PASSWORD_RESET_REQUEST_GENERIC_ACK,
  PASSWORD_RESET_REQUEST_IP_MAX_REQUESTS,
  PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
  PASSWORD_RESET_REQUEST_MAX_BODY_BYTES,
  parsePasswordResetRequestBody,
  passwordResetRequestEnabled,
  readPasswordResetRequestBody,
// @ts-expect-error TS5097: Node strip-types needs .ts; standalone test uses Node 22.
} from "./password-reset-request-http.ts";

const url = "https://example.invalid/api/auth/password-reset/request";
const request = (body: string, headers: HeadersInit = {}): Request =>
  new Request(url, { method: "POST", body, headers });

test("request is OFF unless exact operator flag is true", () => {
  for (const value of [undefined, "", "1", "TRUE", " true ", "false", "on"]) {
    assert.equal(passwordResetRequestEnabled(value), false);
  }
  assert.equal(passwordResetRequestEnabled("true"), true);
});

test("accepts only one email field; normalizes like registration", () => {
  assert.deepEqual(parsePasswordResetRequestBody({ email: " Alice@Example.COM " }),
    { ok: true, email: "alice@example.com" });
});

test("rejects malformed bodies, extra fields and control characters", () => {
  for (const value of [null, [], "text", {}, { email: 42 }, { email: null },
    { email: "a@b.c", debug: true }, { mail: "a@b.c" },
    { email: "" }, { email: "no-at" }, { email: "a@b@c" },
    { email: "x\ny@example.com" }, { email: "a\u0000@example.com" },
    { email: "a".repeat(321) + "@b.io" }]) {
    assert.deepEqual(parsePasswordResetRequestBody(value),
      { ok: false, reason: "invalid_request" });
  }
});

test("rejects overlong UTF-8 addresses", () => {
  const value = { email: "é".repeat(170) + "@example.com" };
  assert.deepEqual(parsePasswordResetRequestBody(value), { ok: false, reason: "invalid_request" });
});

test("accepts valid short streamed input", async () => {
  const body = '{"email":"reader@example.com"}';
  assert.deepEqual(await readPasswordResetRequestBody(request(body)), { ok: true, raw: body });
});

test("rejects malformed or excessive declared length", async () => {
  for (const length of ["invalid", "0001", "-1", "1.5"]) {
    assert.deepEqual(await readPasswordResetRequestBody(request("a", { "content-length": length })),
      { ok: false, reason: "invalid_request" });
  }
  assert.deepEqual(await readPasswordResetRequestBody(request("a", {
    "content-length": String(PASSWORD_RESET_REQUEST_MAX_BODY_BYTES + 1),
  })), { ok: false, reason: "request_too_large" });
});

test("enforces actual body limit independently of declared size", async () => {
  const boundary = "x".repeat(PASSWORD_RESET_REQUEST_MAX_BODY_BYTES);
  assert.deepEqual(await readPasswordResetRequestBody(request(boundary)), { ok: true, raw: boundary });
  assert.deepEqual(await readPasswordResetRequestBody(request(boundary + "x")),
    { ok: false, reason: "request_too_large" });
});

test("rate limits are bounded and IP/account scopes are distinct", () => {
  assert.ok(PASSWORD_RESET_REQUEST_IP_MAX_REQUESTS > 0 && PASSWORD_RESET_REQUEST_IP_MAX_REQUESTS <= 10);
  assert.ok(PASSWORD_RESET_REQUEST_ACCOUNT_MAX_REQUESTS > 0 && PASSWORD_RESET_REQUEST_ACCOUNT_MAX_REQUESTS <= 5);
  assert.ok(PASSWORD_RESET_REQUEST_IP_WINDOW_MS > 0);
  assert.ok(PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS >= PASSWORD_RESET_REQUEST_IP_WINDOW_MS);
});

test("generic acknowledgement never mentions whether account exists", () => {
  assert.match(PASSWORD_RESET_REQUEST_GENERIC_ACK, /Если для этого адреса/);
  assert.doesNotMatch(PASSWORD_RESET_REQUEST_GENERIC_ACK, /аккаунт найден|аккаунт не найден/i);
});

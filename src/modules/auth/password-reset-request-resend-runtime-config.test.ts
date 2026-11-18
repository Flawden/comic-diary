import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareRecoveryResendRuntimeCandidate } from "./password-reset-request-resend-runtime-config.ts";

const TEST_KEY = `re_${"A".repeat(30)}`; // Synthetic; not a credential.
const ready = () => ({
  AUTH_RECOVERY_RESEND_CONFIG_READY: "true",
  RESEND_API_KEY: TEST_KEY,
  AUTH_RECOVERY_FROM_ADDRESS: "no-reply@example.com",
  AUTH_RECOVERY_SENDER_DOMAIN: "example.com",
  AUTH_RECOVERY_PUBLIC_ORIGIN: "https://comic.example.com",
});

test("missing environment is OFF", () => {
  assert.equal(prepareRecoveryResendRuntimeCandidate(undefined), null);
  assert.equal(prepareRecoveryResendRuntimeCandidate(null), null);
  assert.equal(prepareRecoveryResendRuntimeCandidate({}), null);
});
test("explicit opt-in flag absent or unexpected is OFF", () => {
  for (const value of [undefined, "false", "TRUE", "1", "true ", "yes"]) {
    assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_RESEND_CONFIG_READY: value }), null);
  }
});
test("does not default an API key", () => {
  assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), RESEND_API_KEY: undefined }), null);
  assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), RESEND_API_KEY: "" }), null);
});
test("rejects placeholder and malformed API keys", () => {
  for (const key of ["put-your-key-here", "re_", "re_short", " re_" + "A".repeat(30), TEST_KEY + "\n", "sk_" + "A".repeat(30)]) {
    assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), RESEND_API_KEY: key }), null);
  }
});
test("requires sender settings", () => {
  assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_FROM_ADDRESS: "" }), null);
  assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_SENDER_DOMAIN: undefined }), null);
});
test("rejects sender mismatch", () => {
  assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_FROM_ADDRESS: "no-reply@other.com" }), null);
});
test("rejects invalid domains and headers", () => {
  for (const domain of ["EXAMPLE.COM", "localhost", "bad..com", "-bad.com", "example.com\r\nBcc:x@t.co"]) {
    assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_SENDER_DOMAIN: domain }), null);
  }
});
test("rejects malformed from-address", () => {
  for (const addr of ["a..b@example.com", "a b@example.com", "Name <a@example.com>", "x@example.com\r\n", "@example.com"]) {
    assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_FROM_ADDRESS: addr }), null);
  }
});
test("requires HTTPS origin", () => {
  assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_PUBLIC_ORIGIN: "http://comic.example.com" }), null);
});
test("rejects origins with path, query, fragments, credentials, or whitespace", () => {
  for (const origin of ["https://comic.example.com/abc", "https://comic.example.com/", "https://comic.example.com?a=1", "https://comic.example.com#foo", "https://a:b@comic.example.com", " https://comic.example.com"]) {
    assert.equal(prepareRecoveryResendRuntimeCandidate({ ...ready(), AUTH_RECOVERY_PUBLIC_ORIGIN: origin }), null);
  }
});
test("returns only a frozen configuration candidate", () => {
  const config = prepareRecoveryResendRuntimeCandidate(ready());
  assert.ok(config);
  assert.deepEqual(config, {
    apiKey: TEST_KEY,
    fromAddress: "no-reply@example.com",
    senderDomain: "example.com",
    publicOrigin: "https://comic.example.com",
  });
  assert.equal(Object.isFrozen(config), true);
});
test("does not mutate the provided environment", () => {
  const env = Object.freeze(ready());
  assert.ok(prepareRecoveryResendRuntimeCandidate(env));
  assert.deepEqual(env, ready());
});
test("does not read ambient process.env", () => {
  assert.equal(prepareRecoveryResendRuntimeCandidate({}), null);
});
test("malicious property getters fail closed", () => {
  const env = Object.create(null);
  Object.defineProperty(env, "AUTH_RECOVERY_RESEND_CONFIG_READY", { get() { throw new Error("secret must not escape"); } });
  assert.equal(prepareRecoveryResendRuntimeCandidate(env), null);
});
test("a ready candidate is NOT a send permit", () => {
  const config = prepareRecoveryResendRuntimeCandidate(ready());
  assert.ok(config);
  assert.equal("sendAuthorized" in config, false);
  assert.equal("http" in config, false);
  assert.equal("operatorTestPermit" in config, false);
});

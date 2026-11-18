import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  isRecoveryRequestAllowed,
  readRecoveryRequestOutboxKey,
} from "./password-reset-request-config.ts";

const validKey = randomBytes(32).toString("base64");
const env = {
  PASSWORD_RESET_REQUEST_ENABLED: "true",
  PASSWORD_RESET_REQUEST_MAIL_READY: "true",
  PASSWORD_RESET_OUTBOX_KEY_ID: "reset_v1",
  PASSWORD_RESET_OUTBOX_KEY_BASE64: validKey,
};

test("independent request and readiness switches are both OFF by default", () => {
  assert.equal(isRecoveryRequestAllowed({}), false);
  assert.equal(isRecoveryRequestAllowed({ PASSWORD_RESET_REQUEST_ENABLED: "true" }), false);
  assert.equal(isRecoveryRequestAllowed({ PASSWORD_RESET_REQUEST_MAIL_READY: "true" }), false);
  assert.equal(isRecoveryRequestAllowed({ ...env, PASSWORD_RESET_REQUEST_ENABLED: "TRUE" }), false);
  assert.equal(isRecoveryRequestAllowed({ ...env, PASSWORD_RESET_REQUEST_MAIL_READY: "true " }), false);
  assert.equal(isRecoveryRequestAllowed(env), true);
});

test("accepts only an exact canonical 32-byte AES key", () => {
  const key = readRecoveryRequestOutboxKey(env);
  assert.ok(key);
  assert.equal(key.keyId, "reset_v1");
  assert.equal(Buffer.from(key.bytes).toString("base64"), validKey);
  key.bytes.fill(0);
});

test("rejects missing, weak, padded incorrectly or noncanonical encryption keys", () => {
  const bad = [undefined, "", "invalid", Buffer.alloc(16).toString("base64"),
    validKey.replace(/=$/, ""), ` ${validKey}`, `${validKey}\n`, `${validKey.slice(0, 43)}_`];
  for (const encoded of bad) {
    assert.equal(readRecoveryRequestOutboxKey({ ...env, PASSWORD_RESET_OUTBOX_KEY_BASE64: encoded }) === null, true);
  }
});

test("rejects malformed key identifiers and never falls back to a default key", () => {
  for (const keyId of [undefined, "", "ABC", "a/b", " leading", "x".repeat(65)]) {
    assert.equal(readRecoveryRequestOutboxKey({ ...env, PASSWORD_RESET_OUTBOX_KEY_ID: keyId }), null);
  }
  assert.equal(readRecoveryRequestOutboxKey({}), null);
});

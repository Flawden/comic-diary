import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
// @ts-expect-error TS5097: Node 22 strip-types executes .ts, compiled code resolves extensionless imports.
import { sealPasswordResetMailOutboxPayload as seal, unsealPasswordResetMailOutboxPayload as open } from "./password-reset-request-outbox-crypto.ts";

const now = new Date("2026-11-17T12:00:00.000Z");
const expiresAt = new Date(now.getTime() + 20 * 60_000);
const binding = { passwordResetTokenId: 123, idempotencyKey: Buffer.alloc(24, 7).toString("base64url"), expiresAt };
const key = { keyId: "reset_2026_11", bytes: Buffer.alloc(32, 11) };
const keys = new Map([[key.keyId, key.bytes]]);
const input = { email: "user@example.invalid", token: Buffer.alloc(32, 18).toString("base64url"), publicOrigin: "https://comic.example.invalid", expiresAt };
function encrypted() { const result = seal(input, binding, key, now); assert.ok(result); return result; }

test("roundtrip binds locked mailbox, code, recovery id, expiry and origin", () => {
  const value = encrypted();
  assert.deepEqual(open(value, binding, keys, now), input);
  assert.match(value.payloadNonce, /^[A-Za-z0-9_-]{16}$/);
  assert.match(value.payloadDigest, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(value).includes(input.token));
  assert.ok(!JSON.stringify(value).includes(input.email));
});
test("fresh 96-bit nonces differ on repeat encryption", () => {
  assert.notEqual(encrypted().payloadNonce, encrypted().payloadNonce);
});
test("cannot replay ciphertext against another password reset token", () => {
  assert.equal(open(encrypted(), { ...binding, passwordResetTokenId: 124 }, keys, now), null);
});
test("idempotency and expiry are AEAD-bound", () => {
  const value = encrypted();
  assert.equal(open(value, { ...binding, idempotencyKey: Buffer.alloc(24, 8).toString("base64url") }, keys, now), null);
  assert.equal(open(value, { ...binding, expiresAt: new Date(expiresAt.getTime() - 1) }, keys, now), null);
});
test("key changes and key-id substitution fail closed", () => {
  const value = encrypted();
  assert.equal(open(value, binding, new Map(), now), null);
  assert.equal(open(value, binding, new Map([[key.keyId, Buffer.alloc(32, 9)]]), now), null);
  assert.equal(open({ ...value, payloadKeyId: "other" }, binding, new Map([["other", key.bytes]]), now), null);
});
test("ciphertext tampering fails even if public digest is recomputed", () => {
  const value = encrypted();
  const bytes = Buffer.from(value.payloadCiphertext, "base64url"); bytes[bytes.length - 1] ^= 1;
  const payloadCiphertext = bytes.toString("base64url");
  const payloadDigest = createHash("sha256").update(payloadCiphertext, "ascii").digest("hex");
  assert.equal(open({ ...value, payloadCiphertext, payloadDigest }, binding, keys, now), null);
});
test("nonce, digest, tag and malformed shape fail closed", () => {
  const value = encrypted();
  assert.equal(open({ ...value, payloadNonce: Buffer.alloc(12, 7).toString("base64url") }, binding, keys, now), null);
  assert.equal(open({ ...value, payloadDigest: "0".repeat(64) }, binding, keys, now), null);
  assert.equal(open({ ...value, unexpected: true } as never, binding, keys, now), null);
  assert.equal(open(null as never, binding, keys, now), null);
});
test("rejects malformed recipient, token, origin and expiry on seal", () => {
  for (const candidate of [
    { ...input, email: "x\nBcc: attacker@example.invalid" },
    { ...input, token: "bad" },
    { ...input, publicOrigin: "http://comic.example.invalid" },
    { ...input, publicOrigin: "https://comic.example.invalid/path" },
    { ...input, publicOrigin: "https://comic.example.invalid/" },
    { ...input, expiresAt: new Date(expiresAt.getTime() + 10) },
  ]) assert.equal(seal(candidate, binding, key, now), null);
});
test("no seal or unseal at last minute / expiration", () => {
  const value = encrypted();
  const tooLate = new Date(expiresAt.getTime() - 60_000);
  assert.equal(seal(input, binding, key, tooLate), null);
  assert.equal(open(value, binding, keys, tooLate), null);
  assert.equal(open(value, binding, keys, expiresAt), null);
});
test("rejects bad key and binding metadata", () => {
  assert.equal(seal(input, binding, { ...key, bytes: Buffer.alloc(16) }, now), null);
  assert.equal(seal(input, binding, { ...key, keyId: "../bad" }, now), null);
  assert.equal(seal(input, { ...binding, passwordResetTokenId: 0 }, key, now), null);
  assert.equal(seal(input, { ...binding, idempotencyKey: "bad" }, key, now), null);
});
test("envelope cannot leak external encryption key", () => {
  const value = encrypted();
  assert.deepEqual(Object.keys(value).sort(), ["payloadCiphertext", "payloadDigest", "payloadKeyId", "payloadNonce"]);
  assert.ok(!JSON.stringify(value).includes(Buffer.from(key.bytes).toString("hex")));
});

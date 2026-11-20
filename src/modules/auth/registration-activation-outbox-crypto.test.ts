import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
// @ts-expect-error TS5097: standalone Node 22 strip-types uses .ts; CI uses tsx.
import { sealActivationMailOutboxPayload as seal, unsealActivationMailOutboxPayload as open } from "./registration-activation-outbox-crypto.ts";

const now = new Date("2026-11-16T12:00:00.000Z");
const expiresAt = new Date(now.getTime() + 30 * 60_000);
const binding = {
  verificationTokenId: 43,
  idempotencyKey: Buffer.alloc(24, 9).toString("base64url"),
  expiresAt,
};
const key = { keyId: "activation_2026_11", bytes: Buffer.alloc(32, 15) };
const keys = new Map([[key.keyId, key.bytes]]);
const input = {
  email: "recipient@example.invalid",
  token: Buffer.alloc(32, 29).toString("base64url"),
  publicOrigin: "https://comic.example.invalid",
  expiresAt,
};
const encrypted = () => {
  const e = seal(input, binding, key, now);
  assert.ok(e);
  return e;
};

test("round trip binds exactly one token, mailbox, expiry, origin, and key id", () => {
  const e = encrypted();
  assert.deepEqual(open(e, binding, keys, now), input);
  assert.match(e.payloadNonce, /^[A-Za-z0-9_-]{16}$/);
  assert.match(e.payloadDigest, /^[0-9a-f]{64}$/);
  assert.equal(e.payloadKeyId, key.keyId);
  assert.ok(!JSON.stringify(e).includes(input.token));
  assert.ok(!JSON.stringify(e).includes(input.email));
});

test("fresh unpredictable nonce produces different ciphertext under same key", () => {
  const a = encrypted(); const b = encrypted();
  assert.notEqual(a.payloadNonce, b.payloadNonce);
  assert.notEqual(a.payloadCiphertext, b.payloadCiphertext);
});

test("wrong token issuance id fails authenticated metadata binding", () => {
  const e = encrypted();
  assert.equal(open(e, { ...binding, verificationTokenId: 44 }, keys, now), null);
});

test("wrong idempotency key fails", () => {
  const e = encrypted();
  assert.equal(open(e, { ...binding, idempotencyKey: Buffer.alloc(24, 8).toString("base64url") }, keys, now), null);
});

test("wrong expiry fails even with an otherwise valid time", () => {
  const e = encrypted();
  assert.equal(open(e, { ...binding, expiresAt: new Date(expiresAt.getTime() - 1000) }, keys, now), null);
});

test("missing, wrong or retired encryption key fails closed", () => {
  const e = encrypted();
  assert.equal(open(e, binding, new Map(), now), null);
  assert.equal(open(e, binding, new Map([[key.keyId, Buffer.alloc(32, 16)]]), now), null);
  assert.equal(open(e, binding, new Map([[key.keyId, Buffer.alloc(16)]]), now), null);
});

test("malicious key id substitution cannot cross auth boundary", () => {
  const e = encrypted();
  assert.equal(open({ ...e, payloadKeyId: "other" }, binding, new Map([["other", key.bytes]]), now), null);
});

test("ciphertext change and forged unkeyed digest still fail GCM authentication", () => {
  const e = encrypted();
  const flipped = e.payloadCiphertext.slice(0, -1) + (e.payloadCiphertext.endsWith("A") ? "B" : "A");
  assert.equal(open({ ...e, payloadCiphertext: flipped,
    payloadDigest: createHash("sha256").update(flipped, "ascii").digest("hex") }, binding, keys, now), null);
});

test("digest, nonce and GCM tag tampering fail closed", () => {
  const e = encrypted();
  assert.equal(open({ ...e, payloadDigest: "0".repeat(64) }, binding, keys, now), null);
  assert.equal(open({ ...e, payloadNonce: Buffer.alloc(12, 3).toString("base64url") }, binding, keys, now), null);
  const bytes = Buffer.from(e.payloadCiphertext, "base64url");
  bytes[bytes.length-1] ^= 1;
  const modified = bytes.toString("base64url");
  assert.equal(open({ ...e, payloadCiphertext: modified,
    payloadDigest: createHash("sha256").update(modified, "ascii").digest("hex") }, binding, keys, now), null);
});

test("invalid recipient, token, origin and expiry cannot be sealed", () => {
  for (const x of [
    { ...input, email: "x\nBcc: attacker@example.invalid" },
    { ...input, token: "not-a-real-code" },
    { ...input, publicOrigin: "http://comic.example.invalid" },
    { ...input, publicOrigin: "https://comic.example.invalid/path" },
    { ...input, expiresAt: new Date(expiresAt.getTime() + 1) },
  ]) assert.equal(seal(x, binding, key, now), null);
});

test("expired and nearly expired input cannot be sealed or unsealed", () => {
  const e = encrypted();
  const late = new Date(expiresAt.getTime() - 60_000);
  assert.equal(seal(input, binding, key, late), null);
  assert.equal(open(e, binding, keys, late), null);
  assert.equal(open(e, binding, keys, expiresAt), null);
});

test("invalid or dangerous binding metadata rejected", () => {
  const e = encrypted();
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(seal(input, { ...binding, verificationTokenId: id }, key, now), null);
  }
  assert.equal(seal(input, { ...binding, idempotencyKey: "x" }, key, now), null);
  assert.equal(seal(input, { ...binding, expiresAt: new Date(NaN) }, key, now), null);
  assert.equal(open(e, { ...binding, verificationTokenId: 0 }, keys, now), null);
});

test("invalid key bytes or key identifier rejected", () => {
  assert.equal(seal(input, binding, { ...key, bytes: Buffer.alloc(16) }, now), null);
  assert.equal(seal(input, binding, { ...key, keyId: "../../bad" }, now), null);
  assert.equal(seal(input, binding, { ...key, keyId: "BAD" }, now), null);
});

test("malformed envelope, extra fields and noncanonical base64url rejected", () => {
  const e = encrypted();
  assert.equal(open({ ...e, payloadCiphertext: e.payloadCiphertext + "=" }, binding, keys, now), null);
  assert.equal(open({ ...e, payloadNonce: "?".repeat(16) }, binding, keys, now), null);
  assert.equal(open({ ...e, unexpected: "email" } as never, binding, keys, now), null);
  assert.equal(open(null as never, binding, keys, now), null);
});

test("no key material is stored in the envelope", () => {
  const e = encrypted();
  assert.deepEqual(Object.keys(e).sort(), ["payloadCiphertext", "payloadDigest", "payloadKeyId", "payloadNonce"]);
  assert.ok(!JSON.stringify(e).includes(Buffer.from(key.bytes).toString("hex")));
});

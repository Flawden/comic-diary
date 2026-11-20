import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
// @ts-expect-error TS5097: standalone Node 22 strip-types needs .ts; CI uses tsx.
import { preflightClaimedActivationMailDryRun as preflight } from "./registration-activation-outbox-dry-run.ts";
// @ts-expect-error TS5097: standalone Node 22 strip-types needs .ts; CI uses tsx.
import { hashEmailVerificationToken } from "./email-verification-token.ts";
// @ts-expect-error TS5097: standalone Node 22 strip-types needs .ts; CI uses tsx.
import { sealActivationMailOutboxPayload } from "./registration-activation-outbox-crypto.ts";

const now = new Date("2026-11-17T12:00:00.000Z");
const expiration = new Date(now.getTime() + 20 * 60_000);
const token = randomBytes(32).toString("base64url");
const key = { keyId: "test_only_v1", bytes: randomBytes(32) };
const idempotencyKey = randomBytes(24).toString("base64url");
const claimId = randomBytes(24).toString("base64url");
const email = "recipient@example.invalid";
const origin = "https://comic.example.invalid";
const envelope = sealActivationMailOutboxPayload({
  email, token, publicOrigin: origin, expiresAt: expiration,
}, { verificationTokenId: 17, idempotencyKey, expiresAt: expiration }, key, now);
assert.ok(envelope);
const snapshot = {
  account: {
    id: 4, email, passwordHash: "test-hash-not-a-password", isActive: true,
    emailVerifiedAt: null, verificationRequiredAt: new Date(now.getTime() - 10_000),
  },
  token: {
    id: 17, userId: 4, emailSnapshot: email, tokenHash: hashEmailVerificationToken(token)!,
    createdAt: new Date(now.getTime() - 5_000), expiresAt: expiration,
    consumedAt: null, revokedAt: null,
  },
  outbox: {
    id: 101, verificationTokenId: 17, idempotencyKey,
    state: "in_flight", claimId, attemptCount: 1,
    createdAt: new Date(now.getTime() - 4_000), claimedAt: new Date(now.getTime() - 1_000),
    expiresAt: expiration, finalizedAt: null, providerMessageId: null,
    ...envelope,
  },
};
const input = () => ({
  snapshot, claimId, expectedPublicOrigin: origin, operatorDryRunEnabled: true,
  keys: new Map([[key.keyId, key.bytes]]), now,
});
const blocked = Object.freeze({ status: "blocked", sendAuthorized: false });
const eligible = Object.freeze({ status: "eligible_snapshot", sendAuthorized: false });
test("synthetic valid snapshot is eligible ONLY for offline inspection", () => {
  const result = preflight(input());
  assert.deepEqual(result, eligible);
  assert.deepEqual(Object.keys(result).sort(), ["sendAuthorized", "status"]);
  assert.ok(!JSON.stringify(result).includes(email));
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes(envelope!.payloadCiphertext));
});
test("operator switch defaults closed, never grants send permission", () => {
  assert.deepEqual(preflight({ ...input(), operatorDryRunEnabled: false }), blocked);
  assert.deepEqual(preflight({ ...input(), operatorDryRunEnabled: "true" as never }), blocked);
  assert.deepEqual(preflight(null as never), blocked);
});
test("revoked/consumed token or already verified/disabled account always blocked", () => {
  for (const patch of [
    { token: { revokedAt: now } }, { token: { consumedAt: now } },
    { account: { emailVerifiedAt: now } }, { account: { isActive: false } },
    { account: { verificationRequiredAt: null } }, { account: { passwordHash: null } },
  ]) {
    const changed = {
      account: { ...snapshot.account, ...(patch.account ?? {}) },
      token: { ...snapshot.token, ...(patch.token ?? {}) }, outbox: snapshot.outbox,
    };
    assert.deepEqual(preflight({ ...input(), snapshot: changed }), blocked);
  }
});
test("mailbox changes, token ownership changes, wrong hash and token id blocked", () => {
  for (const s of [
    { ...snapshot, account: { ...snapshot.account, email: "changed@example.invalid" } },
    { ...snapshot, token: { ...snapshot.token, emailSnapshot: "changed@example.invalid" } },
    { ...snapshot, token: { ...snapshot.token, userId: 999 } },
    { ...snapshot, token: { ...snapshot.token, tokenHash: "0".repeat(64) } },
    { ...snapshot, outbox: { ...snapshot.outbox, verificationTokenId: 18 } },
  ]) assert.deepEqual(preflight({ ...input(), snapshot: s }), blocked);
});
test("missing key, wrong key, tampered envelope, binding and origin blocked", () => {
  for (const i of [
    { ...input(), keys: new Map() },
    { ...input(), keys: new Map([[key.keyId, randomBytes(32)]]) },
    { ...input(), expectedPublicOrigin: "https://other.example.invalid" },
    { ...input(), expectedPublicOrigin: "http://comic.example.invalid" },
    { ...input(), snapshot: { ...snapshot, outbox: { ...snapshot.outbox, idempotencyKey: randomBytes(24).toString("base64url") } } },
    { ...input(), snapshot: { ...snapshot, outbox: { ...snapshot.outbox, payloadDigest: "0".repeat(64) } } },
    { ...input(), snapshot: { ...snapshot, outbox: { ...snapshot.outbox, payloadKeyId: "missing" } } },
  ]) assert.deepEqual(preflight(i), blocked);
});
test("expired, nearly expired and implausible timelines are blocked", () => {
  for (const t of [
    new Date(expiration.getTime() - 60_000), expiration,
    new Date(now.getTime() - 5_000), new Date(NaN),
  ]) assert.deepEqual(preflight({ ...input(), now: t }), blocked);
  for (const o of [
    { claimedAt: new Date(now.getTime() + 1) },
    { claimedAt: new Date(now.getTime() - 60_000) },
    { expiresAt: new Date(expiration.getTime() + 1) },
  ]) assert.deepEqual(preflight({ ...input(), snapshot: { ...snapshot, outbox: { ...snapshot.outbox, ...o } } }), blocked);
});
test("only matching durable active claim can be inspected", () => {
  assert.deepEqual(preflight({ ...input(), claimId: randomBytes(24).toString("base64url") }), blocked);
  for (const o of [
    { state: "ready" }, { state: "accepted" }, { state: "uncertain" },
    { attemptCount: 2 }, { finalizedAt: now }, { providerMessageId: "a" },
    { claimId: "fake" },
  ]) assert.deepEqual(preflight({ ...input(), snapshot: { ...snapshot, outbox: { ...snapshot.outbox, ...o } } }), blocked);
});
test("never returns secret or mutable authorisation object", () => {
  const result = preflight(input());
  assert.ok(Object.isFrozen(result));
  assert.equal(result.sendAuthorized, false);
  assert.ok(!("to" in result));
  assert.ok(!("token" in result));
  assert.ok(!("message" in result));
});

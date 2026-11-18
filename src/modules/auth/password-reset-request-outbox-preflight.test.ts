/** AUTH-01 R1C2C1: PURE synthetic AEAD snapshots. NO DB, IO, secrets or mail. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
// @ts-expect-error TS5097: Node 22 direct strip-types requires .ts.
import { preflightClaimedPasswordResetMailDryRun as preflight, type RecoveryPreflightAccount, type RecoveryPreflightToken, type RecoveryPreflightOutbox } from "./password-reset-request-outbox-preflight.ts";
// @ts-expect-error TS5097: Node 22 direct strip-types requires .ts.
import { sealPasswordResetMailOutboxPayload } from "./password-reset-request-outbox-crypto.ts";
// @ts-expect-error TS5097: Node 22 direct strip-types requires .ts.
import { hashPasswordResetToken } from "./password-reset-token.ts";

const origin = "https://comic-diary.invalid";
const now = new Date("2026-11-18T09:10:00.000Z");
const issuance = new Date("2026-11-18T09:00:00.000Z");
const expiry = new Date("2026-11-18T09:20:00.000Z");
const claim = new Date("2026-11-18T09:05:00.000Z");
const verified = new Date("2026-11-17T12:00:00.000Z");
const email = "verified@example.invalid";
const code = Buffer.alloc(32, 21).toString("base64url");
const claimId = Buffer.alloc(24, 22).toString("base64url");
const idempotencyKey = Buffer.alloc(24, 23).toString("base64url");
const key = { keyId: "ci_offline_only", bytes: Buffer.alloc(32, 24) };
const keys = new Map([[key.keyId, key.bytes]]);

type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type Snapshot = { account: Mutable<RecoveryPreflightAccount>; token: Mutable<RecoveryPreflightToken>; outbox: Mutable<RecoveryPreflightOutbox> };
type TestInput = { snapshot: Snapshot; claimId: string; expectedPublicOrigin: string; operatorDryRunEnabled: boolean; keys: ReadonlyMap<string, Uint8Array>; now: Date };
function fixture(): TestInput {
  const binding = { passwordResetTokenId: 29, idempotencyKey, expiresAt: expiry };
  const envelope = sealPasswordResetMailOutboxPayload({
    email, token: code, publicOrigin: origin, expiresAt: expiry,
  }, binding, key, issuance);
  assert.ok(envelope, "synthetic envelope must seal");
  const snapshot: Snapshot = {
    account: { id: 7, email, passwordHash: "ci-hash-not-real", isActive: true, emailVerifiedAt: verified },
    token: { id: 29, userId: 7, tokenHash: hashPasswordResetToken(code)!,
      createdAt: issuance, expiresAt: expiry, consumedAt: null, revokedAt: null },
    outbox: { id: 41, passwordResetTokenId: 29, idempotencyKey, state: "in_flight", claimId,
      attemptCount: 1, createdAt: issuance, claimedAt: claim, expiresAt: expiry,
      finalizedAt: null, ...envelope },
  };
  return { snapshot, claimId, expectedPublicOrigin: origin,
    operatorDryRunEnabled: true, keys, now };
}
const BLOCKED = { status: "blocked", sendAuthorized: false };
const ELIGIBLE = { status: "eligible_snapshot", sendAuthorized: false };
const clone = () => fixture();

function blockedWith(mutate: (value: ReturnType<typeof fixture>) => void) {
  const input = clone();
  mutate(input);
  assert.deepEqual(preflight(input), BLOCKED);
}

test("valid encrypted snapshot is eligibility ONLY, never dispatch authorization", () => {
  assert.deepEqual(preflight(fixture()), ELIGIBLE);
  assert.deepEqual(Object.keys(preflight(fixture())).sort(), ["sendAuthorized", "status"]);
  assert.doesNotMatch(JSON.stringify(preflight(fixture())), /verified@example|ci-hash-not-real/);
});
test("disabled or nonboolean operator flag fails closed", () => {
  for (const value of [false, undefined, 1, "true", null])
    blockedWith((x) => { x.operatorDryRunEnabled = value as boolean; });
});
test("unknown or extra input fields fail closed", () => {
  assert.deepEqual(preflight(null as unknown as ReturnType<typeof fixture>), BLOCKED);
  const x = clone(); const inputWithExtraField = { ...x, extra: true };
  assert.deepEqual(preflight(inputWithExtraField), BLOCKED);
});
test("account inactive, no password, unverified, invalid account link", () => {
  blockedWith((x) => { x.snapshot.account.isActive = false; });
  blockedWith((x) => { x.snapshot.account.passwordHash = null; });
  blockedWith((x) => { x.snapshot.account.emailVerifiedAt = null; });
  blockedWith((x) => { x.snapshot.token.userId = 8; });
});
test("mailbox reverified after token issuance blocks", () => {
  blockedWith((x) => { x.snapshot.account.emailVerifiedAt = new Date(issuance.getTime()+1); });
});
test("changed current verified mailbox blocks decrypted recipient mismatch", () => {
  blockedWith((x) => { x.snapshot.account.email = "changed@example.invalid"; });
});
test("consumed or revoked token blocks", () => {
  blockedWith((x) => { x.snapshot.token.consumedAt = new Date(issuance); });
  blockedWith((x) => { x.snapshot.token.revokedAt = new Date(issuance); });
});
test("wrong raw code hash and outbox/token relationships block", () => {
  blockedWith((x) => { x.snapshot.token.tokenHash = "f".repeat(64); });
  blockedWith((x) => { x.snapshot.outbox.passwordResetTokenId += 1; });
  blockedWith((x) => { x.snapshot.token.id += 1; });
});
test("wrong or noncanonical claim and idempotency keys block", () => {
  blockedWith((x) => { x.claimId = randomBytes(24).toString("base64url"); });
  blockedWith((x) => { x.claimId = "_" + claimId.slice(1); });
  blockedWith((x) => { x.snapshot.outbox.claimId = null; });
  blockedWith((x) => { x.snapshot.outbox.idempotencyKey = randomBytes(24).toString("base64url"); });
});
test("READY, terminal, attemptCount 2 and finalization block", () => {
  for (const state of ["ready", "accepted", "uncertain", "expired", "rejected"])
    blockedWith((x) => { x.snapshot.outbox.state = state; });
  blockedWith((x) => { x.snapshot.outbox.attemptCount = 2; });
  blockedWith((x) => { x.snapshot.outbox.finalizedAt = claim; });
});
test("expired or nearly-expired token blocks", () => {
  blockedWith((x) => { x.now = new Date(expiry.getTime()-60_000); });
  blockedWith((x) => { x.now = new Date(expiry); });
  blockedWith((x) => { x.now = new Date(expiry.getTime()+1); });
});
test("implausible expiry or mismatched outbox expiry blocks", () => {
  blockedWith((x) => { x.snapshot.outbox.expiresAt = new Date(expiry.getTime()-1); });
  blockedWith((x) => { x.snapshot.token.expiresAt = new Date(issuance.getTime()+21*60_000); });
});
test("claim ordering, future claim and invalid timestamps block", () => {
  blockedWith((x) => { x.snapshot.outbox.claimedAt = new Date(issuance.getTime()-1); });
  blockedWith((x) => { x.snapshot.outbox.claimedAt = new Date(now.getTime()+1); });
  blockedWith((x) => { x.snapshot.token.createdAt = new Date(issuance.getTime()+1); });
  blockedWith((x) => { x.snapshot.outbox.claimedAt = new Date(NaN); });
  blockedWith((x) => { x.snapshot.outbox.createdAt = new Date(NaN); });
});
test("untrusted public origin, cross-origin replay and malformed origin block", () => {
  blockedWith((x) => { x.expectedPublicOrigin = "https://attacker.invalid"; });
  blockedWith((x) => { x.expectedPublicOrigin = "http://comic-diary.invalid"; });
  blockedWith((x) => { x.expectedPublicOrigin = "https://comic-diary.invalid/evil"; });
});
test("tampered AEAD ciphertext, tag/digest and nonce block", () => {
  blockedWith((x) => { x.snapshot.outbox.payloadDigest = "0".repeat(64); });
  blockedWith((x) => { x.snapshot.outbox.payloadNonce = "A".repeat(16); });
  blockedWith((x) => { x.snapshot.outbox.payloadCiphertext += "A"; });
});
test("missing/wrong AEAD decryption key blocks", () => {
  blockedWith((x) => { x.keys = new Map(); });
  blockedWith((x) => { x.keys = new Map([[key.keyId, Buffer.alloc(32, 11)]]); });
});
test("fail closed for malformed snapshot and arbitrary secret-bearing input", () => {
  blockedWith((x) => { x.snapshot = {} as typeof x.snapshot; });
  blockedWith((x) => { x.snapshot.outbox = {} as typeof x.snapshot.outbox; });
  blockedWith((x) => { x.snapshot.account.id = Number.MAX_SAFE_INTEGER; });
});
test("no recipient, raw code, ciphertext or mail body is ever returned", () => {
  const out = JSON.stringify(preflight(fixture()));
  for (const secret of [email, code, fixture().snapshot.outbox.payloadCiphertext, "восстановление пароля"])
    assert.ok(!out.includes(secret));
  assert.equal(ELIGIBLE.sendAuthorized, false);
});

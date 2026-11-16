import assert from "node:assert/strict";
import test from "node:test";

import {
  canIssueEmailVerification,
  canRedeemEmailVerification,
  type VerificationAccount,
  type VerificationChallenge,
} from "./email-verification-policy.ts";

const createdAt = new Date("2026-11-16T03:00:00Z");
const expiresAt = new Date("2026-11-16T03:30:00Z");
const now = new Date("2026-11-16T03:15:00Z");

function account(overrides: Partial<VerificationAccount> = {}): VerificationAccount {
  return {
    id: 17,
    email: "reader@example.test",
    passwordHash: "encoded-valid-credential",
    isActive: true,
    emailVerifiedAt: null,
    ...overrides,
  };
}
function challenge(overrides: Partial<VerificationChallenge> = {}): VerificationChallenge {
  return {
    id: 44,
    userId: 17,
    emailSnapshot: "reader@example.test",
    createdAt,
    expiresAt,
    consumedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

test("active unverified password account is eligible for issue and redemption", () => {
  assert.equal(canIssueEmailVerification(account()), true);
  assert.equal(canRedeemEmailVerification(account(), challenge(), now), true);
});

test("verified, inactive, legacy passwordless and malformed accounts fail closed", () => {
  for (const a of [
    null, undefined, account({ isActive: false }), account({ passwordHash: null }),
    account({ passwordHash: "" }), account({ emailVerifiedAt: now }),
    account({ id: 0 }), account({ email: "" }), account({ email: "bad-email" }),
  ]) {
    assert.equal(canIssueEmailVerification(a), false);
    assert.equal(canRedeemEmailVerification(a, challenge(), now), false);
  }
});

test("email snapshot must match EXACT current mailbox", () => {
  assert.equal(canRedeemEmailVerification(account({ email: "another@example.test" }), challenge(), now), false);
  assert.equal(canRedeemEmailVerification(account(), challenge({ emailSnapshot: "Reader@example.test" }), now), false);
  assert.equal(canRedeemEmailVerification(account(), challenge({ emailSnapshot: "another@example.test" }), now), false);
});

test("challenge must belong to that account and exist", () => {
  assert.equal(canRedeemEmailVerification(account(), null, now), false);
  assert.equal(canRedeemEmailVerification(account(), challenge({ userId: 18 }), now), false);
  assert.equal(canRedeemEmailVerification(account(), challenge({ id: -1 }), now), false);
});

test("consumed or revoked tokens are never redeemable", () => {
  assert.equal(canRedeemEmailVerification(account(), challenge({ consumedAt: now }), now), false);
  assert.equal(canRedeemEmailVerification(account(), challenge({ revokedAt: now }), now), false);
});

test("expiration is inclusive and future issuance is denied", () => {
  assert.equal(canRedeemEmailVerification(account(), challenge(), new Date(expiresAt.getTime() - 1)), true);
  assert.equal(canRedeemEmailVerification(account(), challenge(), expiresAt), false);
  assert.equal(canRedeemEmailVerification(account(), challenge(), new Date(expiresAt.getTime() + 1)), false);
  assert.equal(canRedeemEmailVerification(account(), challenge(), new Date(createdAt.getTime() - 1)), false);
});

test("invalid timestamps, reversed interval, and missing challenge fail closed", () => {
  assert.equal(canRedeemEmailVerification(account(), challenge({ createdAt: new Date(NaN) }), now), false);
  assert.equal(canRedeemEmailVerification(account(), challenge({ expiresAt: new Date(NaN) }), now), false);
  assert.equal(canRedeemEmailVerification(account(), challenge(), new Date(NaN)), false);
  assert.equal(canRedeemEmailVerification(account(), challenge({ expiresAt: createdAt }), now), false);
});

test("verification marker does not grant a fresh verification token", () => {
  const verified = account({ emailVerifiedAt: new Date(createdAt.getTime() - 1) });
  assert.equal(canIssueEmailVerification(verified), false);
  assert.equal(canRedeemEmailVerification(verified, challenge(), now), false);
});

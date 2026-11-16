import assert from "node:assert/strict";
import test from "node:test";

import {
  getActivationState, canUseFullAccountSession, needsSecurePendingActivation,
  // @ts-expect-error TS5097: standalone Node type-stripping requires .ts; CI uses tsx.
} from "./registration-activation-policy.ts";

const date = new Date("2026-11-16T07:00:00Z");
const legacy = { isActive: true, emailVerifiedAt: null, verificationRequiredAt: null };
const pending = { ...legacy, verificationRequiredAt: date };
const verified = { ...pending, emailVerifiedAt: date };

test("historical unverified accounts keep session eligibility, not mailbox trust", () => {
  assert.equal(getActivationState(legacy), "legacy_unverified");
  assert.equal(canUseFullAccountSession(legacy), true);
  assert.equal(needsSecurePendingActivation(legacy), false);
});

test("new pending accounts never receive full sessions, even with a password", () => {
  assert.equal(getActivationState(pending), "pending");
  assert.equal(canUseFullAccountSession(pending), false);
  assert.equal(needsSecurePendingActivation(pending), true);
});

test("a verified account is eligible, a disabled account never is", () => {
  assert.equal(getActivationState(verified), "verified");
  assert.equal(canUseFullAccountSession(verified), true);
  for (const acc of [{ ...legacy, isActive: false }, { ...pending, isActive: false }, { ...verified, isActive: false }]) {
    assert.equal(getActivationState(acc), "inactive");
    assert.equal(canUseFullAccountSession(acc), false);
    assert.equal(needsSecurePendingActivation(acc), false);
  }
});

test("malformed or absent marker fails closed instead of being treated as legacy", () => {
  for (const acc of [null, undefined, {}, { isActive: true, emailVerifiedAt: null },
    { isActive: true, emailVerifiedAt: null, verificationRequiredAt: undefined },
    { ...legacy, emailVerifiedAt: new Date(NaN) },
    { ...legacy, verificationRequiredAt: new Date(NaN) },
    { ...legacy, verificationRequiredAt: "2026-11-16" },
    { ...legacy, isActive: 1 }]) {
    assert.equal(getActivationState(acc), "invalid");
    assert.equal(canUseFullAccountSession(acc), false);
    assert.equal(needsSecurePendingActivation(acc), false);
  }
});

test("verified and legacy state remain distinct; marker alone is not email proof", () => {
  assert.equal(getActivationState({ ...legacy, emailVerifiedAt: date }), "verified");
  assert.equal(getActivationState(pending), "pending");
  assert.notEqual(getActivationState(pending), "verified");
  assert.equal(getActivationState({ ...pending, emailVerifiedAt: null }), "pending");
});

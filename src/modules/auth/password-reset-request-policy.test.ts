import assert from "node:assert/strict";
import test from "node:test";
import {
  canQueuePasswordResetForAccount,
  type RecoveryRequestAccount,
// @ts-expect-error TS5097: Node strip-types needs .ts; standalone test uses Node 22.
} from "./password-reset-request-policy.ts";

const eligible: RecoveryRequestAccount = {
  id: 7,
  email: "reader@example.com",
  passwordHash: "argon2-placeholder",
  emailVerifiedAt: new Date("2026-11-01T00:00:00.000Z"),
  isActive: true,
};

test("eligible active verified password account matches exact canonical email", () => {
  assert.equal(canQueuePasswordResetForAccount(eligible, "reader@example.com"), true);
});

test("unknown, inactive, legacy-unverified or pending accounts cannot queue", () => {
  for (const account of [null, undefined,
    { ...eligible, id: 0 },
    { ...eligible, isActive: false },
    { ...eligible, passwordHash: null },
    { ...eligible, passwordHash: "" },
    { ...eligible, emailVerifiedAt: null },
    { ...eligible, emailVerifiedAt: new Date(NaN) },
  ]) {
    assert.equal(canQueuePasswordResetForAccount(account, "reader@example.com"), false);
  }
});

test("mismatched email never grants recovery", () => {
  assert.equal(canQueuePasswordResetForAccount(eligible, "other@example.com"), false);
  assert.equal(canQueuePasswordResetForAccount(eligible, "Reader@example.com"), false);
  assert.equal(canQueuePasswordResetForAccount({ ...eligible, email: "a\u0000@example.com" }, "a\u0000@example.com"), false);
});

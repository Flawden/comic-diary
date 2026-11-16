import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  EMAIL_VERIFICATION_TOKEN_BYTES,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  hashEmailVerificationToken,
  isEmailVerificationTokenExpired,
  issueEmailVerificationToken,
} from "./email-verification-token";

const START = new Date("2026-11-16T04:00:00.000Z");

test("uses 32 random bytes, canonical base64url, and a SHA-256 digest", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 64; i += 1) {
    const { token, tokenHash, expiresAt } = issueEmailVerificationToken(START);
    assert.equal(EMAIL_VERIFICATION_TOKEN_BYTES, 32);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.match(tokenHash, /^[0-9a-f]{64}$/);
    assert.equal(hashEmailVerificationToken(token), tokenHash);
    assert.equal(expiresAt.getTime() - START.getTime(), EMAIL_VERIFICATION_TOKEN_TTL_MS);
    assert.equal(seen.has(token), false);
    seen.add(token);
  }
});

test("malformed and noncanonical strings fail closed", () => {
  for (const malformed of [
    "", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "B",
    "A".repeat(42) + "=", "A".repeat(42) + "+", "A".repeat(42) + "/",
    " ".repeat(43), "🦊".repeat(43), null, undefined, {}, 42,
  ]) {
    assert.equal(hashEmailVerificationToken(malformed), null);
  }
});

test("email-verification digest is domain-separated from password-reset", () => {
  const { token, tokenHash } = issueEmailVerificationToken(START);
  const resetLikeHash = createHash("sha256")
    .update("comic-diary:password-reset:v1\0", "utf8")
    .update(token, "utf8")
    .digest("hex");
  assert.notEqual(tokenHash, resetLikeHash);
});

test("expiry is inclusive and invalid dates are rejected", () => {
  const { expiresAt } = issueEmailVerificationToken(START);
  assert.equal(isEmailVerificationTokenExpired(expiresAt, START), false);
  assert.equal(isEmailVerificationTokenExpired(expiresAt, new Date(expiresAt.getTime() - 1)), false);
  assert.equal(isEmailVerificationTokenExpired(expiresAt, expiresAt), true);
  assert.equal(isEmailVerificationTokenExpired(expiresAt, new Date(expiresAt.getTime() + 1)), true);
  assert.equal(isEmailVerificationTokenExpired(new Date(NaN), START), true);
  assert.equal(isEmailVerificationTokenExpired(expiresAt, new Date(NaN)), true);
  assert.throws(() => issueEmailVerificationToken(new Date(NaN)));
});

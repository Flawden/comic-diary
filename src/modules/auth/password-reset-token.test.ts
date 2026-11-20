import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PASSWORD_RESET_TOKEN_BYTES,
  PASSWORD_RESET_TOKEN_TTL_MS,
  hashPasswordResetToken,
  isPasswordResetTokenExpired,
  issuePasswordResetToken,
} from "./password-reset-token";

const START = new Date("2026-11-15T09:00:00.000Z");

test("password-reset tokens use 32 CSPRNG bytes encoded as canonical base64url", () => {
  const seenTokens = new Set<string>();
  const seenHashes = new Set<string>();

  for (let i = 0; i < 64; i += 1) {
    const { token, tokenHash, expiresAt } = issuePasswordResetToken(START);

    assert.equal(PASSWORD_RESET_TOKEN_BYTES, 32);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.match(tokenHash, /^[0-9a-f]{64}$/);
    assert.equal(hashPasswordResetToken(token), tokenHash);
    assert.equal(expiresAt.getTime() - START.getTime(), PASSWORD_RESET_TOKEN_TTL_MS);
    assert.ok(!tokenHash.includes(token));
    assert.ok(!seenTokens.has(token));
    assert.ok(!seenHashes.has(tokenHash));
    seenTokens.add(token);
    seenHashes.add(tokenHash);
  }
});

test("malformed or noncanonical token strings are rejected", () => {
  for (const malformed of [
    "",
    "A".repeat(42),
    "A".repeat(44),
    "A".repeat(42) + "B", // last base64 sextet has invalid pad bits
    "A".repeat(42) + "=",
    "A".repeat(42) + "/",
    "A".repeat(42) + "+",
    "A".repeat(42) + " ",
    "🦊".repeat(43),
    null,
    undefined,
    123,
  ]) {
    assert.equal(hashPasswordResetToken(malformed), null);
  }
});

test("reset digest is domain-separated from the session-token digest", () => {
  const { token, tokenHash } = issuePasswordResetToken(START);
  const sessionStyleHash = createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
  assert.notEqual(tokenHash, sessionStyleHash);
});

test("token expiry has an inclusive deadline and invalid dates fail closed", () => {
  const { expiresAt } = issuePasswordResetToken(START);
  assert.equal(isPasswordResetTokenExpired(expiresAt, START), false);
  assert.equal(
    isPasswordResetTokenExpired(expiresAt, new Date(expiresAt.getTime() - 1)),
    false,
  );
  assert.equal(isPasswordResetTokenExpired(expiresAt, expiresAt), true);
  assert.equal(
    isPasswordResetTokenExpired(expiresAt, new Date(expiresAt.getTime() + 1)),
    true,
  );
  assert.equal(isPasswordResetTokenExpired(new Date(NaN), START), true);
  assert.equal(isPasswordResetTokenExpired(expiresAt, new Date(NaN)), true);
  assert.throws(() => issuePasswordResetToken(new Date(NaN)));
});

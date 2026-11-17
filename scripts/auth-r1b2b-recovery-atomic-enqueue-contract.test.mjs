/** AUTH-01 / R1B2B: OFFLINE source contracts, not a PostgreSQL integration test. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const src = readFileSync(new URL("../src/modules/auth/password-reset-request-outbox-issue.ts", import.meta.url), "utf8");
const ordered = (...patterns) => {
  let from = 0;
  for (const pattern of patterns) {
    const match = src.slice(from).match(pattern);
    assert.ok(match, `Missing or out of order: ${pattern}`);
    from += match.index + match[0].length;
  }
};
test("internal only, no public route, provider, HTTP or dispatch", () => {
  assert.match(src, /INTERNAL ONLY/);
  assert.doesNotMatch(src, /(?:fetch\s*\(|sendMail\s*\(|NextResponse|nodemailer|process\.env|INSERT INTO)/);
  assert.match(src, /Promise<PasswordResetMailEnqueueResult>/);
});
test("invalid user and configured origin rejected before any DB work", () => {
  ordered(/Number\.isSafeInteger\(input\.userId\)/, /canonicalPasswordResetMailOrigin\(input\.publicOrigin\)/, /db\.transaction/);
  assert.match(src, /input\.userId > 2147483647/);
});
test("serializes account changes with USER row lock and verified-mailbox gate", () => {
  ordered(/\.from\(users\).*?\.for\("update"\)/s, /canQueuePasswordResetForAccount\(account, account\.email\)/, /const now = new Date\(\)/);
});
test("revokes old tokens and expires only their READY queued mail", () => {
  ordered(/const revoked = await tx\.update\(passwordResetTokens\)/,
    /isNull\(passwordResetTokens\.consumedAt\)/,
    /isNull\(passwordResetTokens\.revokedAt\)/,
    /if \(revoked\.length > 0\)/,
    /\.set\(\{ state: "expired", finalizedAt: now, updatedAt: now \}\)/,
    /eq\(passwordResetMailOutbox\.state, "ready"\)/);
  assert.match(src, /inArray\(passwordResetMailOutbox\.passwordResetTokenId, revoked\.map\(\(row\) => row\.id\)\)/);
});
test("token and outbox inserted inside the SAME transaction, in order", () => {
  ordered(/return db\.transaction\(async \(tx\)/,
    /tx\.insert\(passwordResetTokens\)/,
    /sealPasswordResetMailOutboxPayload\(/,
    /tx\.insert\(passwordResetMailOutbox\)/,
    /return \{ ok: true, queued: true \}/);
});
test("token storage is hashed and outbox payload is AEAD-only", () => {
  assert.match(src, /tokenHash: issued\.tokenHash/);
  assert.match(src, /email: account\.email/);
  assert.match(src, /token: issued\.token/);
  for (const field of ["payloadCiphertext", "payloadNonce", "payloadKeyId", "payloadDigest"]) {
    assert.match(src, new RegExp(`${field}: envelope\\.${field}`));
  }
  assert.doesNotMatch(src, /return\s+\{[^}]*token:\s*issued\.token/s);
});
test("sealing and either DB insert failure throw to roll back everything", () => {
  assert.match(src, /if \(!passwordResetTokenId\) throw new Error/);
  assert.match(src, /if \(!envelope\) throw new Error/);
  assert.match(src, /if \(!queued\[0\]\) throw new Error/);
});
test("idempotency is random and bound to the new token and expiry", () => {
  assert.match(src, /randomBytes\(24\)\.toString\("base64url"\)/);
  assert.match(src, /\{ passwordResetTokenId, idempotencyKey, expiresAt: issued\.expiresAt \}/);
  assert.match(src, /idempotencyKey,\s*expiresAt: issued\.expiresAt/s);
});

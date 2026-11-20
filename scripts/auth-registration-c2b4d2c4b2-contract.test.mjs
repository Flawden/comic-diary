/** AUTH-01 D2C4B2: static compatibility checks, NO provider, DB or network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const issuer = read("src/modules/auth/registration-activation-outbox-issue.ts");
const candidate = read("src/modules/auth/registration-activation-resend-contract.ts");
const ci = read(".github/workflows/ci.yml");
const crypto = read("src/modules/auth/registration-activation-outbox-crypto.ts");

// Keep the atomic issuer and provider candidate compatible, without another key.
test("atomic D2C3 issuer persists a fresh 24-byte key with the same issuance", () => {
  assert.match(issuer, /randomBytes\(24\)\.toString\("base64url"\)/);
  assert.match(issuer, /idempotencyKey,\s*expiresAt:/);
  assert.match(issuer, /idempotencyKey,\s*\n\s*expiresAt:/);
});

test("inert candidate validates canonical 24-byte persisted key, not legacy prefix", () => {
  assert.ok(candidate.includes('^[A-Za-z0-9_-]{32}$'));
  assert.match(candidate, /bytes\.length === 24/);
  assert.match(candidate, /bytes\.toString\("base64url"\) === value/);
  assert.doesNotMatch(candidate, /\^activation\\\//);
});

test("outbox cryptographic AAD remains bound to original immutable issuance key", () => {
  assert.match(crypto, /binding\.idempotencyKey/);
  assert.match(crypto, /timingSafeEqual/);
});

test("candidate stays inert and results cannot authorize an automatic retry", () => {
  assert.doesNotMatch(candidate, /\bfetch\s*\(|\bprocess\.env\b|\bconsole\.|\bsetTimeout\s*\(|\bdb\.transaction\b|\bnew Pool\b/);
  assert.match(candidate, /return "uncertain"/);
  assert.doesNotMatch(candidate, /\bretry\s*\(|\bdeliverPendingActivationMail\s*\(/);
});

test("GitHub CI tests persisted format without provider or mail execution", () => {
  assert.match(ci, /AUTH-01C2B4D2C4B2 persisted idempotency compatibility \(NO network or sending\)/);
  assert.match(ci, /node --test scripts\/auth-registration-c2b4d2c4b2-contract\.test\.mjs/);
  assert.match(ci, /node --import tsx --test src\/modules\/auth\/registration-activation-resend-contract\.test\.ts/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const crypto = readFileSync('src/modules/auth/registration-activation-outbox-crypto.ts', 'utf8');
const tests = readFileSync('src/modules/auth/registration-activation-outbox-crypto.test.ts', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const schema = readFileSync('drizzle/0035_auth_activation_mail_outbox.sql', 'utf8');

test('D2C2 uses AEAD encryption with unique nonce and authenticated binding', () => {
  for (const value of ['aes-256-gcm', 'randomBytes(12)', 'setAAD(', 'getAuthTag()', 'setAuthTag(', 'timingSafeEqual(',
    'verificationTokenId', 'idempotencyKey', 'expiresAt', 'payloadKeyId', 'payloadDigest']) {
    assert.ok(crypto.includes(value), value);
  }
});

test('D2C2 keeps keys external and has no side effects or production integration', () => {
  assert.doesNotMatch(crypto, /process\.env|fetch\s*\(|drizzle|new Pool\s*\(|require\(['"]pg|resend\.com|DATABASE_URL|API_KEY|console\.|localStorage|sessionStorage/i);
  assert.doesNotMatch(crypto, /createSecretKey\s*\(|randomBytes\(32\)/);
  assert.match(crypto, /Uint8Array/);
});

test('D2C2 matches exact D2C1 storage fields and constraints', () => {
  for (const col of ['payload_ciphertext', 'payload_nonce', 'payload_key_id', 'payload_digest']) assert.ok(schema.includes(`"${col}"`));
  for (const property of ['payloadCiphertext', 'payloadNonce', 'payloadKeyId', 'payloadDigest']) assert.ok(crypto.includes(property));
  assert.match(schema, /\{16\}/); // base64url nonce encodes 12 bytes
  assert.match(crypto, /payloadCiphertext\.length > 20000/);
});

test('CI runs structural and real AEAD tamper/expiry/rekey regressions', () => {
  assert.match(ci, /AUTH-01C2B4D2C2 AEAD outbox payload contract/);
  assert.match(ci, /node --test scripts\/auth-registration-c2b4d2c2-contract\.test\.mjs/);
  assert.match(ci, /node --import tsx --test src\/modules\/auth\/registration-activation-outbox-crypto\.test\.ts/);
  for (const phrase of ['wrong token issuance', 'idempotency key fails', 'wrong expiry', 'wrong or retired', 'GCM authentication', 'malicious key id']) assert.ok(tests.includes(phrase), phrase);
});

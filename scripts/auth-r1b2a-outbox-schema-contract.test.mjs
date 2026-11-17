/** R1B2A: OFFLINE source contract, no database, SQL or external effects. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const migration = readFileSync('drizzle/0040_auth_password_reset_mail_outbox.sql','utf8');
const schema = readFileSync('src/db/schema.ts','utf8');
const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
const crypto = readFileSync('src/modules/auth/password-reset-request-outbox-crypto.ts','utf8');
const clean = s => s.replace(/\r\n/g,'\n');
test('new migration is append-only after 0039 and journal remains sequential', () => {
  assert.equal(journal.entries.length,41);
  for(let i=0;i<41;i++) assert.equal(journal.entries[i].idx,i);
  assert.equal(journal.entries[39].tag,'0039_auth_activation_operator_audit');
  assert.equal(journal.entries[40].tag,'0040_auth_password_reset_mail_outbox');
});
test('reset outbox is separate from activation outbox', () => {
  assert.match(migration,/CREATE TABLE "password_reset_mail_outbox"/);
  assert.match(migration,/REFERENCES "public"\."password_reset_tokens"\("id"\)/);
  assert.doesNotMatch(migration,/REFERENCES .*"email_verification_tokens"/);
  assert.match(schema,/export const passwordResetMailOutbox = pgTable\(/);
  assert.match(schema,/\.references\(\(\) => passwordResetTokens\.id/);
});
test('encrypted-only payload with unique issuance and idempotency', () => {
  for (const name of ['payload_ciphertext','payload_nonce','payload_key_id','payload_digest','idempotency_key']) {
    assert.ok(migration.includes('"'+name+'"'));
  }
  assert.match(migration,/"password_reset_mail_outbox_token_unique" UNIQUE/);
  assert.match(migration,/"password_reset_mail_outbox_idempotency_unique" UNIQUE/);
  assert.doesNotMatch(migration,/"(email|token|secret|code|plaintext)"\s+(?:text|varchar)/);
});
test('initial state has ready/expired only; no automatic dispatch', () => {
  assert.match(migration,/\("state" = 'ready' AND "finalized_at" IS NULL\)/);
  assert.match(migration,/\("state" = 'expired' AND "finalized_at" IS NOT NULL\)/);
  assert.doesNotMatch(migration,/in_flight|accepted|claimed_at|provider_message_id/);
  assert.doesNotMatch(schema.slice(schema.indexOf('export const passwordResetMailOutbox'),schema.indexOf('export const activationMailOutbox')),
    /dispatchReservationAt|dispatchFenceAt|providerMessageId|claimId/);
});
test('encryption and key constraints match the Drizzle model', () => {
  for (const suffix of ['digest_check','nonce_check','key_id_check','ciphertext_check','idempotency_check','time_check','state_check']) {
    const constraint='password_reset_mail_outbox_'+suffix;
    assert.ok(migration.includes('"'+constraint+'"'),constraint);
    assert.ok(schema.includes('"'+constraint+'"'),constraint);
  }
});
test('ready expiry and state indexes are present in both sources', () => {
  for(const suffix of ['ready_expiry_idx','state_updated_idx']) {
    assert.ok(migration.includes('"password_reset_mail_outbox_'+suffix+'"'));
    assert.ok(schema.includes('"password_reset_mail_outbox_'+suffix+'"'));
  }
});
test('envelope is bound to recovery domain, not activation', () => {
  assert.match(crypto,/comic-diary:password-reset-mail-outbox:aes-256-gcm:v1/);
  assert.doesNotMatch(crypto,/auth-activation-mail-outbox:aes-256-gcm/);
  assert.match(crypto,/passwordResetTokenId/);
  assert.match(crypto,/createCipheriv\("aes-256-gcm"/);
});
test('no provider or worker wired by schema stage', () => {
  assert.doesNotMatch(clean(migration),/CREATE TRIGGER|CREATE FUNCTION|NOTIFY|LISTEN|pg_cron/i);
  assert.doesNotMatch(clean(crypto),/fetch\(|axios|sendMail\(|process\.env|DATABASE_URL/);
});

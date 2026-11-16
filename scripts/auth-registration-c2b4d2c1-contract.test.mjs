/** AUTH-01C2B4D2C1 / structural only: no real DB connection or mail. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(path,'utf8');
const schema=read('src/db/schema.ts');
const migration=read('drizzle/0035_auth_activation_mail_outbox.sql');
const journal=JSON.parse(read('drizzle/meta/_journal.json'));
const ci=read('.github/workflows/ci.yml');
const probe=read('scripts/auth-registration-c2b4d2c1-pg-probe.ts');
const original=read('scripts/auth-registration-c2b4a-contract.test.mjs');

test('0035 append-only after 0034, historical migration test remains prefix-safe',()=>{
 assert.equal(journal.entries.length,36);
 assert.deepEqual(journal.entries.slice(31).map(x=>[x.idx,x.tag]),[
 [31,'0031_auth_password_reset_tokens'],[32,'0032_auth_email_verification_state'],
 [33,'0033_auth_email_verification_tokens'],[34,'0034_auth_registration_activation_marker'],
 [35,'0035_auth_activation_mail_outbox']]);
 assert.ok(journal.entries[35].when>journal.entries[34].when);
 assert.match(original,/journal.entries.slice\(31, 35\)/);
 assert.doesNotMatch(migration,/^\s*(?:DROP|DELETE|UPDATE|TRUNCATE|ALTER TABLE "users")\b/im);
});

test('schema and migration use identical narrow column contract and FK',()=>{
 assert.match(schema,/export const activationMailOutbox = pgTable\(/);
 assert.match(migration,/CREATE TABLE "activation_mail_outbox"/);
 for(const col of ['verification_token_id','payload_ciphertext','payload_nonce','payload_key_id',
  'payload_digest','idempotency_key','state','claim_id','attempt_count','expires_at',
  'claimed_at','finalized_at','provider_message_id','created_at','updated_at']) {
  assert.ok(migration.includes(`"${col}"`),col);
  assert.ok(schema.includes(`"${col}"`),col);
 }
 assert.match(migration,/REFERENCES "public"\."email_verification_tokens"\("id"\) ON DELETE cascade/);
 assert.doesNotMatch(migration,/"(?:raw_token|activation_code|email|recipient|password|api_key)"/i);
});

test('uniqueness, encrypted-payload shape and zero-or-one claim DB guards',()=>{
 for(const name of ['activation_mail_outbox_token_unique','activation_mail_outbox_idempotency_unique',
 'activation_mail_outbox_claim_unique','activation_mail_outbox_digest_check','activation_mail_outbox_nonce_check',
 'activation_mail_outbox_key_id_check','activation_mail_outbox_ciphertext_check',
 'activation_mail_outbox_idempotency_check','activation_mail_outbox_claim_id_check',
 'activation_mail_outbox_time_check','activation_mail_outbox_state_shape_check',
 'activation_mail_outbox_ready_expiry_idx','activation_mail_outbox_state_updated_idx']){
  assert.ok(schema.includes(`"${name}"`),name+' absent from schema');
  assert.ok(migration.includes(`"${name}"`),name+' absent from migration');
 }
 assert.match(migration,/"state" = 'ready' AND "attempt_count" = 0/);
 assert.match(migration,/"state" = 'in_flight' AND "attempt_count" = 1/);
 assert.match(migration,/"state" IN \('accepted', 'rejected', 'uncertain'\)/);
 assert.match(migration,/"state" = 'expired' AND "attempt_count" = 0/);
});

test('no dispatcher, secret, environment access or production migration in schema stage',()=>{
 assert.doesNotMatch(migration,/INSERT INTO|process.env|API_KEY|sendEmail|fetch\(/i);
 assert.doesNotMatch(schema.slice(schema.indexOf('export const activationMailOutbox'),schema.indexOf('export const sessions')),/fetch\(|sendMail|process\.env|@\/db|new Pool/);
 assert.match(ci,/AUTH-01C2B4D2C1 inert durable outbox schema contracts/);
 assert.match(ci,/node --test scripts\/auth-registration-c2b4d2c1-contract.test.mjs/);
 assert.match(ci,/node --import tsx scripts\/auth-registration-c2b4d2c1-pg-probe.ts/);
});

test('disposable-only PG probe refuses arbitrary database before opening pool',()=>{
 for(const marker of ['GITHUB_ACTIONS','GITHUB_REPOSITORY','GITHUB_WORKFLOW','ci_ephemeral_password',
 '127.0.0.1','comic_diary_release','REFUSED'])assert.ok(probe.includes(marker),marker);
 assert.ok(probe.indexOf('assertDisposableCiTarget()') < probe.indexOf('new Pool('));
 for(const marker of ['C2B4D2C1_SCHEMA_GUARDS','C2B4D2C1_CONCURRENT_CLAIM','C2B4D2C1_NO_RECLAIM','C2B4D2C1_CASCADE'])assert.ok(probe.includes(marker));
});

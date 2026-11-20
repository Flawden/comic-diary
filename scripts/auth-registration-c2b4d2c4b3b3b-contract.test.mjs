/** AUTH-01C2B4D2C4B3B3B — offline structural safety; no DB or network. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (name) => readFileSync(name, 'utf8').replace(/\r\n/g, '\n');
const schema=read('src/db/schema.ts');
const journal=JSON.parse(read('drizzle/meta/_journal.json'));
const migration=read('drizzle/0037_auth_activation_operator_gate.sql');
const migration0038=read('drizzle/0038_auth_activation_reservation_presence.sql');
const runtime=read('src/modules/auth/registration-activation-outbox-reserve.ts');
const fence=read('src/modules/auth/registration-activation-outbox-fence.ts');
const b3b3a=read('scripts/auth-registration-c2b4d2c4b3b3a-control-spec.test.mjs');
const b3b2=read('scripts/auth-registration-c2b4d2c4b3b2-contract.test.mjs');
const workflow=read('.github/workflows/ci.yml');
const pg=read('scripts/auth-registration-c2b4d2c4b3b3b-pg-probe.ts');
const trans=runtime.slice(runtime.indexOf('return db.transaction'));
const sha=(s)=>createHash('sha256').update(s).digest('hex');

test('old migrations 0035 and 0036 unchanged in canonical LF form',()=>{
 assert.equal(sha(read('drizzle/0035_auth_activation_mail_outbox.sql')),'3384762d2aab3b32cf1f7d9dc26471761d41845289f5d67ff075a4c41f8ba71a');
 assert.equal(sha(read('drizzle/0036_auth_activation_dispatch_fence.sql')),'271b9876defd7505c6bba90196b69aab9680f50345f797658cd80dbd86391b7d');
});
test('0037 append only and journal contiguous with exact historical prefix',()=>{
 assert.ok(journal.entries.length>=39);
 assert.deepEqual(journal.entries.slice(35,39).map(e=>[e.idx,e.tag]),[
  [35,'0035_auth_activation_mail_outbox'],[36,'0036_auth_activation_dispatch_fence'],[37,'0037_auth_activation_operator_gate'],[38,'0038_auth_activation_reservation_presence']]);
 assert.ok(journal.entries[38].when>journal.entries[37].when);
 assert.ok(journal.entries[37].when>journal.entries[36].when);
 assert.match(b3b2,/journal\.entries\.length >= 37/);
 assert.doesNotMatch(migration,/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|CREATE\s+TRIGGER)\b/im);
});
test('global control is a singleton default OFF durable row',()=>{
 for(const s of [
 'CREATE TABLE "activation_mail_dispatch_control"',
 '"id" integer PRIMARY KEY NOT NULL',
 '"enabled" boolean DEFAULT false NOT NULL',
 '"generation" integer DEFAULT 0 NOT NULL',
 '"activation_mail_dispatch_control_singleton_check"',
 '"activation_mail_dispatch_control_generation_check"',
 'VALUES (1, false, 0);',
 ]) assert.ok(migration.includes(s),s);
 assert.match(schema,/export const activationMailDispatchControl = pgTable\("activation_mail_dispatch_control"/);
});
test('no production enable code, transport integration or environment in patch',()=>{
 assert.doesNotMatch(runtime,/\bfetch\s*\(|\bsendEmail\s*\(|\bprocess\.env\b|\bnew\s+Pool\s*\(|sendAuthorized:\s*true/);
 assert.doesNotMatch(migration,/api_key|smtp|mailgun|resend\.com|sendEmail|GRANT\s+ALL/i);
 assert.doesNotMatch(runtime,/\.\/registration-activation-sender|\.\/registration-activation-resend-contract/);
 assert.doesNotMatch(runtime,/export async function.*enable|export async function.*disable/);
});
test('reservation columns and constraint mirrored precisely in schema',()=>{
 for(const c of ['dispatch_reservation_at','dispatch_reservation_generation']) {
  assert.ok(migration.includes('"'+c+'"'));
  assert.ok(schema.includes('"'+c+'"'));
 }
 assert.match(schema,/activation_mail_outbox_dispatch_reservation_shape_check/);
 assert.match(migration,/activation_mail_outbox_dispatch_reservation_shape_check/);
});
test('reservation requires prior fence, one claim and chronological state',()=>{
 for(const s of [
 '"dispatch_fence_at" IS NOT NULL','"state" IN (\'in_flight\', \'accepted\', \'rejected\', \'uncertain\')',
 '"attempt_count" = 1','"claim_id" IS NOT NULL',
 '"dispatch_reservation_at" >= "dispatch_fence_at"',
 '"dispatch_reservation_at" < "expires_at"',
 '"updated_at" >= "dispatch_reservation_at"',
 '"dispatch_reservation_generation" > 0',
 ]) assert.ok(migration.includes(s),s);
});
test('NULL-null pairs prevent partial reservation rows',()=>{
 assert.match(migration,/"dispatch_reservation_at" IS NULL AND "dispatch_reservation_generation" IS NULL/);
 assert.match(schema,/dispatchReservationAt} IS NULL AND \$\{table\.dispatchReservationGeneration} IS NULL/);
});
test('F1 historical 0037 and PG race probe remain unchanged in canonical LF form',()=>{
 assert.equal(sha(migration),'f1f963a6f8db4fb08e77087309cde5c2f0e5bab9622294484fb9824a1a712dca');
 assert.equal(sha(pg),'df9e04044b71426920fe7dff79d000b5d3d1da599ebf64b81dd330eadf4e55e3');
});
test('F1 0038 explicitly closes NULL generation SQL CHECK UNKNOWN gap',()=>{
 assert.match(migration0038,/ADD CONSTRAINT "activation_mail_outbox_reservation_generation_present_check"/);
 assert.match(migration0038,/"dispatch_reservation_at" IS NULL\s+OR "dispatch_reservation_generation" IS NOT NULL/);
 assert.match(schema,/check\("activation_mail_outbox_reservation_generation_present_check"/);
 assert.match(schema,/\$\{table\.dispatchReservationAt\} IS NULL\s+OR \$\{table\.dispatchReservationGeneration\} IS NOT NULL/);
 assert.doesNotMatch(migration0038,/^\s*(?:DROP|DELETE|UPDATE|TRUNCATE|CREATE\s+TRIGGER)\b/im);
});
test('runtime inputs strict and no per-process operatorEnabled',()=>{
 assert.match(runtime,/Object\.keys\(input\)\.length !== 4/);
 assert.match(runtime,/isClaimId\(input\.claimId\)/);
 assert.match(runtime,/input\.keys instanceof Map/);
 assert.doesNotMatch(runtime,/input\.operatorEnabled|input\.operatorFenceEnabled/);
});
test('unlocked advisory lookup never grants permission',()=>{
 assert.ok(runtime.indexOf('Advisory discovery only')>0);
 assert.ok(runtime.indexOf('innerJoin(')>0 && runtime.indexOf('innerJoin(')<runtime.indexOf('return db.transaction'));
});
test('control first, then USER -> TOKEN -> OUTBOX locks',()=>{
 const terms=['.from(activationMailDispatchControl)','.from(users)','.from(emailVerificationTokens)','.from(activationMailOutbox)'];
 const p=terms.map(t=>trans.indexOf(t));
 assert.ok(p.every(x=>x>=0));
 assert.deepEqual([...p].sort((a,b)=>a-b),p);
 assert.equal((trans.match(/\.for\("update"\)/g)??[]).length,3);
 assert.equal((trans.match(/\.for\("share"\)/g)??[]).length,1);
});
test('default-off or missing control blocks before user locking',()=>{
 const gate=trans.indexOf('if (!control || control.enabled !== true');
 const user=trans.indexOf('.from(users)');
 assert.ok(gate>=0 && gate<user);
 assert.match(trans,/control\.generation <= 0/);
});
test('eligibility under locks validates token, recipient, claim, origin, and AEAD',()=>{
 assert.match(runtime,/preflightClaimedActivationMailDryRun\(/);
 assert.match(runtime,/snapshot: \{ account, token, outbox \}/);
 assert.match(runtime,/expectedPublicOrigin: input\.expectedPublicOrigin/);
 assert.match(runtime,/keys: input\.keys/);
 assert.match(runtime,/preflight\.status !== "eligible_snapshot"/);
});
test('must have earlier fence and never repeat reservation',()=>{
 assert.match(runtime,/outbox\.dispatchFenceAt === null/);
 assert.match(runtime,/outbox\.dispatchReservationAt !== null/);
 assert.match(runtime,/isNotNull\(activationMailOutbox\.dispatchFenceAt\)/);
 assert.match(runtime,/isNull\(activationMailOutbox\.dispatchReservationAt\)/);
 assert.match(runtime,/isNull\(activationMailOutbox\.dispatchReservationGeneration\)/);
});
test('epoch comes from locked row, never from caller',()=>{
 assert.match(runtime,/dispatchReservationGeneration: control\.generation/);
 assert.doesNotMatch(runtime,/input\.generation|input\.epoch|expectedEpoch/);
 assert.match(migration,/"generation" integer DEFAULT 0 NOT NULL/);
});
test('write is limited to matching in_flight owner and token',()=>{
 for(const s of [
 'eq(activationMailOutbox.state, "in_flight")',
 'eq(activationMailOutbox.claimId, input.claimId)',
 'eq(activationMailOutbox.verificationTokenId, token.id)',
 ]) assert.ok(runtime.includes(s),s);
});
test('both success and denial return sendAuthorized false with no identifiers',()=>{
 assert.match(runtime,/reserved: true; sendAuthorized: false/);
 assert.match(runtime,/kind: "blocked"; sendAuthorized: false/);
 assert.doesNotMatch(runtime,/sendAuthorized:\s*true/);
 assert.doesNotMatch(runtime,/return.*payloadCiphertext|return.*plaintext|return.*recipient/);
});
test('past fence remains no-send and independent',()=>{
 assert.match(fence,/const RECORDED: FenceRecorded = Object\.freeze/);
 assert.match(fence,/sendAuthorized: false/);
 assert.doesNotMatch(fence,/dispatchReservationAt/);
});
test('old B3B3A non-guarantee B and uncertain/no-retry preserved',()=>{
 assert.match(b3b3a,/hypothetical-network-start/);
 assert.match(b3b3a,/no auto retry/i);
 assert.match(runtime,/NO guarantee B/);
 assert.doesNotMatch(runtime,/state:\s*"ready"|autoRetry|automaticRetry\(/);
});
test('CI includes dedicated offline and disposable PG probes',()=>{
 for(const s of [
 'AUTH-01C2B4D2C4B3B3B durable operator gate contract (NO delivery)',
 'node --test scripts/auth-registration-c2b4d2c4b3b3b-contract.test.mjs',
 'AUTH-01C2B4D2C4B3B3B disposable PostgreSQL operator gate races (NO delivery)',
 'node --import tsx scripts/auth-registration-c2b4d2c4b3b3b-pg-probe.ts',
 'run: npm run lint','run: npm run typecheck',
 "if: github.event_name == 'push' && github.ref == 'refs/heads/master'",
 ])assert.ok(workflow.includes(s),s);
});
test('PG probe protects exact ephemeral CI URI before runtime import and Pool',()=>{
 for(const s of ['GITHUB_ACTIONS','GITHUB_REPOSITORY','GITHUB_WORKFLOW','ci_ephemeral_password','127.0.0.1','comic_diary_release','REFUSED'])assert.ok(pg.includes(s),s);
 const gate=pg.indexOf('const connectionString = requireDisposableCiDatabase();');
 const imp=pg.indexOf('import("../src/modules/auth/registration-activation-outbox-reserve")');
 const pool=pg.indexOf('new Pool({');
 assert.ok(gate>=0 && imp>gate && pool>imp);
 assert.doesNotMatch(pg,/\bfetch\s*\(|\bsendEmail\s*\(/);
});
test('probe exercises default OFF, gate lock race, revocation and two workers',()=>{
 for(const s of ['DEFAULT_OFF','OFF_COMMIT_BEFORE_RESERVE','LOCKED_DISABLE_BEFORE_RESERVE','REVOKE_BEFORE_RESERVE','TWO_WORKERS_ONE_RESERVATION','OFF_AFTER_RESERVATION','RE_ENABLE_NEW_EPOCH','NO_RETRY']) assert.ok(pg.includes(s),s);
});

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(p,'utf8');
const dispatch=read('src/modules/auth/registration-activation-dispatch.ts');
const finalize=read('src/modules/auth/registration-activation-outbox-claim.ts');
test('HTTP follows committed private start; no public authorization object',()=>{
 assert.match(dispatch,/async function beginDispatch/);assert.doesNotMatch(dispatch,/export async function beginDispatch/);
 assert.ok(dispatch.indexOf('await beginDispatch')<dispatch.indexOf('await submitOnce'));
 assert.match(dispatch,/isNull\(outboxTable.dispatchStartedAt\)/);assert.match(dispatch,/dispatchReservationGeneration !== control.generation/);
 assert.match(dispatch,/unexpected.length/);assert.match(dispatch,/process.env.NODE_ENV !== "test"/);
});
test('finalizer checks start and reservation in snapshot and SQL',()=>{
 for(const marker of ['dispatchFenceAt','dispatchReservationAt','dispatchStartedAt']){assert.ok(finalize.includes(`!item.${marker}`));assert.ok(finalize.includes(`isNotNull(activationMailOutbox.${marker})`));}
 assert.match(finalize,/eq\(activationMailOutbox.dispatchReservationGeneration, item.dispatchReservationGeneration\)/);
});
test('abandoned timeout uses start when present in discovery and conditional UPDATE',()=>{
 assert.match(dispatch,/and\(isNull\(outboxTable.dispatchStartedAt\), lte\(outboxTable.claimedAt, cutoff\)\)/);
 assert.match(dispatch,/and\(isNotNull\(outboxTable.dispatchStartedAt\), lte\(outboxTable.dispatchStartedAt, cutoff\)\)/);
 assert.match(dispatch,/eq\(outboxTable.state, "in_flight"\), abandoned/);
 assert.doesNotMatch(dispatch,/set\(\{ state: "ready"/);
});
test('activation runs only under its independent worker flag and CI runs behavioral tests',()=>{
 const instrumentation=read('src/instrumentation.ts');assert.match(instrumentation,/AUTH_ACTIVATION_WORKER_ENABLED === "true"/);assert.match(instrumentation,/AUTH_RECOVERY_WORKER_ENABLED === "true"/);
 const ci=read('.github/workflows/ci.yml');assert.ok(ci.includes('node --import tsx --test scripts/auth-activation-integration.test.ts'));assert.ok(ci.includes('src/modules/auth/registration-activation-config.test.ts'));assert.ok(ci.includes('scripts/auth-activation-dispatch-contract.test.mjs'));
});
test('0046 only appends start marker; old migrations are preserved',()=>{
 const ddl=read('drizzle/0046_activation_dispatch_start.sql');assert.match(ddl,/ADD COLUMN "dispatch_started_at"/);assert.match(ddl,/dispatch_reservation_generation.* IS NOT NULL/);assert.doesNotMatch(ddl,/DROP|UPDATE|INSERT|DELETE/);
 const journal=JSON.parse(read('drizzle/meta/_journal.json')).entries;assert.equal(journal[46].tag,'0046_activation_dispatch_start');assert.equal(journal[44].tag,'0044_auth_password_reset_dispatch_start');
});

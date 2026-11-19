/** AUTH-01 B3B3C: strict structural/offline contracts only. No DB or network. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = name => readFileSync(name,"utf8");
const sha = name => createHash("sha256").update(readFileSync(name,"utf8").replace(/\r\n/g,"\n")).digest("hex");
const svc=read("src/modules/auth/registration-activation-operator-control.ts");
const api=read("src/app/api/admin/security/activation-dispatch/route.ts");
const schema=read("src/db/schema.ts");
const mig=read("drizzle/0039_auth_activation_operator_audit.sql");
const journal=JSON.parse(read("drizzle/meta/_journal.json"));
const workflow=read(".github/workflows/ci.yml");
const probe=read("scripts/auth-registration-c2b4d2c4b3b3c-pg-probe.ts");

test("B3B3C unchanged F1 historical migration 0037 and 0038",()=>{
 assert.equal(sha("drizzle/0037_auth_activation_operator_gate.sql"),"f1f963a6f8db4fb08e77087309cde5c2f0e5bab9622294484fb9824a1a712dca");
 assert.equal(sha("drizzle/0038_auth_activation_reservation_presence.sql"),"988d2293a010f81b09a65ddab0548d7d2dc749d5a10fe3acfc6d838900718877");
});
test("B3B3C append only journal with 0039",()=>{
 assert.ok(journal.entries.length>=40);
 assert.deepEqual(journal.entries.slice(37,40).map(e=>[e.idx,e.tag]),[
 [37,"0037_auth_activation_operator_gate"],[38,"0038_auth_activation_reservation_presence"],[39,"0039_auth_activation_operator_audit"]]);
 assert.ok(journal.entries[39].when>journal.entries[38].when);
});
test("B3B3C audit vocabulary only, no grants or mail",()=>{
 assert.match(mig,/ALTER TYPE "administrative_audit_action" ADD VALUE IF NOT EXISTS 'ACTIVATION_DISPATCH_CONTROL_CHANGE'/);
 assert.match(mig,/ALTER TYPE "administrative_audit_target" ADD VALUE IF NOT EXISTS 'ACTIVATION_DISPATCH_CONTROL'/);
 assert.match(schema,/"ACTIVATION_DISPATCH_CONTROL_CHANGE"/);
 assert.match(schema,/"ACTIVATION_DISPATCH_CONTROL"/);
 assert.doesNotMatch(mig,/^\s*(?:UPDATE|INSERT|DELETE|GRANT|DROP|TRUNCATE)\b/im);
});
test("B3B3C ON is explicitly disabled by default; OFF may still work",()=>{
 assert.match(svc,/if \(input.enabled && \(process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED !== "true" \|\| !activationDispatchOperational\(process.env\)\)\) return DENIED/);
 assert.doesNotMatch(svc,/process.env.*\|\|.*true/);
});
test("B3B3C rejects malformed or unexpected input",()=>{
 for(const s of ['Object.keys(input).length !== 4','Number.isSafeInteger(input.actorUserId)','Number.isSafeInteger(input.actorSessionId)','Number.isSafeInteger(input.expectedGeneration)','typeof input.enabled !== "boolean"']) assert.ok(svc.includes(s),s);
});
test("B3B3C locks CONTROL first, actor USER second, session third",()=>{
 const a=svc.indexOf('return db.transaction');
 assert.ok(a>0);
 const transaction=svc.slice(a);
 const order=['.from(activationMailDispatchControl)','.from(users)','.from(sessions)'];
 const positions=order.map(term=>transaction.indexOf(term));
 assert.ok(positions.every(n=>n>=0));assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 assert.equal((transaction.match(/\.for\("update"\)/g)||[]).length,3);
});
test("B3B3C permissions and activation checked under lock, not caller role",()=>{
 assert.match(svc,/canUseFullAccountSession\(actor\)/);
 assert.match(svc,/hasPermission\(actor.role, "ADMIN_SECURITY"\)/);
 assert.doesNotMatch(svc,/actorRole: input\./);
});
test("B3B3C verifies live session id, actor id and expiry under lock",()=>{
 for(const s of ['eq(sessions.id, input.actorSessionId)','eq(sessions.userId, actor.id)','gt(sessions.expiresAt, now)']) assert.ok(svc.includes(s),s);
});
test("B3B3C refuses replay, no-op, bad generation and integer overflow",()=>{
 for(const s of ['control.generation !== input.expectedGeneration','control.enabled === input.enabled','control.generation >= 2147483647']) assert.ok(svc.includes(s),s);
});
test("B3B3C CAS update is scoped to singleton and previous state",()=>{
 for(const s of ['eq(activationMailDispatchControl.id, 1)','eq(activationMailDispatchControl.enabled, control.enabled)','eq(activationMailDispatchControl.generation, control.generation)']) assert.ok(svc.includes(s),s);
});
test("B3B3C audit is inside the same transaction after update",()=>{
 assert.ok(svc.indexOf('tx.insert(administrativeAuditEvents)')>svc.indexOf('tx.update(activationMailDispatchControl)'));
 assert.match(svc,/action: "ACTIVATION_DISPATCH_CONTROL_CHANGE"/);
 assert.match(svc,/targetType: "ACTIVATION_DISPATCH_CONTROL"/);
 assert.match(svc,/previousGeneration: control.generation/);
 assert.match(svc,/sendAuthorized: false/);
});
test("B3B3C cannot grant HTTP delivery or return secrets",()=>{
 assert.doesNotMatch(svc,/sendAuthorized:\s*true|\bfetch\s*\(|sendEmail\s*\(|api_key|smtp|mailgun|resend\.com/i);
 assert.match(svc,/return \{ ok: true, enabled: input.enabled, generation, sendAuthorized: false \}/);
});
test("B3B3C origin checked before any session or body",()=>{
 const post=api.slice(api.indexOf('export async function POST'));
 const ori=post.indexOf('if (!isSameOriginRequest(request))');
 assert.ok(ori>0 && ori<post.indexOf('await getCurrentSession()') && ori<post.indexOf('await readRegistrationActivationBody(request)'));
});
test("B3B3C route requires current ADMIN_SECURITY and confirmation phrase",()=>{
 assert.match(api,/hasPermission\(current.user.role, "ADMIN_SECURITY"\)/);
 assert.match(api,/"ENABLE_ACTIVATION_DISPATCH"/);
 assert.match(api,/"DISABLE_ACTIVATION_DISPATCH"/);
 assert.match(api,/current.sessionId/);
});
test("B3B3C route rejects unknown keys and oversized bodies",()=>{
 assert.match(api,/Object.keys\(value\).length !== 3/);
 assert.match(api,/Buffer.byteLength\(body, "utf8"\) > MAX_BODY/);
 assert.match(api,/MAX_BODY = 1024/);
});
test("B3B3C route no-store, no details in errors",()=>{
 assert.match(api,/"Cache-Control": "no-store"/);
 assert.match(api,/return error\("control-unavailable", 503\)/);
 assert.doesNotMatch(api,/console\.|sendAuthorized:\s*true|\bfetch\s*\(/);
});
test("B3B3C CI offline and disposable PG17 gates exist",()=>{
 assert.match(workflow,/node --test scripts\/auth-registration-c2b4d2c4b3b3c-contract.test.mjs/);
 assert.match(workflow,/node --import tsx scripts\/auth-registration-c2b4d2c4b3b3c-pg-probe.ts/);
 assert.match(workflow,/if: github.event_name == 'push' && github.ref == 'refs\/heads\/master'/);
});
test("B3B3C PG probe refuses non-disposable databases",()=>{
 for(const str of ['GITHUB_ACTIONS','GITHUB_REPOSITORY','GITHUB_WORKFLOW','127.0.0.1','ci_ephemeral_password','comic_diary_release'])assert.ok(probe.includes(str),str);
});
test("B3B3C PG probe checks non-replay, authority, audit and OFF",()=>{
 for(const str of ['B3B3C_DEFAULT_OFF','B3B3C_ENABLE_AUDIT','B3B3C_STALE_REQUEST','B3B3C_REVOKED_AUTHORITY','B3B3C_PARALLEL_CAS','B3B3C_FINAL_OFF']) assert.ok(probe.includes(str),str);
});

test("B3B3C GET status requires session and ADMIN_SECURITY with no-store",()=>{
 assert.match(api,/export async function GET\(\)/);
 assert.match(api,/hasPermission\(current.user.role, "ADMIN_SECURITY"\)/);
 assert.match(api,/canEnable: process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED === "true"/);
 assert.match(api,/sendAuthorized: false \}, 200/);
});

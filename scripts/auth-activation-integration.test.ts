/** Disposable PostgreSQL + injected HTTP only. No dotenv, real credentials or delivery. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { before, beforeEach, after, afterEach, test } from "node:test";
import { Pool } from "pg";
import { createServer } from "node:http";
const target = process.env.ACTIVATION_TEST_DATABASE_URL;
if (!target) throw new Error("Set ACTIVATION_TEST_DATABASE_URL to disposable PG");
const url = new URL(target);
const local = url.hostname === "127.0.0.1" && ["55522", "55524"].includes(url.port) && url.username === "activation01_qa" && url.pathname === "/activation01_review";
const ci = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" && url.hostname === "127.0.0.1" && url.port === "5432" && url.username === "comic_diary_ci" && url.pathname === "/comic_diary_release";
if (url.protocol !== "postgresql:" || (!local && !ci) || url.search || url.hash) throw new Error("REFUSED non-disposable PG");
Object.assign(process.env, { DATABASE_URL: target, NODE_ENV: "test" });
const pool = new Pool({ connectionString: target });
const origin = "https://reader.example.invalid";
const key = randomBytes(32);
const flags: Record<string,string> = { REGISTRATION_ENABLED: "true", REGISTRATION_ACTIVATION_REDEEM_ENABLED: "true",
 AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED: "true", AUTH_ACTIVATION_WORKER_ENABLED: "true", AUTH_ACTIVATION_DISPATCH_ENABLED: "true",
 AUTH_ACTIVATION_SENDER_VERIFIED: "true", AUTH_ACTIVATION_RESEND_CONFIG_READY: "true", RESEND_API_KEY: "re_SYNTHETIC_NO_REAL_CREDENTIAL",
 AUTH_ACTIVATION_FROM_ADDRESS: "no-reply@example.invalid", AUTH_ACTIVATION_SENDER_DOMAIN: "example.invalid",
 AUTH_ACTIVATION_PUBLIC_ORIGIN: origin, COMIC_DIARY_PUBLIC_ORIGIN: origin,
 AUTH_ACTIVATION_OUTBOX_KEY_ID: "activation-test", AUTH_ACTIVATION_OUTBOX_KEY_BASE64: key.toString("base64") };
let dispatch: typeof import("../src/modules/auth/registration-activation-dispatch");
let registration: typeof import("../src/app/api/auth/register/route");
let resend: typeof import("../src/app/api/auth/activate/request/route");
let redeem: typeof import("../src/app/api/auth/activate/redeem/route");
let service: typeof import("../src/modules/auth/registration-service");
let login: typeof import("../src/modules/auth/login-service");
let operator: typeof import("../src/modules/auth/registration-activation-operator-control");
let finalizer: typeof import("../src/modules/auth/registration-activation-outbox-claim");
let NextRequest: typeof import("next/server").NextRequest;
let email: string;
let calls: number;
let token: string;
let sentKey: string | null;
let initialControl: { enabled: boolean; generation: number; updated_at: Date };
const nativeFetch = globalThis.fetch;
const request = (body: unknown, route = "/api/auth/register", source = origin) => new NextRequest(origin + route, {
 method:"POST", headers: { host:"reader.example.invalid", origin:source, "x-real-ip":"192.0.2.71", "content-type":"application/json" }, body:JSON.stringify(body) });
const register = () => registration.POST(request({ email, password:"Original-Password-123!", passwordConfirm:"Original-Password-123!" }));
const row = async () => (await pool.query("SELECT o.* FROM activation_mail_outbox o JOIN email_verification_tokens t ON t.id=o.verification_token_id JOIN users u ON u.id=t.user_id WHERE u.email=$1 ORDER BY o.id DESC LIMIT 1",[email])).rows[0];
const http = async (endpoint:string, init:RequestInit) => {
 calls++; assert.equal(endpoint,"https://api.resend.com/emails"); assert.equal(init.method,"POST"); assert.equal(init.redirect,"error");
 const body=JSON.parse(String(init.body)); assert.deepEqual(Object.keys(body).sort(),["from","subject","text","to"]);
 assert.deepEqual(body.to,[email]); assert.ok(body.text.includes(origin+"/activate")); assert.ok(!body.text.includes("/activate?"));
 token=body.text.match(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/)[0];
 sentKey=new Headers(init.headers).get("Idempotency-Key");
 return new Response(JSON.stringify({id:"22222222-aaaa-4444-8888-cccccccccccc"}),{status:201});
};
const run = (transport = http, hooks?: Parameters<typeof dispatch.dispatchActivationMailForTest>[0]["hooks"]) => dispatch.dispatchActivationMailForTest({env:process.env,http:transport,hooks});
before(async()=>{
 initialControl=(await pool.query("SELECT enabled,generation,updated_at FROM activation_mail_dispatch_control WHERE id=1")).rows[0];
 assert.ok(initialControl,"migration must seed activation control");
 globalThis.fetch=async()=>{throw new Error("UNMOCKED NETWORK FORBIDDEN");};
 dispatch=await import("../src/modules/auth/registration-activation-dispatch");
 registration=await import("../src/app/api/auth/register/route"); resend=await import("../src/app/api/auth/activate/request/route");
 redeem=await import("../src/app/api/auth/activate/redeem/route"); service=await import("../src/modules/auth/registration-service");
 login=await import("../src/modules/auth/login-service"); operator=await import("../src/modules/auth/registration-activation-operator-control");
 finalizer=await import("../src/modules/auth/registration-activation-outbox-claim"); ({NextRequest}=await import("next/server"));
 console.log("PG_MAJOR="+(await pool.query("SELECT current_setting('server_version_num')::int/10000 AS major")).rows[0].major);
});
beforeEach(async()=>{Object.assign(process.env,flags);email=`activation-${randomUUID()}@example.invalid`;calls=0;token="";sentKey=null;
 await pool.query("UPDATE activation_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1");
 await pool.query("DELETE FROM auth_rate_limits WHERE scope LIKE 'registration%'");
});
afterEach(async()=>{await pool.query("DELETE FROM users WHERE email=$1",[email]);});
after(async()=>{
 try {
  // Disposable fixture ownership ends here. Later CI probes must see the same
  // default-OFF control row, not this suite's last ON/generation fixture.
  if(initialControl) await pool.query("UPDATE activation_mail_dispatch_control SET enabled=$1,generation=$2,updated_at=$3 WHERE id=1",
   [initialControl.enabled,initialControl.generation,initialControl.updated_at]);
 } finally {globalThis.fetch=nativeFetch;key.fill(0);await pool.end();}
});

test("registration -> encrypted outbox -> mock HTTP -> activation -> new-password login",async()=>{
 const response=await register(); assert.equal(response.status,202);assert.equal(response.headers.get("set-cookie"),null);
 assert.deepEqual(await response.json(),{ok:true,activationRequired:true});
 assert.equal(await login.authenticatePasswordLogin(email,"Original-Password-123!"),null);
 const queued=await row(); assert.equal(queued.state,"ready"); assert.equal(queued.attempt_count,0);
 assert.deepEqual(await run(),{status:"recorded",attempted:true,classification:"accepted"}); assert.equal(calls,1);assert.equal(sentKey,queued.idempotency_key);
 assert.ok(!JSON.stringify(queued).includes(token));
 const [user]=(await pool.query("SELECT id FROM users WHERE email=$1",[email])).rows;
 await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[user.id,createHash("sha256").update(randomBytes(32)).digest("hex")]);
 const activate=()=>redeem.POST(request({token,newPassword:"Changed-Password-123!",newPasswordConfirm:"Changed-Password-123!"},"/api/auth/activate/redeem"));
 const results=await Promise.all([activate(),activate()]); assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);
 assert.equal((await pool.query("SELECT count(*)::int n FROM sessions WHERE user_id=$1",[user.id])).rows[0].n,0);
 assert.equal(await login.authenticatePasswordLogin(email,"Original-Password-123!"),null);
 assert.ok(await login.authenticatePasswordLogin(email,"Changed-Password-123!"));
 assert.equal((await run()).attempted,false);assert.equal(calls,1);
});
test("atomic rollback when encrypted outbox insertion fails",async()=>{
 await pool.query("CREATE FUNCTION activation_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic queue failure'; END $$");
 await pool.query("CREATE TRIGGER activation_test_fail BEFORE INSERT ON activation_mail_outbox FOR EACH ROW EXECUTE FUNCTION activation_test_fail()");
 try { assert.equal((await register()).status,503);assert.equal((await pool.query("SELECT count(*)::int n FROM users WHERE email=$1",[email])).rows[0].n,0); }
 finally {await pool.query("DROP TRIGGER activation_test_fail ON activation_mail_outbox");await pool.query("DROP FUNCTION activation_test_fail()");}
});
test("concurrent registration has one account, one code, one queue item; generic duplicates",async()=>{
 const responses=await Promise.all([register(),register(),register()]);assert.ok(responses.every(x=>x.status===202));
 assert.equal((await pool.query("SELECT count(*)::int n FROM email_verification_tokens t JOIN users u ON u.id=t.user_id WHERE u.email=$1",[email])).rows[0].n,1);
 await pool.query("UPDATE users SET email_verified_at=now() WHERE email=$1",[email]);
 assert.deepEqual(await (await register()).json(),{ok:true,activationRequired:true});
});
test("concurrent dispatchers produce one HTTP; finalization after OFF remains valid",async()=>{
 await register(); const results=await Promise.all([run(http,{afterStart:async()=>{await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1");}}),run()]);
 assert.equal(calls,1);assert.ok(results.some(x=>x.status==="recorded"));assert.equal((await row()).state,"accepted");
});
for(const result of ["accepted","rejected","uncertain"] as const) test(`reservation alone cannot finalize ${result}`,async()=>{
 await register(); const outcome=await run(http,{afterReservation:async()=>{
 const item=await row(); assert.equal(item.dispatch_started_at,null);
 assert.equal(await finalizer.finalizeClaimedActivationMail({outboxId:item.id,claimId:item.claim_id,result}),false);
 assert.equal((await row()).state,"in_flight");assert.equal(calls,0);
 }});assert.equal(outcome.status,"recorded");const item=await row();assert.equal(await finalizer.finalizeClaimedActivationMail({outboxId:item.id,claimId:item.claim_id,result}),false);
});
for(const [name,transport,expected] of [
 ["explicit rejection",async()=>new Response("",{status:422}),"rejected"],
 ["lost response",async()=>{throw new Error("lost");},"uncertain"],
 ["rate limit",async()=>new Response("",{status:429}),"uncertain"],
 ["malformed success",async()=>new Response("{}",{status:201}),"uncertain"],
 ["oversized success",async()=>new Response("x".repeat(5000),{status:201}),"uncertain"],
] as const) test(`${name} is terminal; no automatic second HTTP`,async()=>{
 await register();let count=0;const result=await run(async()=>{count++;return transport();});assert.equal(result.classification,expected);
 assert.equal((await row()).state,expected);await run(async()=>{count++;return transport();});assert.equal(count,1);
});
for(const flag of ["REGISTRATION_ENABLED","AUTH_ACTIVATION_WORKER_ENABLED","AUTH_ACTIVATION_DISPATCH_ENABLED","AUTH_ACTIVATION_RESEND_CONFIG_READY","AUTH_ACTIVATION_SENDER_VERIFIED","REGISTRATION_ACTIVATION_REDEEM_ENABLED"]) test(`missing ${flag} blocks public registration`,async()=>{
 delete process.env[flag];assert.equal((await register()).status,503);assert.equal(await row(),undefined);assert.equal(calls,0);
});
test("DB gate OFF blocks creation, leaves existing READY, no HTTP",async()=>{
 await register(); await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false WHERE id=1");
 assert.equal((await register()).status,503); assert.equal((await run()).attempted,false);assert.equal((await row()).state,"ready");assert.equal(calls,0);
});
test("OFF between reservation and start blocks HTTP",async()=>{
 await register();assert.equal((await run(http,{afterReservation:async()=>{await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1");}})).attempted,false);assert.equal(calls,0);
});
test("fresh manual issuance revokes stale code without retrying old uncertain job",async()=>{
 await register();await run(); const old=token; const previous=await row();
 await pool.query("UPDATE email_verification_tokens SET created_at=created_at-interval '2 minutes' WHERE id=$1",[previous.verification_token_id]);
 assert.equal((await resend.POST(request({email},"/api/auth/activate/request"))).status,202);
 assert.notEqual((await row()).id,previous.id);await run();assert.notEqual(token,old);
 assert.equal((await redeem.POST(request({token:old,newPassword:"Changed-Password-123!",newPasswordConfirm:"Changed-Password-123!"}))).status,400);
});
for(const started of [false,true]) test(`abandoned recovery terminalizes stale ${started?"start":"claim"} idempotently`,async()=>{
 await register();await run(http,{[started?"afterStart":"afterReservation"]:async()=>{
 const item=await row(); await pool.query("UPDATE activation_mail_outbox SET claimed_at=claimed_at-interval '10 minutes',dispatch_fence_at=dispatch_fence_at-interval '10 minutes',dispatch_reservation_at=dispatch_reservation_at-interval '10 minutes',dispatch_started_at=CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE dispatch_started_at-interval '10 minutes' END WHERE id=$1",[item.id]);
 assert.equal(await dispatch.recoverAbandonedActivationDispatches(),1);assert.equal(await dispatch.recoverAbandonedActivationDispatches(),0);
 }});assert.equal((await row()).state,"uncertain");assert.equal(calls,started?1:0);await run();assert.equal(calls,started?1:0);
});
test("old claim with fresh start is not abandoned",async()=>{
 await register();await run(http,{afterStart:async()=>{const item=await row();await pool.query("UPDATE activation_mail_outbox SET claimed_at=claimed_at-interval '10 minutes',dispatch_fence_at=dispatch_fence_at-interval '10 minutes',dispatch_reservation_at=dispatch_reservation_at-interval '10 minutes' WHERE id=$1",[item.id]);assert.equal(await dispatch.recoverAbandonedActivationDispatches(),0);}});assert.equal((await row()).state,"accepted");
});
test("Origin, bounded streamed body, shared rate limit",async()=>{
 assert.equal((await registration.POST(request({},"/api/auth/register","https://evil.invalid"))).status,403);
 const large=new NextRequest(origin+"/api/auth/register",{method:"POST",headers:{origin,host:"reader.example.invalid","content-type":"application/json"},body:"x".repeat(5000)});
 assert.equal((await registration.POST(large)).status,413);
 for(let i=0;i<15;i++) await register(); assert.equal((await register()).status,429);
});
test("operator refuses forged actor and redemption OFF",async()=>{
 await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=2 WHERE id=1");
 assert.equal((await operator.transitionActivationDispatchControl({actorUserId:2147483646,actorSessionId:2147483646,expectedGeneration:2,enabled:true})).ok,false);
 delete process.env.REGISTRATION_ACTIVATION_REDEEM_ENABLED;
 assert.equal((await operator.transitionActivationDispatchControl({actorUserId:1,actorSessionId:1,expectedGeneration:2,enabled:true})).ok,false);
});

test("ADMIN_SECURITY live session ON/OFF uses audited CAS; ordinary user cannot enable",async()=>{
 const actorEmail=`operator-${randomUUID()}@example.invalid`;
 const [actor]=(await pool.query("INSERT INTO users(email,role,is_active,email_verified_at) VALUES($1,'USER',true,now()) RETURNING id",[actorEmail])).rows;
 const [session]=(await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id",[actor.id,createHash("sha256").update(randomBytes(32)).digest("hex")])).rows;
 try {
  await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=10 WHERE id=1");
  const input={actorUserId:actor.id,actorSessionId:session.id,expectedGeneration:10,enabled:true};
  assert.equal((await operator.transitionActivationDispatchControl(input)).ok,false);
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1",[actor.id]);
  assert.equal((await operator.transitionActivationDispatchControl(input)).ok,true);
  assert.equal((await operator.transitionActivationDispatchControl(input)).ok,false);
  delete process.env.REGISTRATION_ACTIVATION_REDEEM_ENABLED;
  assert.equal((await operator.transitionActivationDispatchControl({...input,expectedGeneration:11,enabled:false})).ok,true);
  assert.equal((await operator.transitionActivationDispatchControl({...input,expectedGeneration:12})).ok,false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM administrative_audit_events WHERE actor_user_id=$1 AND action='ACTIVATION_DISPATCH_CONTROL_CHANGE'",[actor.id])).rows[0].n,2);
 } finally {await pool.query("DELETE FROM administrative_audit_events WHERE actor_user_id=$1",[actor.id]);await pool.query("DELETE FROM users WHERE id=$1",[actor.id]);}
});
test("independent account dispatch progresses while another HTTP is pending",async()=>{
 await register();const second=`parallel-${randomUUID()}@example.invalid`;
 await service.registerPasswordUser(second,"Original-Password-123!");
 let release!:()=>void;let entered!:()=>void;
 const waiting=new Promise<void>(resolve=>{entered=resolve;});
 const held=new Promise<void>(resolve=>{release=resolve;});
 const first=run(async()=>{entered();await held;return new Response(JSON.stringify({id:"22222222-aaaa-4444-8888-cccccccccccc"}),{status:201});});
 try {await waiting;const other=await run(async()=>new Response("",{status:422}));assert.equal(other.classification,"rejected");}
 finally {release();await first;await pool.query("DELETE FROM users WHERE email=$1",[second]);}
});
test("recovery rechecks a fresh start committed while waiting on a USER lock",async()=>{
 await register();
 const locker=await pool.connect();
 let recovery:Promise<number>|undefined;
 try {
  await run(http,{afterReservation:async()=>{
    const item=await row();
    await pool.query("UPDATE activation_mail_outbox SET claimed_at=claimed_at-interval '10 minutes',dispatch_fence_at=dispatch_fence_at-interval '10 minutes',dispatch_reservation_at=dispatch_reservation_at-interval '10 minutes' WHERE id=$1",[item.id]);
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM users WHERE email=$1 FOR UPDATE",[email]);
    recovery=dispatch.recoverAbandonedActivationDispatches();
    // Observe PostgreSQL blocking rather than assuming timing/order from a sleep.
    let blocked=false;
    for(let i=0;i<100;i++) {
      const result=await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%users%' AND pid<>pg_backend_pid()");
      if(result.rows[0].n>0){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(blocked,true);
    // Simulate the already-authorized start writer holding USER before recovery.
    await locker.query("UPDATE activation_mail_outbox SET dispatch_started_at=now(),updated_at=now() WHERE id=$1",[item.id]);
    await locker.query("COMMIT");
    assert.equal(await recovery,0);
  }});
  assert.equal((await row()).state,"in_flight");assert.equal(calls,0);
 } finally {await locker.query("ROLLBACK");locker.release();await recovery;}
});

test("actual loopback HTTP mock receives persisted idempotency key once",async()=>{
 await register(); const queued=await row(); let received=0;
 const server=createServer((req,res)=>{received++;assert.equal(req.method,"POST");assert.equal(req.headers["idempotency-key"],queued.idempotency_key);req.resume();req.on("end",()=>{res.writeHead(201,{"Content-Type":"application/json"});res.end(JSON.stringify({id:"22222222-aaaa-4444-8888-cccccccccccc"}));});});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try {const address=server.address();assert.ok(address&&typeof address!=="string");
 const localHttp=(_url:string,init:RequestInit)=>nativeFetch(`http://127.0.0.1:${address.port}/emails`,init);
 assert.equal((await run(localHttp)).classification,"accepted");await run(localHttp);assert.equal(received,1);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("expired code cannot redeem and a fresh manual request remains available",async()=>{
 await register();await run();const expired=token;const previous=await row();
 await pool.query("UPDATE email_verification_tokens SET created_at=created_at-interval '1 hour',expires_at=$2 WHERE id=$1",[previous.verification_token_id,new Date(Date.now()-1000)]);
 assert.equal((await redeem.POST(request({token:expired,newPassword:"Changed-Password-123!",newPasswordConfirm:"Changed-Password-123!"}))).status,400);
 assert.equal((await resend.POST(request({email},"/api/auth/activate/request"))).status,202);assert.notEqual((await row()).id,previous.id);
});
test("hourly issuance limit and cooldown do not change the original password",async()=>{
 await register();
 for(let i=0;i<7;i++) {
  await pool.query("UPDATE email_verification_tokens SET created_at=$2 WHERE user_id=(SELECT id FROM users WHERE email=$1)",[email,new Date(Date.now()-120_000)]);
  assert.equal((await service.registerPasswordUser(email,"Attacker-Password-123!")).ok,true);
 }
 assert.equal((await pool.query("SELECT count(*)::int n FROM email_verification_tokens WHERE user_id=(SELECT id FROM users WHERE email=$1)",[email])).rows[0].n,5);
 const pw=await import("../src/modules/auth/password");const account=(await pool.query("SELECT password_hash FROM users WHERE email=$1",[email])).rows[0];
 assert.equal(await pw.verifyPassword(account.password_hash,"Original-Password-123!"),true);
 assert.equal(await pw.verifyPassword(account.password_hash,"Attacker-Password-123!"),false);
});
test("forged public dispatch arguments cannot select or authorize a job",async()=>{
 await register();assert.equal((await dispatch.dispatchNextActivationMail({sendAuthorized:true})).attempted,false);assert.equal((await row()).state,"ready");assert.equal(calls,0);
});

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { hashPassword } from "../src/modules/auth/password";
import { hashSessionToken } from "../src/modules/auth/session-token";
const target=process.env.PILOT_TEST_DATABASE_URL;
if(!target)throw Error("explicit disposable PILOT_TEST_DATABASE_URL required");
const url=new URL(target);
const local=url.hostname==='127.0.0.1'&&url.port==='55526'&&url.username==='purpose01_qa'&&url.pathname==='/purpose01_review';
const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&url.hostname==='127.0.0.1'&&url.port==='5432'&&url.username==='comic_diary_ci'&&url.pathname==='/comic_diary_release';
if(url.protocol!=='postgresql:'||(!local&&!ci)||url.search||url.hash)throw Error('REFUSED non-disposable DB');
Object.assign(process.env,{DATABASE_URL:target,NODE_ENV:'test'});
const pool=new Pool({connectionString:target});const origin='https://reader.example.invalid';const key=randomBytes(32),password='old';
const flags={AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED:'true',AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED:'true',REGISTRATION_ACTIVATION_REDEEM_ENABLED:'true',AUTH_ACTIVATION_WORKER_ENABLED:'true',AUTH_ACTIVATION_DISPATCH_ENABLED:'true',AUTH_ACTIVATION_RESEND_CONFIG_READY:'true',AUTH_ACTIVATION_SENDER_VERIFIED:'true',AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED:'true',RESEND_API_KEY:'re_SYNTHETIC_NOT_A_REAL_KEY',AUTH_ACTIVATION_FROM_ADDRESS:'mail@example.invalid',AUTH_ACTIVATION_SENDER_DOMAIN:'example.invalid',AUTH_ACTIVATION_PUBLIC_ORIGIN:origin,COMIC_DIARY_PUBLIC_ORIGIN:origin,AUTH_ACTIVATION_OUTBOX_KEY_ID:'pilot-test',AUTH_ACTIVATION_OUTBOX_KEY_BASE64:key.toString('base64')};
let service:typeof import('../src/modules/auth/legacy-email-verification-service');let dispatch:typeof import('../src/modules/auth/registration-activation-dispatch');let hash:string;let session:string;let foreign:string;const nativeFetch=globalThis.fetch;
const query=(sql:string,values:unknown[]=[])=>pool.query(sql,values);
const control=async()=>(await query('SELECT * FROM activation_mail_dispatch_control WHERE id=1')).rows[0];
const jobs=async()=>(await query('SELECT * FROM activation_mail_outbox ORDER BY id')).rows;
const issue=()=>service.requestOwnLegacyEmailVerification(session,password);
const transport=(outcome='accepted',count?:()=>void)=>async()=>{count?.();if(outcome==='uncertain')throw Error('lost response');return new Response(outcome==='accepted'?JSON.stringify({id:'22222222-aaaa-4444-8888-cccccccccccc'}):'',{status:outcome==='accepted'?201:422});};
before(async()=>{assert.equal((await query("SELECT current_setting('server_version_num')::int/10000 major")).rows[0].major,17);hash=await hashPassword(password);globalThis.fetch=async()=>{throw Error('UNMOCKED HTTP FORBIDDEN');};service=await import('../src/modules/auth/legacy-email-verification-service');dispatch=await import('../src/modules/auth/registration-activation-dispatch');});
beforeEach(async()=>{
 Object.assign(process.env,flags);
 // Only this guarded disposable suite resets fixture data; runtime has no reset API.
 await query('TRUNCATE users CASCADE');await query('TRUNCATE auth_rate_limits');await query('DELETE FROM activation_mail_dispatch_control');await query('INSERT INTO activation_mail_dispatch_control(id,enabled,generation,pilot_id,pilot_user_id,pilot_armed_at) VALUES(1,true,1,$1,1,$2)',[randomUUID(),new Date()]);
 await query("INSERT INTO users(id,email,password_hash,verification_required_at) VALUES(1,'pilot@example.invalid',$1,NULL),(2,'foreign@example.invalid',$1,NULL)",[hash]);
 session=randomBytes(32).toString('base64url');foreign=randomBytes(32).toString('base64url');
 await query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(1,$1,now()+interval '1 hour'),(2,$2,now()+interval '1 hour')",[hashSessionToken(session),hashSessionToken(foreign)]);
});
after(async()=>{globalThis.fetch=nativeFetch;key.fill(0);await query('TRUNCATE users CASCADE');await query('DELETE FROM activation_mail_dispatch_control');await query('INSERT INTO activation_mail_dispatch_control(id) VALUES(1)');await pool.end();});
test('parallel requests pin one job; replay and foreign account cannot issue',async()=>{const result=await Promise.all(Array.from({length:6},()=>issue()));assert.equal(result.filter(x=>x.ok).length,1);assert.equal((await jobs()).length,1);assert.equal((await control()).pilot_outbox_id,(await jobs())[0].id);assert.equal((await issue()).ok,false);assert.equal((await service.requestOwnLegacyEmailVerification(foreign,password)).ok,false);assert.equal((await jobs()).length,1);});
test('HTTP client user ID/purpose/outbox substitutions are rejected',async()=>{const route=await import('../src/app/api/account/email-verification/request/route');for(const extra of [{userId:1},{outboxId:1},{purpose:'legacy_email_verification'}]){const response=await route.POST(new NextRequest(origin+'/api/account/email-verification/request',{method:'POST',headers:{host:'reader.example.invalid',origin,'x-real-ip':'2001:db8:48::1','content-type':'application/json',cookie:'comic_diary_session='+foreign},body:JSON.stringify({currentPassword:password,...extra})}));assert.equal(response.status,400);}assert.equal((await jobs()).length,0);});
for(const outcome of ['accepted','rejected','uncertain'])test('concurrent workers '+outcome+' consume lifetime budget once',async()=>{assert.ok((await issue()).ok);let calls=0;const http=transport(outcome,()=>calls++);await Promise.all(Array.from({length:4},()=>dispatch.dispatchActivationMailForTest({env:process.env,http})));assert.equal(calls,1);assert.equal((await jobs())[0].state,outcome);assert.ok((await control()).pilot_dispatch_used_at);await query('UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1');await query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=generation+1 WHERE id=1');delete process.env.AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED;await dispatch.dispatchActivationMailForTest({env:process.env,http});Object.assign(process.env,flags);await dispatch.dispatchActivationMailForTest({env:{...process.env},http});assert.equal(calls,1);assert.equal((await issue()).ok,false);});
for(const stage of ['afterReservation','afterStart'] as const)test('crash '+stage+' never refunds job or budget',async()=>{await issue();let calls=0;await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++),hooks:{[stage]:async()=>{throw Error('simulated crash');}}});assert.equal(calls,0);assert.equal((await issue()).ok,false);const dateNow=Date.now;Date.now=()=>dateNow()+6*60_000;try{assert.equal(await dispatch.recoverAbandonedActivationDispatches(),1);}finally{Date.now=dateNow;}assert.equal((await jobs())[0].state,'uncertain');await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,0);});
test('lost start commit acknowledgement persists spent budget and performs zero HTTP',async()=>{await issue();const {db}=await import('../src/db');const original=db.transaction;const bound=original.bind(db);db.transaction=((...args:Parameters<typeof bound>)=>bound(...args).then(result=>{if(result&&typeof result==='object'&&'body' in result&&'startedAt' in result)throw Error('lost COMMIT acknowledgement');return result;})) as typeof db.transaction;let calls=0;try{await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});}finally{db.transaction=original;}assert.equal(calls,0);assert.ok((await control()).pilot_dispatch_used_at);assert.ok((await jobs())[0].dispatch_started_at);await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,0);});
test('OFF after start still settles; second finalize cannot settle',async()=>{await issue();const sent=await dispatch.dispatchActivationMailForTest({env:process.env,http:transport(),hooks:{afterStart:async()=>{await query('UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1');}}});assert.equal(sent.status,'recorded');const job=(await jobs())[0];const {finalizeClaimedActivationMail}=await import('../src/modules/auth/registration-activation-outbox-claim');assert.equal(await finalizeClaimedActivationMail({outboxId:job.id,claimId:job.claim_id,result:'uncertain'}),false);});
test('ordinary pending queue is skipped before LIMIT and preserved while pilot active or closed',async()=>{const {enqueuePendingActivationMailForUser}=await import('../src/modules/auth/registration-activation-outbox-issue');for(let i=3;i<21;i++){await query("INSERT INTO users(id,email,password_hash,verification_required_at) VALUES($1,$2,$3,now())",[i,'pending-'+i+'@example.invalid',hash]);assert.ok((await enqueuePendingActivationMailForUser({userId:i,publicOrigin:origin,key:{keyId:'pilot-test',bytes:key}})).ok);}assert.ok((await issue()).ok);let calls=0;await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,1);const pending=await jobs();assert.equal(pending.filter(x=>x.state==='ready').length,18);await query('UPDATE activation_mail_dispatch_control SET enabled=false,pilot_closed_at=clock_timestamp() WHERE id=1');await query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=generation+1 WHERE id=1');await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,1);assert.equal((await jobs()).filter(x=>x.state==='ready').length,18);});
test('DB write-once trigger rejects retargeting, job substitution and refunds',async()=>{await issue();await dispatch.dispatchActivationMailForTest({env:process.env,http:transport()});for(const assignment of ['pilot_id=NULL,pilot_user_id=NULL,pilot_armed_at=NULL','pilot_user_id=2','pilot_outbox_id=pilot_outbox_id+1','pilot_dispatch_used_at=NULL'])await assert.rejects(query('UPDATE activation_mail_dispatch_control SET '+assignment+' WHERE id=1'),{code:'23514'});});
test('start rechecks closure after reservation; no fallback to general dispatch',async()=>{await issue();let calls=0;await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++),hooks:{afterReservation:async()=>{await query('UPDATE activation_mail_dispatch_control SET pilot_closed_at=clock_timestamp() WHERE id=1');}}});assert.equal(calls,0);assert.equal((await control()).pilot_dispatch_used_at,null);assert.equal((await issue()).ok,false);});
import { spawnSync } from 'node:child_process';
test('operator arm is one-shot and close preserves durable identity and budget',async()=>{await query('DELETE FROM activation_mail_dispatch_control');await query('INSERT INTO activation_mail_dispatch_control(id) VALUES(1)');const operator=(command:string,generation='0')=>spawnSync(process.execPath,['scripts/auth-activation-pilot-control.mjs',command,generation],{encoding:'utf8',env:{PATH:process.env.PATH,DATABASE_URL:target,NODE_ENV:'test'}});assert.equal(operator('arm').status,0);const armed=await control();assert.equal(armed.pilot_user_id,1);assert.equal(operator('arm').status,1);await query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1');await issue();assert.equal(operator('close','1').status,1);await query('UPDATE activation_mail_dispatch_control SET enabled=false,generation=2 WHERE id=1');assert.equal(operator('close','2').status,0);const closed=await control();assert.equal(closed.pilot_id,armed.pilot_id);assert.ok(closed.pilot_outbox_id);assert.ok(closed.pilot_closed_at);assert.equal(operator('arm','2').status,1);await query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=3 WHERE id=1');let calls=0;await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,0);});
test('enqueue failure rolls back pilot pin and challenge; retry can create only one job',async()=>{await query("CREATE FUNCTION pilot_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic insertion fault'; END $$");await query('CREATE TRIGGER pilot_fail_insert BEFORE INSERT ON activation_mail_outbox FOR EACH ROW EXECUTE FUNCTION pilot_fail_insert()');try{await assert.rejects(issue());assert.equal((await jobs()).length,0);assert.equal((await control()).pilot_outbox_id,null);assert.equal((await query('SELECT count(*)::int n FROM email_verification_tokens')).rows[0].n,0);}finally{await query('DROP TRIGGER pilot_fail_insert ON activation_mail_outbox');await query('DROP FUNCTION pilot_fail_insert()');}assert.ok((await issue()).ok);assert.equal((await issue()).ok,false);});
test('outbox start write failure atomically rolls back budget consumption',async()=>{await issue();await query("CREATE FUNCTION pilot_fail_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic start fault'; END $$");await query('CREATE TRIGGER pilot_fail_start BEFORE UPDATE OF dispatch_started_at ON activation_mail_outbox FOR EACH ROW EXECUTE FUNCTION pilot_fail_start()');let calls=0;try{await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,0);assert.equal((await control()).pilot_dispatch_used_at,null);assert.equal((await jobs())[0].dispatch_started_at,null);}finally{await query('DROP TRIGGER pilot_fail_start ON activation_mail_outbox');await query('DROP FUNCTION pilot_fail_start()');}});
test('start waiting on CONTROL observes committed closure and never sends',async()=>{await issue();const locker=await pool.connect();let reached!:()=>void;const ready=new Promise<void>(resolve=>{reached=resolve;});let calls=0;const worker=dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++),hooks:{afterReservation:async()=>{await locker.query('BEGIN');await locker.query('SELECT id FROM activation_mail_dispatch_control WHERE id=1 FOR UPDATE');reached();}}});try{await ready;let waited=false;for(let i=0;i<200;i++){const row=(await query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%activation_mail_dispatch_control%for update%'")).rows[0];if(row.n>0){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,5));}assert.ok(waited,'independent worker must actually wait for CONTROL');await locker.query('UPDATE activation_mail_dispatch_control SET pilot_closed_at=clock_timestamp() WHERE id=1');await locker.query('COMMIT');await worker;assert.equal(calls,0);assert.equal((await control()).pilot_dispatch_used_at,null);}finally{await locker.query('ROLLBACK');locker.release();await worker;}});
test('abandoned recovery cannot terminalize an unrelated in-flight pending job',async()=>{const {enqueuePendingActivationMailForUser}=await import('../src/modules/auth/registration-activation-outbox-issue');await query("INSERT INTO users(id,email,password_hash,verification_required_at) VALUES(3,'unrelated@example.invalid',$1,now())",[hash]);assert.ok((await enqueuePendingActivationMailForUser({userId:3,publicOrigin:origin,key:{keyId:'pilot-test',bytes:key}})).ok);const [job]=await jobs();await query("UPDATE activation_mail_outbox SET state='in_flight',attempt_count=1,claim_id=$1,claimed_at=created_at WHERE id=$2",[randomBytes(24).toString('base64url'),job.id]);const before=await jobs();const dateNow=Date.now;Date.now=()=>dateNow()+6*60_000;try{assert.equal(await dispatch.recoverAbandonedActivationDispatches(),0);}finally{Date.now=dateNow;}assert.deepEqual(await jobs(),before);});
test('new worker process cannot refund consumed budget',async()=>{await issue();let calls=0;await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});const code=`globalThis.fetch=async()=>{throw Error('UNMOCKED HTTP FORBIDDEN')};const m=await import('./src/modules/auth/registration-activation-dispatch.ts');const {dispatchActivationMailForTest}=m.default??m;let calls=0;const result=await dispatchActivationMailForTest({env:process.env,http:async()=>{calls++;throw Error('forbidden')}});console.log(JSON.stringify({calls,status:result.status}));`;const restarted=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:target,...flags}});assert.equal(restarted.status,0,restarted.stderr);assert.equal(JSON.parse(restarted.stdout).calls,0);assert.equal(calls,1);});
test('crash after HTTP before finalization becomes uncertain without resend',async()=>{await issue();let calls=0;const result=await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++),hooks:{beforeFinalize:async()=>{throw Error('worker crash after HTTP');}}});assert.equal(result.status,'not_recorded');assert.equal(calls,1);const real=Date.now;Date.now=()=>real()+6*60_000;try{assert.equal(await dispatch.recoverAbandonedActivationDispatches(),1);}finally{Date.now=real;}assert.equal((await jobs())[0].state,'uncertain');await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,1);});
test('lost issuance commit acknowledgement cannot create a second outbox',async()=>{const {db}=await import('../src/db');const original=db.transaction;const bound=original.bind(db);db.transaction=((...args:Parameters<typeof bound>)=>bound(...args).then(result=>{if(result&&typeof result==='object'&&'ok' in result&&result.ok===true)throw Error('lost issue COMMIT acknowledgement');return result;})) as typeof db.transaction;try{await assert.rejects(issue());}finally{db.transaction=original;}assert.equal((await jobs()).length,1);assert.equal((await issue()).ok,false);let calls=0;await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,1);});
test('pilot code redeems once after spent budget without password or session mutation',async()=>{await issue();let code='';await dispatch.dispatchActivationMailForTest({env:process.env,http:async(_url,init)=>{code=JSON.parse(String(init.body)).text.match(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/)[0];return transport()();}});const before=(await query('SELECT password_hash,verification_required_at FROM users WHERE id=1')).rows[0];const sessions=(await query('SELECT * FROM sessions ORDER BY id')).rows;assert.ok((await service.redeemOwnLegacyEmailVerification(session,password,code)).ok);assert.equal((await service.redeemOwnLegacyEmailVerification(session,password,code)).ok,false);assert.deepEqual((await query('SELECT password_hash,verification_required_at FROM users WHERE id=1')).rows[0],before);assert.deepEqual((await query('SELECT * FROM sessions ORDER BY id')).rows,sessions);assert.equal((await issue()).ok,false);});

// Operator tests run the actual standalone CLI with a deliberately isolated env.
const operatorSwitches = [
 'PASSWORD_RESET_REQUEST_ENABLED','PASSWORD_RESET_REQUEST_MAIL_READY','PASSWORD_RESET_REDEEM_ENABLED',
 'AUTH_RECOVERY_WORKER_ENABLED','AUTH_RECOVERY_DISPATCH_ENABLED','AUTH_RECOVERY_SENDER_VERIFIED','AUTH_RECOVERY_RESEND_CONFIG_READY',
 'REGISTRATION_ENABLED','REGISTRATION_ACTIVATION_REDEEM_ENABLED','AUTH_ACTIVATION_RESEND_CONFIG_READY',
 'AUTH_ACTIVATION_SENDER_VERIFIED','AUTH_ACTIVATION_DISPATCH_ENABLED','AUTH_ACTIVATION_WORKER_ENABLED',
 'AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED','AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED','AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED',
 'AUTH_BETA_INVITATION_REGISTRATION_ENABLED','AUTH_BETA_INVITATION_DISPATCH_ENABLED',
];
const allOff = Object.fromEntries(operatorSwitches.map(name => [name,'false']));
function runOperator(command:string, generation?:string, env:Record<string,string>={}) {
 return spawnSync(process.execPath,['scripts/auth-activation-pilot-control.mjs',command,...(generation===undefined?[]:[generation])],
  {encoding:'utf8',env:{PATH:process.env.PATH,DATABASE_URL:target,NODE_ENV:'test',...env}});
}
async function unarmed() {
 await query('DELETE FROM activation_mail_dispatch_control');
 await query('INSERT INTO activation_mail_dispatch_control(id) VALUES(1)');
 await query('UPDATE password_reset_mail_dispatch_control SET enabled=false WHERE id=1');
}
function operatorStatus() {
 const result=runOperator('status');assert.equal(result.status,0,result.stderr);
 const parsed=JSON.parse(result.stdout);
 assert.deepEqual(Object.keys(parsed).sort(),['enabled','generation','pilot_id','pilot_user_id','pilot_outbox_id','pilot_armed_at','pilot_dispatch_used_at','pilot_closed_at','outbox'].sort());
 assert.deepEqual(Object.keys(parsed.outbox).sort(),['pinned','exists','state','dispatchStarted','finalized'].sort());
 return parsed;
}
for (const name of operatorSwitches) test('arm rejects individually enabled '+name,async()=>{
 await unarmed();const before=await control();const result=runOperator('arm','0',{...allOff,[name]:'true'});
 assert.equal(result.status,1);assert.deepEqual(await control(),before);assert.equal((await jobs()).length,0);
});
test('arm rejects malformed values on every switch without echoing values',async()=>{
 await unarmed();const before=await control();
 for(const name of operatorSwitches)for(const value of ['', 'TRUE', '1', 'false ', 'private-invalid-value']) {
  const result=runOperator('arm','0',{...allOff,[name]:value});assert.equal(result.status,1,name+': invalid value accepted');
  if(value)assert.ok(!result.stdout.includes(value)&&!result.stderr.includes(value),'must not echo configuration values');
 }
 assert.deepEqual(await control(),before);assert.equal((await jobs()).length,0);
});
for(const mode of ['explicit OFF','absent default OFF'])test('arm succeeds with all 16 '+mode,async()=>{
 await unarmed();const result=runOperator('arm','0',mode==='explicit OFF'?allOff:{});assert.equal(result.status,0,result.stderr);
 const row=await control();assert.ok(row.pilot_id);assert.equal(row.pilot_user_id,1);assert.equal(row.enabled,false);assert.equal(row.generation,0);
 // Arming requirements do not prohibit later approved activation configuration.
 await query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1');
 assert.ok((await issue()).ok);let calls=0;await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});
 assert.equal(calls,1);assert.ok((await control()).pilot_dispatch_used_at);
 assert.equal(runOperator('arm','1',allOff).status,1);
});
test('all OFF does not bypass gate, generation, target or queue preconditions',async()=>{
 await unarmed();assert.equal(runOperator('arm','1',allOff).status,1);
 await query('UPDATE password_reset_mail_dispatch_control SET enabled=true,generation=generation+1 WHERE id=1');assert.equal(runOperator('arm','0',allOff).status,1);
 await query('UPDATE password_reset_mail_dispatch_control SET enabled=false WHERE id=1');
 await query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1');assert.equal(runOperator('arm','1',allOff).status,1);
 await query('UPDATE activation_mail_dispatch_control SET enabled=false WHERE id=1');
 await query('UPDATE users SET is_active=false WHERE id=1');assert.equal(runOperator('arm','1',allOff).status,1);
 await query('UPDATE users SET is_active=true WHERE id=1');
 const {enqueuePendingActivationMailForUser}=await import('../src/modules/auth/registration-activation-outbox-issue');
 await query("INSERT INTO users(id,email,password_hash,verification_required_at) VALUES(3,'pending-preflight@example.invalid',$1,now())",[hash]);
 assert.ok((await enqueuePendingActivationMailForUser({userId:3,publicOrigin:origin,key:{keyId:'pilot-test',bytes:key}})).ok);
 assert.equal(runOperator('arm','1',allOff).status,1);assert.equal((await control()).pilot_id,null);assert.equal((await jobs())[0].state,'ready');
});
test('status distinguishes no pinned job from missing pinned row and never mutates CONTROL',async()=>{
 const before=await control();assert.deepEqual(operatorStatus().outbox,{pinned:false,exists:false,state:null,dispatchStarted:false,finalized:false});assert.deepEqual(await control(),before);
 await issue();const pinned=await control();await query('DELETE FROM activation_mail_outbox WHERE id=$1',[pinned.pilot_outbox_id]);
 assert.deepEqual(operatorStatus().outbox,{pinned:true,exists:false,state:null,dispatchStarted:false,finalized:false});assert.deepEqual(await control(),pinned);assert.equal((await issue()).ok,false);
});
test('status safely reports READY job',async()=>{
 await issue();const before=await jobs();assert.deepEqual(operatorStatus().outbox,{pinned:true,exists:true,state:'ready',dispatchStarted:false,finalized:false});assert.deepEqual(await jobs(),before);
});
for(const stage of ['afterReservation','afterStart'] as const)test('status safely reports IN_FLIGHT '+stage,async()=>{
 await issue();await dispatch.dispatchActivationMailForTest({env:process.env,http:transport(),hooks:{[stage]:async()=>{throw Error('pause worker');}}});
 assert.deepEqual(operatorStatus().outbox,{pinned:true,exists:true,state:'in_flight',dispatchStarted:stage==='afterStart',finalized:false});
});
for(const outcome of ['accepted','rejected','uncertain'])test('status safely reports terminal '+outcome,async()=>{
 await issue();await dispatch.dispatchActivationMailForTest({env:process.env,http:transport(outcome)});
 assert.deepEqual(operatorStatus().outbox,{pinned:true,exists:true,state:outcome,dispatchStarted:true,finalized:true});
});
test('close warns for committed start without cancelling HTTP, settlement or restoring budget',async()=>{
 await issue();let calls=0;let warning='';const sent=await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++),hooks:{afterStart:async()=>{
  const spent=await control();await query('UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1');
  const result=runOperator('close','2');assert.equal(result.status,0,result.stderr);warning=result.stderr;
  assert.match(warning,/start was already committed; the HTTP operation may still complete/);
  const closed=await control();assert.deepEqual(closed.pilot_dispatch_used_at,spent.pilot_dispatch_used_at);assert.equal(closed.pilot_outbox_id,spent.pilot_outbox_id);assert.ok(closed.pilot_closed_at);
 }}});
 assert.equal(calls,1);assert.equal(sent.status,'recorded');assert.equal((await jobs())[0].state,'accepted');
 await query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=generation+1 WHERE id=1');
 await dispatch.dispatchActivationMailForTest({env:process.env,http:transport('accepted',()=>calls++)});assert.equal(calls,1);assert.equal((await issue()).ok,false);
});

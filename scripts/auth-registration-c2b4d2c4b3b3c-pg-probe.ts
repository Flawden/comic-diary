/** B3B3C: CI-only operator transitions and audit proof (NO sending). */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
function requireDisposableCiDatabase(): string {
 const url=process.env.DATABASE_URL;
 if(!url || process.env.GITHUB_ACTIONS!=="true" ||
    process.env.GITHUB_REPOSITORY!=="Flawden/comic-diary" ||
    process.env.GITHUB_WORKFLOW!=="CI") throw new Error("REFUSED: CI-only database");
 let x:URL;try{x=new URL(url);}catch{throw new Error("REFUSED: malformed database URL");}
 if(x.protocol!=="postgresql:" || x.hostname!=="127.0.0.1" || x.port!=="5432" ||
    x.pathname!=="/comic_diary_release" || x.username!=="comic_diary_ci" ||
    x.password!=="ci_ephemeral_password" || x.search || x.hash)
    throw new Error("REFUSED: database is not disposable CI");
 return url;
}
async function main():Promise<void> {
 const connectionString=requireDisposableCiDatabase();
 const { transitionActivationDispatchControl: change } = await import("../src/modules/auth/registration-activation-operator-control");
 const pool = new Pool({connectionString,connectionTimeoutMillis:5000,max:6});
 let userId:number|null=null;
 let sessionId:number|null=null;
 const previous=process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED;
 const denied={ok:false,kind:"blocked",sendAuthorized:false};
 const conflict={ok:false,kind:"conflict",sendAuthorized:false};
 const query=async<T extends Record<string,unknown>>(sql:string,args:unknown[]=[]) =>
   (await pool.query<T>(sql,args)).rows;
 const state=async()=>{
   const x=await query<{enabled:boolean;generation:number}>(
      "SELECT enabled,generation FROM activation_mail_dispatch_control WHERE id=1");
   assert.equal(x.length,1);return x[0]!;
 };
 const audits=async()=>query<{details:Record<string,unknown>}>(
   "SELECT details FROM administrative_audit_events WHERE actor_user_id=$1 AND action='ACTIVATION_DISPATCH_CONTROL_CHANGE' ORDER BY id",[userId]);
 try {
  const pg=await query<{major:number}>("SELECT current_setting('server_version_num')::int/10000 AS major");
  assert.equal(pg[0]?.major,17);
  const start=await state();
  assert.equal(start.enabled,false,"earlier disposable PG probe must leave gate OFF");
  const ids=await query<{id:number}>(
    "INSERT INTO users(email,password_hash,role,is_active,email_verified_at) VALUES($1,$2,'ADMIN',true,now()) RETURNING id",
    [`b3b3c-${randomUUID()}@example.invalid`,"ci-unused-hash"]);
  userId=ids[0]!.id;
  const s=await query<{id:number}>(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes') RETURNING id",
    [userId,randomBytes(32).toString("hex")]);
  sessionId=s[0]!.id;
  const changeAs=(enabled:boolean,generation:number)=>change({
    actorUserId:userId!,actorSessionId:sessionId!,enabled,expectedGeneration:generation,
  });
  delete process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED;
  assert.deepEqual(await changeAs(true,start.generation),denied);
  assert.deepEqual(await state(),start);
  console.log("B3B3C_DEFAULT_OFF=PASS");

  process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED="true"; // disposable CI probe ONLY
  const on=await changeAs(true,start.generation);
  assert.deepEqual(on,{ok:true,enabled:true,generation:start.generation+1,sendAuthorized:false});
  if (on.ok !== true) throw new Error("CI fixture: enable transition blocked");
  assert.equal((await audits()).length,1);
  assert.deepEqual((await audits())[0]?.details,{
    previousEnabled:false, enabled:true,previousGeneration:start.generation,
    generation:start.generation+1,sendAuthorized:false,
  });
  console.log("B3B3C_ENABLE_AUDIT=PASS");

  assert.deepEqual(await changeAs(true,start.generation),conflict);
  assert.deepEqual(await changeAs(true,on.generation),conflict);
  assert.equal((await audits()).length,1);
  console.log("B3B3C_STALE_REQUEST=PASS");

  const off=await changeAs(false,on.generation);
  assert.deepEqual(off,{ok:true,enabled:false,generation:on.generation+1,sendAuthorized:false});
  if (off.ok !== true) throw new Error("CI fixture: disable transition blocked");
  assert.equal((await audits()).length,2);

  await pool.query("UPDATE users SET role='USER' WHERE id=$1",[userId]);
  assert.deepEqual(await changeAs(true,off.generation),denied);
  assert.deepEqual(await state(),{enabled:false,generation:off.generation});
  assert.equal((await audits()).length,2);
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1",[userId]);
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[sessionId]);
  assert.deepEqual(await changeAs(true,off.generation),denied);
  assert.equal((await audits()).length,2);
  await pool.query("UPDATE sessions SET expires_at=now()+interval '30 minutes' WHERE id=$1",[sessionId]);
  console.log("B3B3C_REVOKED_AUTHORITY=PASS");

  const concurrent=await Promise.all([changeAs(true,off.generation),changeAs(true,off.generation)]);
  assert.equal(concurrent.filter(x=>x.ok).length,1);
  assert.equal(concurrent.filter(x=>x.ok === false && x.kind==="conflict").length,1);
  assert.equal((await audits()).length,3);
  const at=await state();assert.deepEqual(at,{enabled:true,generation:off.generation+1});
  console.log("B3B3C_PARALLEL_CAS=PASS");

  // Serialized disable wins over a later ON attempt carrying a stale epoch.
  const blocker=await pool.connect();let open=false;
  try {
    await blocker.query("BEGIN");open=true;
    await blocker.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1,updated_at=now() WHERE id=1");
    let done=false;const waiting=changeAs(false,at.generation).then(r=>{done=true;return r;});
    await new Promise(resolve=>setTimeout(resolve,130));
    assert.equal(done,false,"operator request must wait on the CONTROL row");
    await blocker.query("COMMIT");open=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {assert.deepEqual(await Promise.race([waiting,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("control lock timeout")),6000);})]),conflict);}
    finally{if(timer)clearTimeout(timer);}
  } finally {if(open)await blocker.query("ROLLBACK").catch(()=>undefined);blocker.release();}
  assert.equal((await state()).enabled,false);
  console.log("B3B3C_FINAL_OFF=PASS");
 } finally {
  // Exact disposable DB only, no production access or transport.
  await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1,updated_at=now() WHERE id=1").catch(()=>undefined);
  if(userId!==null) {
   await pool.query("DELETE FROM administrative_audit_events WHERE actor_user_id=$1 AND action='ACTIVATION_DISPATCH_CONTROL_CHANGE'",[userId]).catch(()=>undefined);
   await pool.query("DELETE FROM sessions WHERE user_id=$1",[userId]).catch(()=>undefined);
   await pool.query("DELETE FROM users WHERE id=$1",[userId]).catch(()=>undefined);
  }
  if(previous===undefined)delete process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED;
  else process.env.AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED=previous;
  await pool.end();
 }
}
main().catch((err:unknown)=>{console.error("B3B3C_PG_OPERATOR_TRANSITIONS=FAIL",err instanceof Error?err.name:"unknown");process.exitCode=1;});

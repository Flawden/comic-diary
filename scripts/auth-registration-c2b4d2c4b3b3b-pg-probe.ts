/**
 * AUTH-01C2B4D2C4B3B3B — real concurrent PG17 transaction probe.
 * EXACT ephemeral GitHub CI database ONLY. No mail, provider, fetch or worker.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

function requireDisposableCiDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
      process.env.GITHUB_WORKFLOW !== "CI") {
    throw new Error("REFUSED: exact disposable GitHub CI only");
  }
  let target: URL;
  try { target = new URL(url); } catch { throw new Error("REFUSED: invalid database URL"); }
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1" ||
      target.port !== "5432" || target.pathname !== "/comic_diary_release" ||
      target.username !== "comic_diary_ci" || target.password !== "ci_ephemeral_password" ||
      target.search || target.hash) throw new Error("REFUSED: non-disposable DB");
  return url;
}

const ORIGIN = "https://comic-diary.invalid";
type RecordRow = { dispatch_reservation_at:Date|null; dispatch_reservation_generation:number|null; dispatch_fence_at:Date|null; state:string };

async function main(): Promise<void> {
  const connectionString = requireDisposableCiDatabase();
  // Only AFTER exact CI-only URI check may app services/env or DB pool load.
  const [{ enqueuePendingActivationMailForUser },
    { claimPendingActivationMailOnce },
    { recordPendingActivationDispatchFenceOnce },
    { reservePendingActivationDispatchOnce }] = await Promise.all([
    import("../src/modules/auth/registration-activation-outbox-issue"),
    import("../src/modules/auth/registration-activation-outbox-claim"),
    import("../src/modules/auth/registration-activation-outbox-fence"),
    import("../src/modules/auth/registration-activation-outbox-reserve"),
  ]);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 8 });
  const key = { keyId:"ci_ephemeral_b3b3b", bytes:randomBytes(32) };
  const keyMap = () => new Map([[key.keyId,key.bytes]]);
  const createdUsers:number[]=[];
  const denied={ok:false,kind:"blocked",sendAuthorized:false};
  const reserved={ok:true,reserved:true,sendAuthorized:false};
  const create = async ():Promise<{userId:number;outboxId:number;claimId:string}> => {
    const result=await pool.query<{id:number}>(
      "INSERT INTO users(email,password_hash,role,is_active,verification_required_at) VALUES($1,$2,'USER',true,now()) RETURNING id",
      [`b3b3b-${randomUUID()}@example.invalid`,"ci-unused-hash"]);
    const userId=result.rows[0]!.id;createdUsers.push(userId);
    assert.deepEqual(await enqueuePendingActivationMailForUser({userId,publicOrigin:ORIGIN,key}),{ok:true,queued:true});
    const claim=await claimPendingActivationMailOnce();
    assert.equal(claim.ok,true);
    if (!claim.ok) throw new Error("fixture claim failed");
    assert.deepEqual(await recordPendingActivationDispatchFenceOnce({
      outboxId:claim.outboxId,claimId:claim.claimId,expectedPublicOrigin:ORIGIN,
      operatorFenceEnabled:true,keys:keyMap(),
    }),{ok:true,fenceRecorded:true,sendAuthorized:false});
    return {userId,outboxId:claim.outboxId,claimId:claim.claimId};
  };
  const attempt = (f:{outboxId:number;claimId:string},overrides:Record<string,unknown>={}) =>
    reservePendingActivationDispatchOnce({
      outboxId:f.outboxId,claimId:f.claimId,expectedPublicOrigin:ORIGIN,keys:keyMap(),...overrides,
    });
  const row = async (id:number):Promise<RecordRow>=>{
    const r=await pool.query<RecordRow>(
      "SELECT dispatch_reservation_at,dispatch_reservation_generation,dispatch_fence_at,state FROM activation_mail_outbox WHERE id=$1",[id]);
    assert.equal(r.rowCount,1); return r.rows[0]!;
  };
  // No operator ON functionality is provided by application code. Direct SQL is
  // used ONLY here, in the CI-only disposable database, to drive race fixtures.
  const toggle = async (enabled:boolean):Promise<number>=>{
    const r=await pool.query<{generation:number}>(
      "UPDATE activation_mail_dispatch_control SET enabled=$1,generation=generation+1,updated_at=clock_timestamp() WHERE id=1 RETURNING generation",
      [enabled]);
    assert.equal(r.rowCount,1);return r.rows[0]!.generation;
  };
  const assertCheck = async (sql:string,args:unknown[]):Promise<void>=>{
    await assert.rejects(pool.query(sql,args),(err:unknown)=>{
      assert.equal((err as {code?:string}).code,"23514");return true;
    });
  };
  const revoke=async(userId:number):Promise<void>=>{
    const c=await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
      await c.query("UPDATE email_verification_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL AND consumed_at IS NULL",[userId]);
      await c.query("COMMIT");
    } catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}
    finally {c.release();}
  };
  try {
    const v=await pool.query<{major:number}>("SELECT current_setting('server_version_num')::int/10000 AS major");
    assert.equal(v.rows[0]?.major,17);
    const shape=await pool.query<{column_name:string}>(
      "SELECT column_name FROM information_schema.columns WHERE table_name='activation_mail_outbox' AND column_name IN ('dispatch_reservation_at','dispatch_reservation_generation') ORDER BY column_name");
    assert.equal(shape.rows.length,2);
    const gate=await pool.query<{enabled:boolean;generation:number}>("SELECT enabled,generation FROM activation_mail_dispatch_control WHERE id=1");
    assert.equal(gate.rowCount,1);assert.equal(gate.rows[0]?.enabled,false);assert.equal(gate.rows[0]?.generation,0);
    const initial=await create();
    assert.deepEqual(await attempt(initial),denied);
    assert.equal((await row(initial.outboxId)).dispatch_reservation_at,null);
    console.log("C2B4D2C4B3B3B_DEFAULT_OFF=PASS");

    const epoch=await toggle(true);
    assert.equal(epoch,1);
    assert.deepEqual(await attempt(initial,{keys:new Map()}),denied);
    assert.deepEqual(await attempt(initial,{expectedPublicOrigin:"https://evil.invalid"}),denied);
    assert.deepEqual(await attempt(initial,{claimId:randomBytes(24).toString("base64url")}),denied);
    assert.deepEqual(await attempt(initial),reserved);
    assert.deepEqual(await attempt(initial),denied);
    const marked=await row(initial.outboxId);
    assert.ok(marked.dispatch_reservation_at instanceof Date);
    assert.equal(marked.dispatch_reservation_generation,epoch);
    console.log("C2B4D2C4B3B_OPERATOR_ENABLED_ONCE_AND_NO_REPLAY=PASS");

    await assertCheck("UPDATE activation_mail_outbox SET dispatch_reservation_generation=NULL WHERE id=$1",[initial.outboxId]);
    await assertCheck("UPDATE activation_mail_outbox SET dispatch_reservation_at=dispatch_fence_at-interval '1 second' WHERE id=$1",[initial.outboxId]);
    await assertCheck("UPDATE activation_mail_outbox SET dispatch_reservation_generation=0 WHERE id=$1",[initial.outboxId]);
    console.log("C2B4D2C4B3B_DATABASE_RESERVATION_SHAPE=PASS");

    const blocked=await create();
    await toggle(false);
    assert.deepEqual(await attempt(blocked),denied);
    assert.equal((await row(blocked.outboxId)).dispatch_reservation_at,null);
    console.log("C2B4D2C4B3B_OFF_COMMIT_BEFORE_RESERVE=PASS");

    // Deterministic race: hold CONTROL row for an OFF update until the worker
    // has tried reservation; worker must block, then see OFF after commit.
    await toggle(true);
    const pending=await create();
    const blocker=await pool.connect();let active=false;
    try {
      await blocker.query("BEGIN");active=true;
      await blocker.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1,updated_at=clock_timestamp() WHERE id=1");
      let settled=false;
      const waiting=attempt(pending).then(r=>{settled=true;return r;});
      await new Promise(resolve=>setTimeout(resolve,150));
      assert.equal(settled,false,"reservation must block on global CONTROL lock");
      await blocker.query("COMMIT");active=false;
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {
        assert.deepEqual(await Promise.race([
          waiting,
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("control lock timeout")),6000);}),
        ]),denied);
      } finally {if(timer)clearTimeout(timer);}
    } finally {if(active)await blocker.query("ROLLBACK").catch(()=>undefined);blocker.release();}
    assert.equal((await row(pending.outboxId)).dispatch_reservation_at,null);
    console.log("C2B4D2C4B3B_LOCKED_DISABLE_BEFORE_RESERVE=PASS");

    await toggle(true);
    const revoked=await create();
    await revoke(revoked.userId);
    assert.deepEqual(await attempt(revoked),denied);
    console.log("C2B4D2C4B3B_REVOKE_BEFORE_RESERVE=PASS");

    const competing=await create();
    const outcomes=await Promise.all([attempt(competing),attempt(competing)]);
    assert.equal(outcomes.filter(x=>x.ok).length,1);
    assert.equal(outcomes.filter(x=>!x.ok).length,1);
    assert.equal((await row(competing.outboxId)).dispatch_reservation_generation,
      (await pool.query<{generation:number}>("SELECT generation FROM activation_mail_dispatch_control WHERE id=1")).rows[0]!.generation);
    console.log("C2B4D2C4B3B_TWO_WORKERS_ONE_RESERVATION=PASS");

    await toggle(false);
    assert.ok((await row(competing.outboxId)).dispatch_reservation_at instanceof Date);
    assert.deepEqual(await attempt(competing),denied);
    console.log("C2B4D2C4B3B_OFF_AFTER_RESERVATION=PASS");
    const epoch2=await toggle(true);
    assert.ok(epoch2>epoch);
    assert.deepEqual(await attempt(competing),denied);
    const fresh=await create();
    assert.deepEqual(await attempt(fresh),reserved);
    assert.equal((await row(fresh.outboxId)).dispatch_reservation_generation,epoch2);
    await toggle(false);
    assert.deepEqual(await attempt(fresh),denied);
    console.log("C2B4D2C4B3B_RE_ENABLE_NEW_EPOCH=PASS");
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    console.log("C2B4D2C4B3B_NO_RETRY=PASS");
  } finally {
    // Even on failed assertions, never leave the disposable test control ON.
    await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1,updated_at=clock_timestamp() WHERE id=1").catch(()=>undefined);
    key.bytes.fill(0);
    for(const userId of createdUsers.reverse()) {
      await pool.query("DELETE FROM users WHERE id=$1",[userId]).catch(()=>undefined);
    }
    await pool.end();
  }
}
main().catch((error:unknown)=>{
  console.error("C2B4D2C4B3B_DISPOSABLE_PG_PROBE=FAIL",error instanceof Error?error.name:"unknown");
  process.exitCode=1;
});

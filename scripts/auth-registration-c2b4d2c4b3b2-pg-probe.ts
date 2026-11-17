/**
 * AUTH-01C2B4D2C4B3B2: real row-lock fence probe on exact DISPOSABLE GitHub CI PG17.
 * Never connects to production, loads configured mail keys, starts HTTP,
 * launches a worker, sends email, or prints token/recipient/ciphertext.
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

type FenceRow = {id: number; dispatch_fence_at: Date|null; state: string; claim_id: string|null};
const ORIGIN = "https://comic-diary.invalid";

async function main(): Promise<void> {
  const connectionString = requireDisposableCiDatabase();
  // Runtime and DB imports MUST occur only AFTER the exact CI-only URI gate.
  const [{ enqueuePendingActivationMailForUser },
    { claimPendingActivationMailOnce, finalizeClaimedActivationMail },
    { recordPendingActivationDispatchFenceOnce }] = await Promise.all([
    import("../src/modules/auth/registration-activation-outbox-issue"),
    import("../src/modules/auth/registration-activation-outbox-claim"),
    import("../src/modules/auth/registration-activation-outbox-fence"),
  ]);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 5 });
  const key = { keyId: "ci_ephemeral_b3b2", bytes: randomBytes(32) };
  const users: number[] = [];
  const keys = () => new Map([[key.keyId, key.bytes]]);
  const attempt = (outboxId: number, claimId: string, overrides: Record<string,unknown> = {}) =>
    recordPendingActivationDispatchFenceOnce({
      outboxId, claimId, expectedPublicOrigin: ORIGIN, operatorFenceEnabled: true,
      keys: keys(), ...overrides,
    });
  const denied = { ok: false, kind: "blocked", sendAuthorized: false };
  const recorded = { ok: true, fenceRecorded: true, sendAuthorized: false };
  const rowFor = async (id: number): Promise<FenceRow> => {
    const result = await pool.query<FenceRow>(
      "SELECT id,dispatch_fence_at,state,claim_id FROM activation_mail_outbox WHERE id=$1",[id]);
    assert.equal(result.rowCount, 1);
    return result.rows[0]!;
  };
  const create = async (): Promise<{ userId: number; outboxId: number; claimId: string }> => {
    const result = await pool.query<{id:number}>(
      "INSERT INTO users(email,password_hash,role,is_active,verification_required_at) VALUES ($1,$2,'USER',true,now()) RETURNING id",
      [`auth-b3b2-${randomUUID()}@example.invalid`,"ci-unusable-hash"]);
    const userId = result.rows[0]!.id;
    users.push(userId);
    assert.deepEqual(await enqueuePendingActivationMailForUser({userId,publicOrigin:ORIGIN,key}),
      {ok:true,queued:true});
    const claim = await claimPendingActivationMailOnce();
    assert.equal(claim.ok,true);
    if (!claim.ok) throw new Error("fixture claim failed");
    return {userId,outboxId:claim.outboxId,claimId:claim.claimId};
  };
  const revoke = async (userId:number):Promise<void> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
      await client.query("UPDATE email_verification_tokens SET revoked_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL",[userId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(()=>undefined);
      throw err;
    } finally { client.release(); }
  };
  const expectCheck = async (sql:string, params:unknown[]):Promise<void> => {
    await assert.rejects(pool.query(sql,params),(err:unknown) => {
      assert.equal((err as {code?:string}).code,"23514");
      return true;
    });
  };
  try {
    const v = await pool.query<{major:number}>("SELECT current_setting('server_version_num')::int/10000 AS major");
    assert.equal(v.rows[0]?.major,17);
    const exists = await pool.query<{column_name:string}>(
      "SELECT column_name FROM information_schema.columns WHERE table_name='activation_mail_outbox' AND column_name='dispatch_fence_at'");
    assert.equal(exists.rowCount,1);

    const off = await create();
    assert.deepEqual(await attempt(off.outboxId,off.claimId,{operatorFenceEnabled:false}),denied);
    assert.deepEqual(await attempt(off.outboxId,off.claimId,{operatorFenceEnabled:"true"}),denied);
    assert.deepEqual(await attempt(off.outboxId,off.claimId,{keys:new Map()}),denied);
    assert.deepEqual(await attempt(off.outboxId,off.claimId,{expectedPublicOrigin:"https://evil.invalid"}),denied);
    assert.deepEqual(await attempt(off.outboxId,randomBytes(24).toString("base64url")),denied);
    assert.equal((await rowFor(off.outboxId)).dispatch_fence_at,null);
    console.log("C2B4D2C4B3B2_OPERATOR_KEY_ORIGIN_CLAIM_DEFAULT_DENY=PASS");

    const ready = await pool.query<{id:number}>(
      "SELECT id FROM activation_mail_outbox WHERE verification_token_id IN (SELECT id FROM email_verification_tokens WHERE user_id=$1)",[off.userId]);
    assert.equal(ready.rowCount,1);
    await expectCheck(
      "UPDATE activation_mail_outbox SET dispatch_fence_at=claimed_at-interval '1 second' WHERE id=$1",[off.outboxId]);
    console.log("C2B4D2C4B3B2_DB_FENCE_CHRONOLOGY_CONSTRAINT=PASS");

    const revoked = await create();
    await revoke(revoked.userId);
    assert.deepEqual(await attempt(revoked.outboxId,revoked.claimId),denied);
    assert.equal((await rowFor(revoked.outboxId)).dispatch_fence_at,null);
    console.log("C2B4D2C4B3B2_REVOKE_COMMIT_BEFORE_FENCE_DENIED=PASS");

    const locked = await create();
    const connection = await pool.connect();
    let active = false;
    try {
      await connection.query("BEGIN"); active=true;
      await connection.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[locked.userId]);
      let settled=false;
      const racing=attempt(locked.outboxId,locked.claimId).then((v)=>{settled=true;return v;});
      await new Promise((resolve)=>setTimeout(resolve,130));
      assert.equal(settled,false,"fence must block on the pending revoker USER row lock");
      await connection.query(
        "UPDATE email_verification_tokens SET revoked_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL",[locked.userId]);
      await connection.query("COMMIT");active=false;
      let waitTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        assert.deepEqual(await Promise.race([
          racing,
          new Promise((_,reject)=>{ waitTimer=setTimeout(()=>reject(new Error("fence wait timed out")),6000); }),
        ]),denied);
      } finally { if (waitTimer !== null) clearTimeout(waitTimer); }
    } finally {
      if(active) await connection.query("ROLLBACK").catch(()=>undefined);
      connection.release();
    }
    assert.equal((await rowFor(locked.outboxId)).dispatch_fence_at,null);
    console.log("C2B4D2C4B3B2_REAL_ROW_LOCK_REVOKE_BEFORE_FENCE=PASS");

    const twoWorkers = await create();
    const races = await Promise.all([
      attempt(twoWorkers.outboxId,twoWorkers.claimId),
      attempt(twoWorkers.outboxId,twoWorkers.claimId),
    ]);
    assert.equal(races.filter((x)=>x.ok).length,1);
    assert.equal(races.filter((x)=>!x.ok).length,1);
    assert.deepEqual(races.find((x)=>x.ok),recorded);
    assert.deepEqual(races.find((x)=>!x.ok),denied);
    assert.ok((await rowFor(twoWorkers.outboxId)).dispatch_fence_at instanceof Date);
    assert.deepEqual(await attempt(twoWorkers.outboxId,twoWorkers.claimId),denied);
    console.log("C2B4D2C4B3B2_ONE_FENCE_TWO_WORKERS_REPLAY_DENIED=PASS");

    await revoke(twoWorkers.userId);
    assert.deepEqual(await attempt(twoWorkers.outboxId,twoWorkers.claimId),denied);
    assert.ok((await rowFor(twoWorkers.outboxId)).dispatch_fence_at instanceof Date);
    console.log("C2B4D2C4B3B2_FENCE_BEFORE_REVOKE_LIMITATION_A_ONLY=PASS");

    const consumed = await create();
    // Model verified-account redemption: USER -> TOKEN guarded update, no HTTP or actual activation route.
    const consumedClient = await pool.connect();
    try {
      await consumedClient.query("BEGIN");
      await consumedClient.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[consumed.userId]);
      await consumedClient.query("UPDATE email_verification_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL",[consumed.userId]);
      await consumedClient.query("COMMIT");
    } catch (error) {
      await consumedClient.query("ROLLBACK").catch(()=>undefined);
      throw error;
    } finally { consumedClient.release(); }
    assert.deepEqual(await attempt(consumed.outboxId,consumed.claimId),denied);
    console.log("C2B4D2C4B3B2_CONSUME_COMMIT_BEFORE_FENCE_DENIED=PASS");

    const disabled = await create();
    await pool.query("UPDATE users SET is_active=false WHERE id=$1",[disabled.userId]);
    assert.deepEqual(await attempt(disabled.outboxId,disabled.claimId),denied);
    console.log("C2B4D2C4B3B2_DISABLED_ACCOUNT_DENIED=PASS");

    const emailChanged = await create();
    await pool.query("UPDATE users SET email=$1 WHERE id=$2",[`changed-${randomUUID()}@example.invalid`,emailChanged.userId]);
    assert.deepEqual(await attempt(emailChanged.outboxId,emailChanged.claimId),denied);
    console.log("C2B4D2C4B3B2_RECIPIENT_CHANGED_DENIED=PASS");

    const nearExpiry = await create();
    await pool.query(
      "UPDATE email_verification_tokens SET expires_at=now()+interval '30 seconds' WHERE user_id=$1",[nearExpiry.userId]);
    await pool.query(
      "UPDATE activation_mail_outbox SET expires_at=t.expires_at FROM email_verification_tokens t WHERE t.id=activation_mail_outbox.verification_token_id AND t.user_id=$1",[nearExpiry.userId]);
    assert.deepEqual(await attempt(nearExpiry.outboxId,nearExpiry.claimId),denied);
    console.log("C2B4D2C4B3B2_NEAR_EXPIRY_DENIED=PASS");

    const terminal = await create();
    assert.equal(await finalizeClaimedActivationMail({outboxId:terminal.outboxId,claimId:terminal.claimId,result:"uncertain"}),true);
    assert.deepEqual(await attempt(terminal.outboxId,terminal.claimId),denied);
    assert.equal((await rowFor(terminal.outboxId)).state,"uncertain");
    assert.equal((await rowFor(terminal.outboxId)).dispatch_fence_at,null);
    console.log("C2B4D2C4B3B2_TERMINAL_UNCERTAIN_NEVER_FENCED_OR_RETRIED=PASS");

    const marked = await create();
    assert.deepEqual(await attempt(marked.outboxId,marked.claimId),recorded);
    assert.equal(await finalizeClaimedActivationMail({outboxId:marked.outboxId,claimId:marked.claimId,result:"uncertain"}),true);
    assert.equal((await rowFor(marked.outboxId)).state,"uncertain");
    assert.ok((await rowFor(marked.outboxId)).dispatch_fence_at instanceof Date);
    assert.deepEqual(await attempt(marked.outboxId,marked.claimId),denied);
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    console.log("C2B4D2C4B3B2_FENCED_AMBIGUOUS_TERMINAL_NO_AUTO_RETRY=PASS");

    // Demonstrate schema denial for READY rows (without invoking a new service).
    const extra = await pool.query<{id:number}>(
      "INSERT INTO users(email,password_hash,role,is_active,verification_required_at) VALUES ($1,$2,'USER',true,now()) RETURNING id",
      [`auth-b3b2-schema-${randomUUID()}@example.invalid`,"ci-unusable-hash"]);
    users.push(extra.rows[0]!.id);
    assert.deepEqual(await enqueuePendingActivationMailForUser({userId:extra.rows[0]!.id,publicOrigin:ORIGIN,key}),{ok:true,queued:true});
    const pending = await pool.query<{id:number}>(
      "SELECT o.id FROM activation_mail_outbox o JOIN email_verification_tokens t ON o.verification_token_id=t.id WHERE t.user_id=$1",[extra.rows[0]!.id]);
    assert.equal(pending.rowCount,1);
    await expectCheck("UPDATE activation_mail_outbox SET dispatch_fence_at=now(),updated_at=now() WHERE id=$1",[pending.rows[0]!.id]);
    assert.equal((await rowFor(pending.rows[0]!.id)).dispatch_fence_at,null);
    console.log("C2B4D2C4B3B2_DB_READY_ROW_CANNOT_HAVE_FENCE=PASS");
  } finally {
    key.bytes.fill(0);
    for (const userId of users.reverse()) {
      await pool.query("DELETE FROM users WHERE id=$1",[userId]).catch(()=>undefined);
    }
    await pool.end();
  }
}

main().catch((error:unknown) => {
  // No raw exceptions; DB diagnostics can contain sensitive SQL parameters.
  console.error("C2B4D2C4B3B2_DISPOSABLE_PG_PROBE=FAIL",error instanceof Error ? error.name : "unknown");
  process.exitCode=1;
});

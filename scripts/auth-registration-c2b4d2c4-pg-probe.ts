/**
 * AUTH-01C2B4D2C4A: exact disposable GitHub CI PostgreSQL 17 probe ONLY.
 * Refuses any other database before importing application code or creating pool.
 * No mail, keys, live network transport, secrets or production activity.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

function disposableCiUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
      process.env.GITHUB_WORKFLOW !== "CI") {
    throw new Error("REFUSED: exact disposable GitHub CI only");
  }
  let target: URL;
  try { target = new URL(url); } catch { throw new Error("REFUSED: invalid database URI"); }
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1" ||
      target.port !== "5432" || target.pathname !== "/comic_diary_release" ||
      target.username !== "comic_diary_ci" || target.password !== "ci_ephemeral_password" ||
      target.search || target.hash) {
    throw new Error("REFUSED: non-disposable database");
  }
  return url;
}

type QueueRow = { id: number; state: string; claim_id: string|null;
  attempt_count: number; finalized_at: Date|null; };

async function main(): Promise<void> {
  const connectionString = disposableCiUrl();
  const [{ enqueuePendingActivationMailForUser },
    { claimPendingActivationMailOnce, finalizeClaimedActivationMail }] = await Promise.all([
    import("../src/modules/auth/registration-activation-outbox-issue"),
    import("../src/modules/auth/registration-activation-outbox-claim"),
  ]);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 4 });
  const fixtures: number[] = [];
  // Fresh random key, never configured/printed or used for a real provider.
  const key = { keyId: "ci_d2c4a_ephemeral", bytes: randomBytes(32) };
  const origin = "https://comic-diary.invalid";
  const createPending = async (): Promise<number> => {
    const email = `auth-d2c4-${randomUUID()}@example.invalid`;
    const res = await pool.query<{id:number}>(
      "INSERT INTO users (email,password_hash,role,is_active,verification_required_at) VALUES ($1,$2,'USER',true,now()) RETURNING id",
      [email,"ci-inert-unusable-password-hash"],
    );
    const id = res.rows[0]!.id;
    fixtures.push(id);
    assert.deepEqual(await enqueuePendingActivationMailForUser({ userId:id, publicOrigin:origin, key }),
      { ok:true, queued:true });
    return id;
  };
  const rowFor = async (userId:number): Promise<QueueRow> => {
    const res=await pool.query<QueueRow>(
      `SELECT o.id,o.state,o.claim_id,o.attempt_count,o.finalized_at
       FROM activation_mail_outbox o JOIN email_verification_tokens t ON t.id=o.verification_token_id
       WHERE t.user_id=$1 ORDER BY o.id DESC LIMIT 1`, [userId]);
    return res.rows[0]!;
  };
  try {
    const version = await pool.query<{major:number}>("SELECT current_setting('server_version_num')::int/10000 AS major");
    assert.equal(version.rows[0]?.major,17);
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    console.log("C2B4D2C4A_EMPTY_QUEUE=PASS");

    const userId = await createPending();
    const initial=await rowFor(userId);
    assert.equal(initial.state,"ready");
    const racing = await Promise.all([
      claimPendingActivationMailOnce(), claimPendingActivationMailOnce(),
    ]);
    const claimed = racing.filter((r)=>r.ok);
    assert.equal(claimed.length,1,"a ready item may only be claimed once");
    assert.equal(racing.filter((r)=>!r.ok).length,1);
    const claim=claimed[0]!;
    if (!claim.ok) throw new Error("unreachable claim type");
    assert.equal(claim.outboxId,initial.id);
    assert.match(claim.claimId,/^[A-Za-z0-9_-]{32}$/);
    let row=await rowFor(userId);
    assert.equal(row.state,"in_flight");
    assert.equal(row.attempt_count,1);
    assert.equal(row.claim_id,claim.claimId);
    assert.equal(row.finalized_at,null);
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    console.log("C2B4D2C4A_EXCLUSIVE_CLAIM_NO_RETRY=PASS");

    assert.equal(await finalizeClaimedActivationMail({
      outboxId:claim.outboxId,claimId:"a".repeat(32),result:"accepted"}),false);
    assert.equal(await finalizeClaimedActivationMail({
      outboxId:claim.outboxId,claimId:claim.claimId,result:"accepted"}),true);
    row=await rowFor(userId);
    assert.equal(row.state,"accepted");
    assert.ok(row.finalized_at instanceof Date);
    assert.equal(await finalizeClaimedActivationMail({
      outboxId:claim.outboxId,claimId:claim.claimId,result:"rejected"}),false);
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    console.log("C2B4D2C4A_ACCEPTED_CLAIM_AUTH_AND_REPLAY=PASS");

    // Revocation before claim must expire READY without exposure or delivery.
    const revokedUser=await createPending();
    await pool.query(
      "UPDATE email_verification_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
      [revokedUser]);
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    row=await rowFor(revokedUser);
    assert.equal(row.state,"expired");
    assert.equal(row.attempt_count,0);
    console.log("C2B4D2C4A_REVOKED_TOKEN_EXPIRED=PASS");

    const disabledUser=await createPending();
    await pool.query("UPDATE users SET is_active=false WHERE id=$1",[disabledUser]);
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    assert.equal((await rowFor(disabledUser)).state,"expired");
    console.log("C2B4D2C4A_DISABLED_ACCOUNT_EXPIRED=PASS");

    const expiresSoonUser=await createPending();
    await pool.query(
      `WITH same AS (SELECT now()+interval '30 seconds' AS expires)
       UPDATE email_verification_tokens SET expires_at=(SELECT expires FROM same) WHERE user_id=$1`,
      [expiresSoonUser]);
    await pool.query(
      `UPDATE activation_mail_outbox SET expires_at=(SELECT expires_at FROM email_verification_tokens
         WHERE id=activation_mail_outbox.verification_token_id) WHERE verification_token_id IN
         (SELECT id FROM email_verification_tokens WHERE user_id=$1)`,
      [expiresSoonUser]);
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    assert.equal((await rowFor(expiresSoonUser)).state,"expired");
    console.log("C2B4D2C4A_NEAR_EXPIRY_DENIED=PASS");

    const uncertainUser=await createPending();
    const pendingClaim=await claimPendingActivationMailOnce();
    assert.equal(pendingClaim.ok,true);
    if (!pendingClaim.ok) throw new Error("unreachable claim type");
    assert.equal(await finalizeClaimedActivationMail({
      outboxId:pendingClaim.outboxId,claimId:pendingClaim.claimId,result:"uncertain"}),true);
    assert.equal((await rowFor(uncertainUser)).state,"uncertain");
    assert.deepEqual(await claimPendingActivationMailOnce(),{ok:false,kind:"no_work"});
    console.log("C2B4D2C4A_UNCERTAIN_IS_TERMINAL_NO_AUTO_RETRY=PASS");
  } finally {
    key.bytes.fill(0);
    for (const id of fixtures.reverse()) {
      await pool.query("DELETE FROM users WHERE id=$1",[id]).catch(()=>undefined);
    }
    await pool.end();
  }
}

main().catch((error:unknown) => {
  // Never log a raw exception: DB error detail may include a query or parameter.
  console.error("C2B4D2C4A_DISPOSABLE_PG_PROBE=FAIL",error instanceof Error ? error.name : "unknown");
  process.exitCode=1;
});

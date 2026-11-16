/**
 * AUTH-01C2B4D2C3: exact disposable PG17-only atomic encrypted enqueue probe.
 * REFUSES non-CI targets BEFORE importing application DB/service modules.
 * Fixture users are unique, have unusable passwords and are always deleted.
 * No production DB, configured key, mail transport, worker or HTTP endpoint.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

function requireDisposableCiDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
      process.env.GITHUB_WORKFLOW !== "CI") {
    throw new Error("REFUSED: exact disposable GitHub CI only");
  }
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("REFUSED: invalid database URI"); }
  if (u.protocol !== "postgresql:" || u.hostname !== "127.0.0.1" || u.port !== "5432" ||
      u.pathname !== "/comic_diary_release" || u.username !== "comic_diary_ci" ||
      u.password !== "ci_ephemeral_password" || u.search || u.hash) {
    throw new Error("REFUSED: non-disposable database");
  }
  return url;
}

type TokenRow = { id: number; user_id: number; email_snapshot: string; token_hash: string;
  expires_at: Date; revoked_at: Date | null; consumed_at: Date | null };
type QueueRow = { id: number; verification_token_id: number; payload_ciphertext: string;
  payload_nonce: string; payload_key_id: string; payload_digest: string;
  idempotency_key: string; expires_at: Date; state: string; attempt_count: number };

async function main(): Promise<void> {
  const connectionString = requireDisposableCiDatabase();
  // Import AFTER environment guard: application DB initialization is prohibited otherwise.
  const [{enqueuePendingActivationMailForUser}, {unsealActivationMailOutboxPayload},
    {hashEmailVerificationToken}] = await Promise.all([
    import("../src/modules/auth/registration-activation-outbox-issue"),
    import("../src/modules/auth/registration-activation-outbox-crypto"),
    import("../src/modules/auth/email-verification-token"),
  ]);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 4 });
  const fixtures: number[] = [];
  const key = { keyId: "ci_ephemeral_d2c3", bytes: randomBytes(32) };
  const origin = "https://comic-diary.invalid";
  const readTokens = async (userId: number): Promise<TokenRow[]> => (await pool.query<TokenRow>(
    "SELECT id,user_id,email_snapshot,token_hash,expires_at,revoked_at,consumed_at FROM email_verification_tokens WHERE user_id=$1 ORDER BY id",
    [userId],
  )).rows;
  const readQueue = async (userId: number): Promise<QueueRow[]> => (await pool.query<QueueRow>(
    `SELECT o.id,o.verification_token_id,o.payload_ciphertext,o.payload_nonce,o.payload_key_id,
      o.payload_digest,o.idempotency_key,o.expires_at,o.state,o.attempt_count
      FROM activation_mail_outbox o JOIN email_verification_tokens t ON t.id=o.verification_token_id
      WHERE t.user_id=$1 ORDER BY o.id`, [userId],
  )).rows;
  try {
    const version = await pool.query<{major: number}>("SELECT current_setting('server_version_num')::int/10000 AS major");
    assert.equal(version.rows[0]?.major, 17);
    const email = `auth-d2c3-${randomUUID()}@example.invalid`;
    const user = await pool.query<{id: number}>(
      "INSERT INTO users (email,password_hash,role,is_active,verification_required_at) VALUES ($1,$2,'USER',true,now()) RETURNING id",
      [email,"ci-inert-unusable-password-hash"],
    );
    const userId = user.rows[0]!.id;
    fixtures.push(userId);
    const args = {userId, publicOrigin: origin, key};

    const first = await enqueuePendingActivationMailForUser(args);
    assert.deepEqual(first, {ok:true,queued:true});
    let tokens = await readTokens(userId);
    let queue = await readQueue(userId);
    assert.equal(tokens.length,1);
    assert.equal(queue.length,1);
    assert.equal(queue[0]!.state,"ready");
    assert.equal(queue[0]!.attempt_count,0);
    assert.equal(queue[0]!.verification_token_id,tokens[0]!.id);
    assert.equal(queue[0]!.expires_at.getTime(),tokens[0]!.expires_at.getTime());
    assert.equal(queue[0]!.payload_key_id,key.keyId);
    assert.equal(queue[0]!.payload_digest,createHash("sha256").update(queue[0]!.payload_ciphertext,"ascii").digest("hex"));
    assert.notEqual(queue[0]!.payload_ciphertext,email);
    assert.ok(!queue[0]!.payload_ciphertext.includes(email));
    const decrypted = unsealActivationMailOutboxPayload({
      payloadCiphertext:queue[0]!.payload_ciphertext,
      payloadNonce:queue[0]!.payload_nonce,
      payloadKeyId:queue[0]!.payload_key_id,
      payloadDigest:queue[0]!.payload_digest,
    },{
      verificationTokenId:queue[0]!.verification_token_id,
      idempotencyKey:queue[0]!.idempotency_key,
      expiresAt:queue[0]!.expires_at,
    },new Map([[key.keyId,key.bytes]]));
    assert.equal(decrypted?.email,email);
    assert.equal(decrypted?.publicOrigin,origin);
    assert.equal(decrypted?.expiresAt.getTime(),queue[0]!.expires_at.getTime());
    assert.equal(hashEmailVerificationToken(decrypted?.token),tokens[0]!.token_hash);
    console.log("C2B4D2C3_ATOMIC_ENCRYPTED_ISSUE=PASS");

    // A failed AEAD call MUST abort the transaction, preserving prior token and ready row.
    await assert.rejects(
      enqueuePendingActivationMailForUser({...args,key:{keyId:key.keyId,bytes:randomBytes(31)}}),
      /Activation-mail encryption aborted/,
    );
    tokens = await readTokens(userId);
    queue = await readQueue(userId);
    assert.equal(tokens.length,1);
    assert.equal(tokens[0]!.revoked_at,null);
    assert.equal(queue.length,1);
    assert.equal(queue[0]!.state,"ready");
    console.log("C2B4D2C3_ENCRYPTION_FAILURE_ROLLBACK=PASS");

    const invalidOrigin = await enqueuePendingActivationMailForUser({...args,publicOrigin:"http://untrusted.invalid"});
    assert.deepEqual(invalidOrigin,{ok:false,kind:"invalid_origin"});
    assert.equal((await readTokens(userId)).length,1);
    console.log("C2B4D2C3_UNTRUSTED_ORIGIN=PASS");

    // Two callers race: user lock serializes both entire transactions.
    const racing = await Promise.all([
      enqueuePendingActivationMailForUser(args),
      enqueuePendingActivationMailForUser(args),
    ]);
    assert.deepEqual(racing,[{ok:true,queued:true},{ok:true,queued:true}]);
    tokens = await readTokens(userId);
    queue = await readQueue(userId);
    assert.equal(tokens.length,3);
    assert.equal(queue.length,3);
    assert.equal(tokens.filter(t=>t.revoked_at===null && t.consumed_at===null).length,1);
    assert.equal(queue.filter(o=>o.state==="ready").length,1);
    assert.equal(queue.filter(o=>o.state==="expired").length,2);
    assert.equal(new Set(queue.map(o=>o.idempotency_key)).size,3);
    const live = tokens.find(t=>t.revoked_at===null && t.consumed_at===null)!;
    assert.equal(queue.find(o=>o.state==="ready")!.verification_token_id,live.id);
    console.log("C2B4D2C3_CONCURRENT_ISSUANCE_AND_OLD_READY_EXPIRY=PASS");

    // Never create a mail job for an account without a secure pending marker.
    const legacy = await pool.query<{id:number}>(
      "INSERT INTO users (email,password_hash,role,is_active,verification_required_at) VALUES ($1,$2,'USER',true,NULL) RETURNING id",
      [`auth-d2c3-legacy-${randomUUID()}@example.invalid","ci-inert-unusable-password-hash"],
    );
    const legacyId=legacy.rows[0]!.id;
    fixtures.push(legacyId);
    assert.deepEqual(await enqueuePendingActivationMailForUser({...args,userId:legacyId}),
      {ok:false,kind:"account_unavailable"});
    assert.equal((await readTokens(legacyId)).length,0);
    assert.equal((await readQueue(legacyId)).length,0);
    console.log("C2B4D2C3_PENDING_ONLY=PASS");
  } finally {
    key.bytes.fill(0);
    for(const id of fixtures.reverse()) {
      await pool.query("DELETE FROM users WHERE id=$1",[id]).catch(()=>undefined);
    }
    await pool.end();
  }
}

main().catch((error:unknown) => {
  // No raw error: upstream errors can contain SQL parameters and sensitive data.
  console.error("C2B4D2C3_DISPOSABLE_PG_PROBE=FAIL",error instanceof Error ? error.name : "unknown");
  process.exitCode=1;
});

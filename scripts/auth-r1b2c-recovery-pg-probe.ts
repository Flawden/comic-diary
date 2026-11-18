/**
 * AUTH-01 / R1B2C: real PostgreSQL 17 integration probe for recovery-mail enqueue.
 * Exact disposable GitHub Actions CI database ONLY. No email, worker, network,
 * production configuration, secrets or persistent test accounts.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

function requireExactDisposableCi(): string {
  const value = process.env.DATABASE_URL;
  if (!value || process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
      process.env.GITHUB_WORKFLOW !== "CI") {
    throw new Error("REFUSED: exact disposable GitHub CI database only");
  }
  let u: URL;
  try { u = new URL(value); }
  catch { throw new Error("REFUSED: invalid CI database URL"); }
  if (u.protocol !== "postgresql:" || u.hostname !== "127.0.0.1" ||
      u.port !== "5432" || u.pathname !== "/comic_diary_release" ||
      u.username !== "comic_diary_ci" || u.password !== "ci_ephemeral_password" ||
      u.search !== "" || u.hash !== "") {
    throw new Error("REFUSED: unexpected/non-disposable database");
  }
  return value;
}

type TokenRow = {
  id: number;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
};
type QueueRow = {
  id: number;
  password_reset_token_id: number;
  payload_ciphertext: string;
  payload_nonce: string;
  payload_key_id: string;
  payload_digest: string;
  idempotency_key: string;
  expires_at: Date;
  state: string;
  finalized_at: Date | null;
};

async function main(): Promise<void> {
  // Nothing may initialize an app DB pool before this exact-target guard.
  const connectionString = requireExactDisposableCi();
  const [issuer, crypto, tokenModule] = await Promise.all([
    import("../src/modules/auth/password-reset-request-outbox-issue"),
    import("../src/modules/auth/password-reset-request-outbox-crypto"),
    import("../src/modules/auth/password-reset-token"),
  ]);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 4 });
  const key = { keyId: "ci_r1b2c_only", bytes: randomBytes(32) };
  const origin = "https://comic-diary.invalid";
  const email = `auth-r1b2c-${randomUUID()}@example.invalid`;
  let userId: number | undefined;

  const tokens = async () => (await pool.query<TokenRow>(
    `SELECT id,token_hash,expires_at,consumed_at,revoked_at
       FROM password_reset_tokens WHERE user_id=$1 ORDER BY id`, [userId],
  )).rows;
  const queue = async () => (await pool.query<QueueRow>(
    `SELECT o.id,o.password_reset_token_id,o.payload_ciphertext,o.payload_nonce,
            o.payload_key_id,o.payload_digest,o.idempotency_key,o.expires_at,
            o.state,o.finalized_at
       FROM password_reset_mail_outbox o
       JOIN password_reset_tokens t ON t.id=o.password_reset_token_id
      WHERE t.user_id=$1 ORDER BY o.id`, [userId],
  )).rows;
  const snapshot = async () => ({ tokens: await tokens(), queue: await queue() });
  const issue = () => issuer.enqueuePasswordResetMailForUser({ userId: userId!, publicOrigin: origin, key });

  try {
    const server = await pool.query<{ major: number }>(
      "SELECT current_setting('server_version_num')::int / 10000 AS major",
    );
    assert.equal(server.rows[0]?.major, 17, "PG17 required");
    const exists = await pool.query<{ name: string | null }>(
      "SELECT to_regclass('public.password_reset_mail_outbox')::text AS name",
    );
    assert.equal(exists.rows[0]?.name, "password_reset_mail_outbox");

    const fixture = await pool.query<{ id: number }>(
      `INSERT INTO users (email,password_hash,role,is_active,email_verified_at,verification_required_at)
       VALUES ($1,$2,'USER',true,now(),now()) RETURNING id`,
      [email, "ci-fixture-not-a-real-password-hash"],
    );
    userId = fixture.rows[0]?.id;
    assert.ok(userId);

    // 1) Invalid inputs and invalid origin are inert.
    assert.deepEqual(await issuer.enqueuePasswordResetMailForUser({ userId: 0, publicOrigin: origin, key }),
      { ok: false, kind: "account_unavailable" });
    assert.deepEqual(await issuer.enqueuePasswordResetMailForUser({ userId, publicOrigin: "http://untrusted.invalid", key }),
      { ok: false, kind: "invalid_origin" });
    assert.equal((await tokens()).length, 0);

    // 2) One real transaction inserts exactly one token and encrypted outbox job.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const first = await snapshot();
    assert.equal(first.tokens.length, 1);
    assert.equal(first.queue.length, 1);
    assert.equal(first.queue[0].state, "ready");
    assert.equal(first.queue[0].password_reset_token_id, first.tokens[0].id);
    const firstPlain = crypto.unsealPasswordResetMailOutboxPayload(
      {
        payloadCiphertext: first.queue[0].payload_ciphertext,
        payloadNonce: first.queue[0].payload_nonce,
        payloadKeyId: first.queue[0].payload_key_id,
        payloadDigest: first.queue[0].payload_digest,
      },
      {
        passwordResetTokenId: first.tokens[0].id,
        idempotencyKey: first.queue[0].idempotency_key,
        expiresAt: first.queue[0].expires_at,
      },
      new Map([[key.keyId, key.bytes]]),
    );
    assert.ok(firstPlain, "encrypted payload must authenticate");
    assert.equal(firstPlain.email, email);
    assert.equal(firstPlain.publicOrigin, origin);
    assert.equal(tokenModule.hashPasswordResetToken(firstPlain.token), first.tokens[0].token_hash);
    assert.ok(!JSON.stringify(first).includes(firstPlain.token), "raw code must not appear in DB rows");

    // 3) Second issuance atomically revokes the old token and expires READY mail.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const second = await snapshot();
    assert.equal(second.tokens.length, 2);
    assert.equal(second.queue.length, 2);
    assert.ok(second.tokens[0].revoked_at);
    assert.equal(second.tokens[1].revoked_at, null);
    assert.equal(second.queue[0].state, "expired");
    assert.ok(second.queue[0].finalized_at);
    assert.equal(second.queue[1].state, "ready");

    // 4) If sealing fails after revocation, PostgreSQL rolls back the ENTIRE transaction.
    const beforeFailure = await snapshot();
    await assert.rejects(issuer.enqueuePasswordResetMailForUser({
      userId, publicOrigin: origin,
      key: { keyId: key.keyId, bytes: randomBytes(16) },
    }));
    assert.deepEqual(await snapshot(), beforeFailure, "failed seal must roll back token and outbox updates");

    // 5) Verified-mailbox gate is checked under lock; rejected requests do not mutate state.
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [userId]);
    assert.deepEqual(await issue(), { ok: false, kind: "account_unavailable" });
    assert.deepEqual(await snapshot(), beforeFailure);
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [userId]);

    // 6) Two concurrent requests serialize on the USER row lock, leaving one open token/job.
    const concurrent = await Promise.all([issue(), issue()]);
    assert.deepEqual(concurrent, [{ ok: true, queued: true }, { ok: true, queued: true }]);
    const afterRace = await snapshot();
    assert.equal(afterRace.tokens.length, 4);
    assert.equal(afterRace.queue.length, 4);
    assert.equal(afterRace.tokens.filter((row) => !row.revoked_at && !row.consumed_at).length, 1);
    assert.equal(afterRace.queue.filter((row) => row.state === "ready").length, 1);
    assert.equal(afterRace.queue.filter((row) => row.state === "expired").length, 3);
    assert.equal(afterRace.queue.at(-1)?.password_reset_token_id, afterRace.tokens.at(-1)?.id);
    console.log("AUTH01_R1B2C_DISPOSABLE_PG17=PASS; ISSUANCE_REVOKE_ROLLBACK_RACE_MAIL_OFF");
  } finally {
    try {
      if (userId) await pool.query("DELETE FROM users WHERE id=$1 AND email=$2", [userId, email]);
    } finally {
      key.bytes.fill(0);
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error("AUTH01_R1B2C_DISPOSABLE_PG17=FAIL", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});

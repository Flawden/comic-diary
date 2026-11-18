/**
 * AUTH-01 / R1C2B2: exclusive recovery outbox claim/finalize, disposable PG17.
 * No provider, HTTP, key access, mail, scheduler or production DB.
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

type QueueRow = {
  id: number;
  password_reset_token_id: number;
  state: string;
  claim_id: string | null;
  attempt_count: number;
  claimed_at: Date | null;
  finalized_at: Date | null;
};

async function main(): Promise<void> {
  // The exact-target guard MUST precede any app DB import or query.
  const connectionString = requireExactDisposableCi();
  const [issuer, claimer] = await Promise.all([
    import("../src/modules/auth/password-reset-request-outbox-issue"),
    import("../src/modules/auth/password-reset-request-outbox-claim"),
  ]);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 4 });
  const key = { keyId: "ci_r1c2b2_only", bytes: randomBytes(32) };
  const email = `auth-r1c2b2-${randomUUID()}@example.invalid`;
  let userId: number | undefined;
  const issue = () => issuer.enqueuePasswordResetMailForUser({
    userId: userId!, publicOrigin: "https://comic-diary.invalid", key,
  });
  const queue = async () => (await pool.query<QueueRow>(
    `SELECT o.id,o.password_reset_token_id,o.state,o.claim_id,o.attempt_count,
            o.claimed_at,o.finalized_at
       FROM password_reset_mail_outbox o
       JOIN password_reset_tokens t ON t.id=o.password_reset_token_id
      WHERE t.user_id=$1 ORDER BY o.id`, [userId],
  )).rows;
  const last = async () => (await queue()).at(-1)!;
  const noWork = { ok: false, kind: "no_work" };

  try {
    const server = await pool.query<{ major: number }>(
      "SELECT current_setting('server_version_num')::int / 10000 AS major",
    );
    assert.equal(server.rows[0]?.major, 17, "PG17 required");
    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='password_reset_mail_outbox'
          AND column_name IN ('claim_id','attempt_count','claimed_at')`,
    );
    assert.deepEqual(cols.rows.map((r) => r.column_name).sort(),
      ["attempt_count", "claim_id", "claimed_at"]);

    const fixture = await pool.query<{ id: number }>(
      `INSERT INTO users (email,password_hash,role,is_active,email_verified_at,verification_required_at)
       VALUES ($1,$2,'USER',true,now(),now()) RETURNING id`,
      [email, "ci-fixture-not-a-real-password-hash"],
    );
    userId = fixture.rows[0]?.id;
    assert.ok(userId);

    // Two workers racing for the SAME READY row: exactly one durable claim.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const first = await last();
    assert.equal(first.state, "ready");
    const race = await Promise.all([
      claimer.claimPendingPasswordResetMailOnce(),
      claimer.claimPendingPasswordResetMailOnce(),
    ]);
    assert.equal(race.filter((r) => r.ok).length, 1, "only one worker may claim");
    assert.equal(race.filter((r) => !r.ok).length, 1);
    const a = race.find((r) => r.ok);
    if (!a || !a.ok) throw new Error("race failed to produce a claim");
    assert.equal(a.outboxId, first.id);
    assert.match(a.claimId, /^[A-Za-z0-9_-]{32}$/);
    assert.deepEqual(Object.keys(a).sort(), ["claimId", "ok", "outboxId"]);
    const firstClaimed = await last();
    assert.equal(firstClaimed.state, "in_flight");
    assert.equal(firstClaimed.attempt_count, 1);
    assert.equal(firstClaimed.claim_id, a.claimId);
    assert.ok(firstClaimed.claimed_at);
    assert.equal(firstClaimed.finalized_at, null);
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), noWork,
      "in_flight can never be claimed twice");

    // Forged, mismatched or invalid finalization must not mutate the row.
    assert.equal(await claimer.finalizeClaimedPasswordResetMail({
      outboxId: a.outboxId, claimId: randomBytes(24).toString("base64url"), result: "accepted",
    }), false);
    assert.equal(await claimer.finalizeClaimedPasswordResetMail({
      outboxId: a.outboxId, claimId: a.claimId, result: "retry" as "accepted",
    }), false);
    assert.equal((await last()).state, "in_flight");
    assert.equal(await claimer.finalizeClaimedPasswordResetMail({
      outboxId: a.outboxId, claimId: a.claimId, result: "accepted",
    }), true);
    assert.equal((await last()).state, "accepted");
    assert.ok((await last()).finalized_at);
    assert.equal(await claimer.finalizeClaimedPasswordResetMail({
      outboxId: a.outboxId, claimId: a.claimId, result: "accepted",
    }), false, "replay is forbidden");
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), noWork);

    // Unverified mailbox invalidates READY before anyone can send.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [userId]);
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), noWork);
    assert.equal((await last()).state, "expired");
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [userId]);

    // Reverified mailbox AFTER token issuance invalidates the old challenge.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    await pool.query("UPDATE users SET email_verified_at=now()+interval '1 minute' WHERE id=$1", [userId]);
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), noWork);
    assert.equal((await last()).state, "expired");
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [userId]);

    // A token with <= 60 seconds left is never eligible for claim.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const near = await last();
    await pool.query(
      "UPDATE password_reset_tokens SET expires_at=now()+interval '30 seconds' WHERE id=$1",
      [near.password_reset_token_id],
    );
    await pool.query(
      "UPDATE password_reset_mail_outbox SET expires_at=(SELECT expires_at FROM password_reset_tokens WHERE id=$2) WHERE id=$1",
      [near.id, near.password_reset_token_id],
    );
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), noWork);
    assert.equal((await last()).state, "expired");

    // An invalidated token is expired before claim.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const revoked = await last();
    await pool.query("UPDATE password_reset_tokens SET revoked_at=now() WHERE id=$1",
      [revoked.password_reset_token_id]);
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), noWork);
    assert.equal((await last()).state, "expired");

    // New issuance revokes the token but NEVER requeues an existing in_flight.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const oldClaim = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(oldClaim.ok, true);
    if (!oldClaim.ok) throw new Error("claim failed");
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const rows = await queue();
    const old = rows.find((r) => r.id === oldClaim.outboxId)!;
    assert.equal(old.state, "in_flight");
    assert.equal(old.attempt_count, 1);
    const next = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(next.ok, true);
    if (!next.ok) throw new Error("next claim failed");
    assert.notEqual(oldClaim.outboxId, next.outboxId);
    assert.equal(await claimer.finalizeClaimedPasswordResetMail({
      outboxId: oldClaim.outboxId, claimId: oldClaim.claimId, result: "uncertain",
    }), true);
    assert.equal(await claimer.finalizeClaimedPasswordResetMail({
      outboxId: next.outboxId, claimId: oldClaim.claimId, result: "rejected",
    }), false);
    assert.equal(await claimer.finalizeClaimedPasswordResetMail({
      outboxId: next.outboxId, claimId: next.claimId, result: "rejected",
    }), true);
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), noWork);
    const final = await queue();
    assert.equal(final.find((r) => r.id === oldClaim.outboxId)?.state, "uncertain");
    assert.equal(final.find((r) => r.id === next.outboxId)?.state, "rejected");
    assert.ok(final.every((r) => r.state !== "ready"));

    console.log("AUTH01_R1C2B2_DISPOSABLE_PG17=PASS; EXCLUSIVE_CLAIM_FINALIZE_REVOKE_RACE_NO_MAIL");
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
  console.error("AUTH01_R1C2B2_DISPOSABLE_PG17=FAIL", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
